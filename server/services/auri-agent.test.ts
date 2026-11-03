import { describe, expect, it } from "vitest";
import type { ToolCall } from "../_core/llm";
import { AURI_AGENT_TOOLS, getAuriResponseLanguageGuidance, hasExplicitAuriIntent, parseAuriToolCall } from "./auri-agent";

function call(name: string, args: unknown): ToolCall {
  return { id: "call_test", type: "function", function: { name, arguments: JSON.stringify(args) } };
}

const sampleQuestions = Array.from({ length: 3 }, (_, index) => ({
  prompt: `Question number ${index + 1} asks what a learner should do.`,
  options: ["Option alpha", "Option beta", "Option gamma", "Option delta"],
  correctIndex: 1,
  explanation: "This explanation describes the correct learning choice.",
}));

describe("Auri agent tool boundary", () => {
  it("matches the user's English, Hindi or Hinglish style in Auto mode", () => {
    const guidance = getAuriResponseLanguageGuidance("auto");
    expect(guidance).toContain("natural English");
    expect(guidance).toContain("Hindi in Devanagari");
    expect(guidance).toContain("natural Hinglish");
  });

  it("exposes only the selected-goal actions documented in the UI", () => {
    expect(AURI_AGENT_TOOLS.map(tool => tool.function.name)).toEqual([
      "search_resources", "create_learning_check", "update_goal_fields", "set_task_progress", "propose_schedule_adjustment",
    ]);
  });

  it("accepts a validated learning check and rejects malformed JSON", () => {
    const parsed = parseAuriToolCall(call("create_learning_check", {
      title: "Python foundations",
      instructions: "Choose the best answer for each question.",
      questions: sampleQuestions,
    }));
    expect(parsed.ok).toBe(true);
    expect(parseAuriToolCall({ ...call("create_learning_check", {}), function: { name: "create_learning_check", arguments: "{" } }).ok).toBe(false);
  });

  it("validates optional goal-scoped resource search topics", () => {
    expect(parseAuriToolCall(call("search_resources", { query: "Python debugging" }))).toEqual({ ok: true, name: "search_resources", args: { query: "Python debugging" } });
    expect(parseAuriToolCall(call("search_resources", { query: "x" })).ok).toBe(false);
  });

  it("rejects injected ownership fields and unsupported tool names", () => {
    expect(parseAuriToolCall(call("set_task_progress", { taskId: 3, status: "completed", userId: 900 })).ok).toBe(false);
    expect(parseAuriToolCall(call("delete_goal", { goalId: 3 })).ok).toBe(false);
  });

  it("requires clear English action intent and blocks negated or ambiguous commands", () => {
    expect(hasExplicitAuriIntent("search_resources", "Please find me two real videos for this goal.")).toBe(true);
    expect(hasExplicitAuriIntent("search_resources", "I don't want any resources.")).toBe(false);
    expect(hasExplicitAuriIntent("update_goal_fields", "Change my goal title to daily drawing.")).toBe(true);
    expect(hasExplicitAuriIntent("set_task_progress", "Mark the task complete.")).toBe(true);
    expect(hasExplicitAuriIntent("set_task_progress", "Is the task complete?")).toBe(false);
    expect(hasExplicitAuriIntent("set_task_progress", "What task should I do next?")).toBe(false);
    expect(hasExplicitAuriIntent("propose_schedule_adjustment", "Suggest an adjustment to my schedule.")).toBe(true);
  });

  it("supports Hindi and Hinglish explicit requests without executing negated requests", () => {
    expect(hasExplicitAuriIntent("search_resources", "Mere goal ke liye video dhundho")).toBe(true);
    expect(hasExplicitAuriIntent("create_learning_check", "Mere goal par quiz banao")).toBe(true);
    expect(hasExplicitAuriIntent("update_goal_fields", "Mere goal ka title badal do")).toBe(true);
    expect(hasExplicitAuriIntent("set_task_progress", "Mera task complete ho gaya")).toBe(true);
    expect(hasExplicitAuriIntent("set_task_progress", "Task complete mat karo")).toBe(false);
    expect(hasExplicitAuriIntent("set_task_progress", "Kya task complete ho gaya?")).toBe(false);
    expect(hasExplicitAuriIntent("propose_schedule_adjustment", "Mere schedule ke liye adjustment suggest karo")).toBe(true);
  });
});
