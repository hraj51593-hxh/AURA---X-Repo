import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";

const quizQuestion = z.object({
  prompt: z.string().min(5).max(1200),
  options: z.array(z.string().min(1).max(500)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(5).max(1000),
});
export const quizPayloadSchema = z.object({
  title: z.string().min(3).max(180),
  instructions: z.string().min(5).max(1200),
  questions: z.array(quizQuestion).min(3).max(8),
});

const schema = {
  type: "object", additionalProperties: false, required: ["title", "instructions", "questions"],
  properties: {
    title: { type: "string" }, instructions: { type: "string" },
    questions: { type: "array", items: { type: "object", additionalProperties: false, required: ["prompt", "options", "correctIndex", "explanation"], properties: {
      prompt: { type: "string" }, options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } }, correctIndex: { type: "integer" }, explanation: { type: "string" },
    } } },
  },
} as const;

export async function generateQuiz(goal: { title: string; description: string; skillLevel: string }, content: string) {
  try {
    const response = await invokeLLM({
      model: "gpt-6-luna",
      reasoning: { effort: "low" },
      outputSchema: { name: "aura_assessment", strict: true, schema: schema as Record<string, unknown> },
      messages: [
        { role: "system", content: "Create a fair short learning quiz based only on the provided goal and roadmap topics. Return 3–5 clear multiple-choice questions with exactly four plausible options, one defensible correct answer and a brief explanation. Do not claim that this quiz proves real-world mastery." },
        { role: "user", content: JSON.stringify({ goal, roadmapTopics: content }) },
      ],
    });
    const raw = response.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map(part => part.type === "text" ? part.text : "").join("\n") : "";
    if (!text) throw new Error("No assessment content was returned.");
    const valid = quizPayloadSchema.safeParse(JSON.parse(text));
    if (!valid.success) throw new Error("The generated assessment failed validation.");
    return valid.data;
  } catch (error) {
    console.error("[AURA-X] Assessment generation failed:", error instanceof Error ? error.message.slice(0, 400) : "unknown error");
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AURA-X couldn't create an assessment right now. Please retry later." });
  }
}
