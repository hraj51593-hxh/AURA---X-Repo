import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";
import { goalInputSchema, roadmapSchema, type GoalInput, type RoadmapPayload } from "@shared/aura-schemas";

const ROADMAP_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["refinedGoal", "assumptions", "weeklyObjectives", "milestones"],
  properties: {
    refinedGoal: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    weeklyObjectives: { type: "array", maxItems: 105, items: { type: "string" } },
    milestones: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["weekNumber", "title", "description", "successCriteria", "tasks"],
        properties: {
          weekNumber: { type: "integer", minimum: 1, maximum: 105 },
          title: { type: "string" },
          description: { type: "string" },
          successCriteria: { type: "string" },
          tasks: {
            type: "array",
            minItems: 1,
            maxItems: 14,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "description", "priority", "estimatedMinutes", "dayOffset", "requiredSkill", "completionCriteria", "resources"],
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                priority: { type: "string", enum: ["low", "medium", "high"] },
                estimatedMinutes: { type: "integer" },
                dayOffset: { type: "integer", minimum: 0, maximum: 729 },
                requiredSkill: { type: ["string", "null"] },
                completionCriteria: { type: "string" },
                resources: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "type", "url", "description"],
                    properties: {
                      title: { type: "string" },
                      type: { type: "string", enum: ["documentation", "tutorial", "article", "video", "practice", "project", "other"] },
                      url: { type: ["string", "null"] },
                      description: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function generateRoadmap(input: GoalInput): Promise<RoadmapPayload> {
  const goal = goalInputSchema.parse(input);
  try {
    const response = await invokeLLM({
      model: "gpt-6-luna",
      reasoning: { effort: "low" },
      outputSchema: { name: "aura_roadmap", strict: true, schema: ROADMAP_JSON_SCHEMA as Record<string, unknown> },
      messages: [
        {
          role: "system",
          content: [
            "You are AURA-X, a careful goal-planning coach. Produce one realistic, personalized roadmap as JSON matching the supplied schema.",
            "Respect the user's available minutes per day, skill level, duration, constraints, learning style, and budget preference. Avoid guaranteed outcomes, inflated schedules, shame, or claims that real-world learning is verified.",
            "Honor the selected start date. Create up to 12 milestones (fewer for short goals) and a manageable set of scheduled learning/practice tasks; for long plans, stage work across early, middle and late parts of the full duration rather than front-loading it. Never exceed 220 tasks. Each task must fit the daily time budget or explicitly explain why a longer multi-session activity is split.",
            "Use dayOffset as a zero-based day from the start, between 0 and durationDays - 1. Keep weekNumber consistent with task day offsets. Each milestone should have a measurable completion criterion.",
            "Do not invent, infer, or provide resource URLs. Return an empty resources array for every task; AURA-X attaches resources only from real server-side web-search results.",
            "Include assumptions when user details are missing. Use concise, practical tasks with observable completion criteria.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify(goal) },
      ],
    });
    const message = response.choices?.[0]?.message?.content;
    const text = typeof message === "string" ? message : Array.isArray(message) ? message.map(part => part.type === "text" ? part.text : "").join("\n") : "";
    if (!text.trim()) throw new Error("The AI service returned no roadmap content.");
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { throw new Error("The AI service returned invalid JSON; please retry."); }
    const valid = roadmapSchema.safeParse(parsed);
    if (!valid.success) throw new Error("The AI roadmap did not meet AURA-X's validation rules; please retry.");
    const maxDay = goal.durationDays - 1;
    const minutesByDay = new Map<number, number>();
    let totalTasks = 0;
    for (const milestone of valid.data.milestones) {
      totalTasks += milestone.tasks.length;
      if (totalTasks > 220) throw new Error("The AI roadmap included more than 220 tasks; please retry.");
      if (milestone.weekNumber > Math.ceil(goal.durationDays / 7) || milestone.tasks.some(task => task.dayOffset > maxDay)) {
        throw new Error("The AI roadmap included dates outside the goal duration; please retry.");
      }
      for (const task of milestone.tasks) {
        if (task.estimatedMinutes > goal.minutesPerDay) {
          throw new Error("The AI roadmap scheduled an activity longer than the user's daily time budget; please retry.");
        }
        const scheduledMinutes = (minutesByDay.get(task.dayOffset) ?? 0) + task.estimatedMinutes;
        if (scheduledMinutes > goal.minutesPerDay) {
          throw new Error("The AI roadmap scheduled more work than the user's daily time budget; please retry.");
        }
        minutesByDay.set(task.dayOffset, scheduledMinutes);
      }
    }
    return {
      ...valid.data,
      milestones: valid.data.milestones.map(milestone => ({
        ...milestone,
        tasks: milestone.tasks.map(task => ({ ...task, resources: [] })),
      })),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "AI service unavailable";
    console.error("[AURA-X] Roadmap generation failed:", detail.slice(0, 500));
    if (/not configured/i.test(detail)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI roadmap generation is not configured in this project yet. Your goal draft is saved; please retry after the AI service is available." });
    }
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AURA-X couldn't generate a valid roadmap right now. Your goal draft is saved. Please try again shortly." });
  }
}
