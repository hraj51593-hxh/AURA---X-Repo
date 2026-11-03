import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Tool, ToolCall } from "../_core/llm";
import {
  activityLogs,
  assessmentAttempts,
  assessments,
  goals,
  learningResources,
  planAdjustments,
  taskProgress,
  tasks,
} from "../../drizzle/schema";
import { enforceRateLimit } from "./auth";
import { getResourceSearchStatus, searchLearningResources } from "./resource-search";
import type { getDb } from "../db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Goal = typeof goals.$inferSelect;

const questionSchema = z
  .object({
    prompt: z.string().trim().min(8).max(500),
    options: z.array(z.string().trim().min(1).max(200)).length(4),
    correctIndex: z.number().int().min(0).max(3),
    explanation: z.string().trim().min(8).max(1200),
  })
  .strict()
  .refine(question => new Set(question.options).size === 4, "Options must be distinct.");

const argumentSchemas = {
  search_resources: z.object({ taskId: z.number().int().positive().optional(), query: z.string().trim().min(3).max(140).optional() }).strict(),
  create_learning_check: z
    .object({
      title: z.string().trim().min(4).max(180),
      instructions: z.string().trim().min(8).max(1500),
      questions: z.array(questionSchema).min(3).max(5),
    })
    .strict(),
  update_goal_fields: z
    .object({
      title: z.string().trim().min(3).max(160).optional(),
      description: z.string().trim().min(8).max(5000).optional(),
      successCriteria: z.string().trim().min(3).max(3000).optional(),
      constraints: z.string().trim().min(3).max(3000).optional(),
    })
    .strict()
    .refine(value => Object.values(value).some(item => item !== undefined)),
  set_task_progress: z
    .object({
      taskId: z.number().int().positive(),
      status: z.enum(["todo", "completed", "missed"]),
      notes: z.string().trim().max(3000).optional(),
      evidence: z.string().trim().max(3000).optional(),
      actualMinutes: z.number().int().min(0).max(1440).optional(),
    })
    .strict(),
  propose_schedule_adjustment: z
    .object({
      reason: z.string().trim().min(8).max(1000),
      suggestedChange: z.string().trim().min(8).max(2000),
      evidenceSummary: z.string().trim().min(8).max(1200),
      taskUpdates: z
        .array(
          z
            .object({
              taskId: z.number().int().positive(),
              dayOffset: z.number().int().min(0).max(729),
            })
            .strict()
        )
        .max(5),
    })
    .strict(),
};

export type AuriToolName = keyof typeof argumentSchemas;
export type AuriToolOutcome = {
  name: AuriToolName | "unsupported";
  status: "completed" | "proposed" | "blocked" | "failed";
};
export type AuriResponseLanguage = "auto" | "en" | "hi" | "hinglish";
export function getAuriResponseLanguageGuidance(language: AuriResponseLanguage): string {
  switch (language) {
    case "auto":
      return "Mirror the user's latest message: answer in natural English for English, Hindi in Devanagari when they write Hindi, and natural Hinglish in the user's script/style when they code-switch or use Romanized Hindi. Do not force a translation or formal register; keep technical terms clear.";
    case "en":
      return "Write conversational answers in clear, natural English.";
    case "hi":
      return "Write conversational answers in natural Hindi, using Devanagari script.";
    case "hinglish":
      return "Write conversational answers in natural Hinglish, code-switching naturally between Hindi and English as speakers do; do not force formal Hindi or translate every technical term.";
  }
}

type AuriArguments = {
  search_resources: z.infer<typeof argumentSchemas.search_resources>;
  create_learning_check: z.infer<typeof argumentSchemas.create_learning_check>;
  update_goal_fields: z.infer<typeof argumentSchemas.update_goal_fields>;
  set_task_progress: z.infer<typeof argumentSchemas.set_task_progress>;
  propose_schedule_adjustment: z.infer<typeof argumentSchemas.propose_schedule_adjustment>;
};
type ParsedCall = { [K in AuriToolName]: { ok: true; name: K; args: AuriArguments[K] } }[AuriToolName] | { ok: false };

export const AURI_AGENT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "search_resources",
      description: "Search and save real learning resources for the selected goal, optionally focused on one of its tasks and a user-requested topic. Keep the search focus within the goal; omit query if the user gave no specific topic. Call only when the user explicitly asks you to find/search resources, tutorials, videos, articles, courses or links.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          taskId: { type: "integer", description: "An exact task ID from the supplied selected-goal context; omit for general goal resources." },
          query: { type: "string", minLength: 3, maxLength: 140, description: "Optional search focus explicitly requested by the user; results must still match the selected goal." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_learning_check",
      description: "Create one 3–5 question learning check for the selected goal. Call only when the user explicitly asks for a quiz, assessment or learning check. Questions must be based on the actual goal and task context supplied.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 4, maxLength: 180 },
          instructions: { type: "string", minLength: 8, maxLength: 1500 },
          questions: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                prompt: { type: "string", minLength: 8, maxLength: 500 },
                options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 200 } },
                correctIndex: { type: "integer", minimum: 0, maximum: 3 },
                explanation: { type: "string", minLength: 8, maxLength: 1200 },
              },
              required: ["prompt", "options", "correctIndex", "explanation"],
            },
          },
        },
        required: ["title", "instructions", "questions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_goal_fields",
      description: "Change only the selected goal's title, description, success criteria or constraints. Call only for an explicit user request to edit one of those fields. Never change its owner, status, dates, account or delete it.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 3, maxLength: 160 },
          description: { type: "string", minLength: 8, maxLength: 5000 },
          successCriteria: { type: "string", minLength: 3, maxLength: 3000 },
          constraints: { type: "string", minLength: 3, maxLength: 3000 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_task_progress",
      description: "Mark, miss or reopen one exact task in the selected goal. Call only when the user clearly says to record that status. Never invent completion evidence or choose another goal's task.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          taskId: { type: "integer", minimum: 1 },
          status: { type: "string", enum: ["todo", "completed", "missed"] },
          notes: { type: "string", maxLength: 3000 },
          evidence: { type: "string", maxLength: 3000 },
          actualMinutes: { type: "integer", minimum: 0, maximum: 1440 },
        },
        required: ["taskId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_schedule_adjustment",
      description: "Create an evidence-backed pending schedule suggestion for the user to accept or dismiss. Call only when they explicitly request a proposed schedule/plan adjustment. Never apply or silently change the schedule.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          reason: { type: "string", minLength: 8, maxLength: 1000 },
          suggestedChange: { type: "string", minLength: 8, maxLength: 2000 },
          evidenceSummary: { type: "string", minLength: 8, maxLength: 1200 },
          taskUpdates: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              properties: { taskId: { type: "integer", minimum: 1 }, dayOffset: { type: "integer", minimum: 0, maximum: 729 } },
              required: ["taskId", "dayOffset"],
            },
          },
        },
        required: ["reason", "suggestedChange", "evidenceSummary", "taskUpdates"],
      },
    },
  },
];

export function parseAuriToolCall(call: ToolCall): ParsedCall {
  const rawName = call.function.name;
  if (!Object.prototype.hasOwnProperty.call(argumentSchemas, rawName)) return { ok: false };
  const name = rawName as AuriToolName;
  const schema = argumentSchemas[name];
  let raw: unknown;
  try {
    raw = JSON.parse(call.function.arguments);
  } catch {
    return { ok: false };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, name, args: parsed.data } as ParsedCall : { ok: false };
}

export function hasExplicitAuriIntent(name: AuriToolName, message: string): boolean {
  const text = message.toLowerCase().replace(/[’‘]/g, "'");
  if (/\b(?:don't|do not|dont|never|no need to|avoid|nahi|nahin|nhi|mat)\b|नहीं|मत|कभी नहीं/iu.test(text)) return false;
  const adviceQuestion = /\b(?:should i|do i|can i|what if|how should i|is it okay if i)\b|क्या मुझे|मुझे क्या/iu.test(text);
  const resource = /\b(?:resources?|tutorials?|videos?|links?|articles?|courses?)\b|संसाधन|सामग्री|लिंक|वीडियो|ट्यूटोरियल|लेख|पाठ्यक्रम|मटेरियल/iu.test(text);
  const searchVerb = /\b(?:search|find|look up|look for|recommend|show|send|give|get|need|want|please)\b|dhoondho|dhoondo|dhundho|dhundo|dhund|khojo|khoj|खोज|ढूंढ|ढूँढ|सर्च|लाओ|लाकर|ढूंढो|खोजो/iu.test(text);
  const quiz = /\b(?:quiz|assessment|learning check|test)\b|क्विज़?|टेस्ट|परीक्षा|जांच/iu.test(text);
  const createVerb = /\b(?:create|make|generate|build|prepare|give me|want|need|chahiye|taiyar|banao|banado|bana)\b|बनाओ|बनाइए|बना दो|बनाकर|तैयार कर|बनाना/iu.test(text);
  const goalField = /\b(?:goal|title|description|success criteria|constraints?)\b|लक्ष्य|शीर्षक|विवरण|सफलता मानदंड|सीमाएं/iu.test(text);
  const changeVerb = /\b(?:update|change|edit|revise|rename|set|modify|badal|badlo)\b|अपडेट|बदल|बदलो|बदलें|सुधार|ठीक कर/iu.test(text);
  const taskWord = /\b(?:task|to-do|todo|action|work)\b|टास्क|काम|कार्य/iu.test(text);
  const progressWord = /\b(?:complete|completed|finish|finished|done|missed|reopen|re-open)\b|पूरा|हो गया|कर लिया|मिस|छूट गया|फिर से शुरू/iu.test(text);
  const taskCommand = /\b(?:mark|set|record|log|complete|finish|miss|reopen|re-open|please)\b|मार्क|दर्ज|पूरा कर|कर दिया|कर लिया|फिर से शुरू/iu.test(text);
  const scheduleAction = /\b(?:suggest|propose|adjust|reschedule|replan|revise)\b|सुझाव|प्रस्ताव|समायोजन|बदल|रीप्लान/iu.test(text);
  const scheduleTopic = /\b(?:plan|schedule|roadmap|tasks?)\b|योजना|समय-सारणी|शेड्यूल|रोडमैप|कार्यसूची/iu.test(text);
  switch (name) {
    case "search_resources":
      return resource && searchVerb;
    case "create_learning_check":
      return quiz && createVerb && !adviceQuestion;
    case "update_goal_fields":
      return goalField && changeVerb && !adviceQuestion;
    case "set_task_progress": {
      const interrogativeStatus = /\?/.test(text) && !/\b(?:please|mark|set|record|log)\b|कृपया|मार्क करो|दर्ज करो/iu.test(text);
      const firstPersonReport = /\b(?:i|i've|i have|we|we've|we have)\b.{0,70}\b(?:completed|finished|missed|done)\b/i.test(text) || /मैंने|मैं.{0,40}(?:पूरा|कर लिया|हो गया)/u.test(text) || /\b(?:mera|meri)\b.{0,50}\b(?:task|to-do|todo)\b.{0,70}\b(?:complete|completed|finished|done)\b/i.test(text) || /\b(?:mera|meri)\b.{0,50}(?:task|काम|कार्य|टास्क).{0,70}(?:पूरा|हो गया|कर लिया)/iu.test(text);
      return taskWord && progressWord && !adviceQuestion && !interrogativeStatus && (taskCommand || firstPersonReport);
    }
    case "propose_schedule_adjustment":
      return scheduleAction && scheduleTopic && !adviceQuestion;
  }
}

function actionReply(name: AuriToolName | "unsupported", status: AuriToolOutcome["status"], reply: string) {
  return { reply, action: { name, status } satisfies AuriToolOutcome };
}

export async function executeAuriTool(args: {
  db: Database;
  userId: number;
  goal: Goal;
  userMessage: string;
  call: ToolCall;
}) {
  const { db, userId, goal, userMessage, call } = args;
  const parsed = parseAuriToolCall(call);
  if (!parsed.ok) {
    return actionReply("unsupported", "blocked", "I couldn't safely validate that action, so I didn't change anything. Please restate one clear request.");
  }
  if (!hasExplicitAuriIntent(parsed.name, userMessage)) {
    return actionReply(parsed.name, "blocked", "I didn't change anything because I need a clear request before taking that action. Tell me exactly what you want me to do.");
  }

  switch (parsed.name) {
    case "search_resources": {
      enforceRateLimit(`web-search:${userId}`, 10, 60 * 60 * 1000);
      if (!getResourceSearchStatus().available) {
        return actionReply(parsed.name, "failed", "Live resource search is unavailable right now; I didn't save any results.");
      }
      let task: { id: number; title: string; description: string; requiredSkill: string | null; completionCriteria: string } | undefined;
      if (parsed.args.taskId !== undefined) {
        const [ownedTask] = await db.select({ id: tasks.id, title: tasks.title, description: tasks.description, requiredSkill: tasks.requiredSkill, completionCriteria: tasks.completionCriteria }).from(tasks).where(and(eq(tasks.id, parsed.args.taskId), eq(tasks.goalId, goal.id))).limit(1);
        if (!ownedTask) return actionReply(parsed.name, "blocked", "That task isn't part of the selected goal, so I didn't search or change anything.");
        task = ownedTask;
      }
      const query = [parsed.args.query, goal.title, goal.category, goal.skillLevel, goal.description, goal.successCriteria, task?.title, task?.requiredSkill].filter(Boolean).join(" ").slice(0, 600);
      const { provider, results } = await searchLearningResources(query, {
        userQuery: parsed.args.query || goal.title,
        goalTitle: goal.title,
        goalDescription: goal.description,
        goalCategory: goal.category,
        skillLevel: goal.skillLevel,
        successCriteria: goal.successCriteria,
        constraints: goal.constraints,
        learningStyle: goal.learningStyle,
        budgetPreference: goal.budgetPreference,
        taskTitle: task?.title,
        taskDescription: task?.description,
        requiredSkill: task?.requiredSkill,
        completionCriteria: task?.completionCriteria,
      });
      const existing = await db.select({ url: learningResources.url }).from(learningResources).where(eq(learningResources.goalId, goal.id));
      const known = new Set(existing.map(item => item.url).filter((url): url is string => Boolean(url)));
      const fresh = results.filter(item => item.url?.startsWith("https://") && !known.has(item.url));
      if (fresh.length) {
        await db.transaction(async tx => {
          for (const item of fresh) {
            await tx.insert(learningResources).values({ goalId: goal.id, taskId: task?.id ?? null, title: item.title.slice(0, 180), type: item.type, url: item.url, description: item.description, urlVerified: false });
          }
          await tx.insert(activityLogs).values({ userId, goalId: goal.id, eventType: "web_resources_searched", summary: `Auri saved ${fresh.length} live resources`, details: { provider, resultCount: fresh.length } });
        });
      }
      const sourceLinks = results.slice(0, 4).map((item, index) => `${index + 1}. ${item.title} — ${item.provider}: ${item.url}`).join("\n");
      return actionReply(parsed.name, "completed", results.length
        ? `I searched ${provider} and found ${results.length} matching provider results; ${fresh.length} new links were saved to “${goal.title}”. Check each destination and its access before relying on it.\n\n${sourceLinks}`
        : `I searched ${provider} but found no matching resources. I didn't invent or save any links.`);
    }
    case "create_learning_check": {
      enforceRateLimit(`assessment:${userId}`, 10, 60 * 60 * 1000);
      const [saved] = await db.insert(assessments).values({ goalId: goal.id, milestoneId: null, title: parsed.args.title, instructions: parsed.args.instructions, questions: parsed.args.questions }).$returningId();
      if (!saved?.id) return actionReply(parsed.name, "failed", "I couldn't save that learning check; no quiz was added.");
      await db.insert(activityLogs).values({ userId, goalId: goal.id, eventType: "assessment_created", summary: "Auri created an AI learning check", details: { assessmentId: saved.id, questionCount: parsed.args.questions.length } });
      return actionReply(parsed.name, "completed", `I created and saved “${parsed.args.title}” with ${parsed.args.questions.length} questions for “${goal.title}”. It is a self-check, not independent proof of mastery.`);
    }
    case "update_goal_fields": {
      const changes = parsed.args;
      const result = await db.update(goals).set({ ...changes, updatedAt: new Date() }).where(and(eq(goals.id, goal.id), eq(goals.userId, userId)));
      if (!result[0]?.affectedRows) return actionReply(parsed.name, "failed", "I couldn't update the selected goal; no changes were saved.");
      await db.insert(activityLogs).values({ userId, goalId: goal.id, eventType: "goal_updated", summary: "Updated goal details through Auri", details: { fields: Object.keys(changes) } });
      return actionReply(parsed.name, "completed", `I updated ${Object.keys(changes).join(", ")} for “${goal.title}”.`);
    }
    case "set_task_progress": {
      enforceRateLimit(`task-update:${userId}`, 30, 60 * 60 * 1000);
      const [ownedTask] = await db.select({ id: tasks.id, goalId: tasks.goalId, title: tasks.title }).from(tasks).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(tasks.id, parsed.args.taskId), eq(tasks.goalId, goal.id), eq(goals.userId, userId))).limit(1);
      if (!ownedTask) return actionReply(parsed.name, "blocked", "That task isn't part of the selected goal, so I didn't change its status.");
      const titleWords = ownedTask.title.toLowerCase().split(/\W+/).filter(word => word.length >= 4);
      const taskMentioned = /\b(task|to-do|todo|action)\b/i.test(userMessage) || titleWords.some(word => userMessage.toLowerCase().includes(word));
      if (!taskMentioned) return actionReply(parsed.name, "blocked", "I couldn't confidently match that request to the selected task, so I left its status unchanged. Mention the task by name or say “task”.");
      const completedAt = parsed.args.status === "completed" ? new Date() : null;
      await db.insert(taskProgress).values({ taskId: ownedTask.id, userId, status: parsed.args.status, notes: parsed.args.notes ?? null, evidence: parsed.args.evidence ?? null, actualMinutes: parsed.args.actualMinutes ?? null, completedAt }).onDuplicateKeyUpdate({ set: { status: parsed.args.status, notes: parsed.args.notes ?? null, evidence: parsed.args.evidence ?? null, actualMinutes: parsed.args.actualMinutes ?? null, completedAt, updatedAt: new Date() } });
      const eventType = parsed.args.status === "completed" ? "task_completed" : parsed.args.status === "missed" ? "task_missed" : "task_reopened";
      await db.insert(activityLogs).values({ userId, goalId: goal.id, eventType, summary: `Auri recorded task status: ${parsed.args.status}`, details: { taskId: ownedTask.id } });
      return actionReply(parsed.name, "completed", `I recorded “${ownedTask.title}” as ${parsed.args.status}. You can change it again from the task card.`);
    }
    case "propose_schedule_adjustment": {
      enforceRateLimit(`adjust:${userId}`, 5, 60 * 60 * 1000);
      const taskRows = await db.select({ id: tasks.id, dayOffset: tasks.dayOffset }).from(tasks).where(eq(tasks.goalId, goal.id)).limit(100);
      const taskIds = taskRows.map(task => task.id);
      const [progress, attempts] = await Promise.all([
        taskIds.length ? db.select({ taskId: taskProgress.taskId, status: taskProgress.status, actualMinutes: taskProgress.actualMinutes }).from(taskProgress).where(and(eq(taskProgress.userId, userId), inArray(taskProgress.taskId, taskIds))) : Promise.resolve([]),
        db.select({ scorePercent: assessmentAttempts.scorePercent }).from(assessmentAttempts).innerJoin(assessments, eq(assessmentAttempts.assessmentId, assessments.id)).where(and(eq(assessmentAttempts.userId, userId), eq(assessments.goalId, goal.id))).limit(8),
      ]);
      if (!progress.length && !attempts.length) {
        return actionReply(parsed.name, "blocked", "I need at least one saved task update or learning-check result before suggesting a change. Complete a task or learning check first.");
      }
      const openIds = new Set(taskRows.filter(task => !progress.some(row => row.taskId === task.id && row.status === "completed")).map(task => task.id));
      const safeUpdates = parsed.args.taskUpdates.filter(update => openIds.has(update.taskId) && update.dayOffset < goal.durationDays);
      const validRequestedIds = parsed.args.taskUpdates.every(update => taskRows.some(task => task.id === update.taskId));
      if (!validRequestedIds) return actionReply(parsed.name, "blocked", "The schedule proposal referenced an unknown task, so I didn't save it.");
      const [saved] = await db.insert(planAdjustments).values({ goalId: goal.id, userId, reason: parsed.args.reason, suggestedChange: parsed.args.suggestedChange, evidenceSummary: parsed.args.evidenceSummary, proposedSchedule: safeUpdates, status: "pending" }).$returningId();
      if (!saved?.id) return actionReply(parsed.name, "failed", "I couldn't save the schedule proposal; your plan has not changed.");
      await db.insert(activityLogs).values({ userId, goalId: goal.id, eventType: "plan_adjustment_suggested", summary: "Auri prepared a pending schedule suggestion", details: { adjustmentId: saved.id, movedTasks: safeUpdates.length } });
      return actionReply(parsed.name, "proposed", `I saved an evidence-based schedule suggestion for “${goal.title}”. Nothing changed automatically—review it in the goal workspace and accept or dismiss it.`);
    }
  }
}
