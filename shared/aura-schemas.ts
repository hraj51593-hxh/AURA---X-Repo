import { z } from "zod";
import { isValidDateOnly } from "./goal-dates";

export const goalInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(8).max(5000),
  category: z.string().trim().min(2).max(80),
  skillLevel: z.string().trim().min(2).max(80),
  durationDays: z.number().int().min(1).max(730),
  startDate: z.string().refine(isValidDateOnly, "Choose a valid calendar start date."),
  minutesPerDay: z.number().int().min(5).max(1440),
  successCriteria: z.string().trim().max(3000).optional().nullable(),
  constraints: z.string().trim().max(3000).optional().nullable(),
  learningStyle: z.string().trim().max(160).optional().nullable(),
  budgetPreference: z.string().trim().max(160).optional().nullable(),
});

export const resourceKindSchema = z.enum([
  "documentation", "tutorial", "article", "video", "practice", "project", "other",
]);

export const roadmapResourceSchema = z.object({
  title: z.string().min(2).max(180),
  type: resourceKindSchema,
  url: z.string().url().max(2048).nullable(),
  description: z.string().min(5).max(1200),
});

export const roadmapTaskSchema = z.object({
  title: z.string().min(2).max(180),
  description: z.string().min(5).max(3000),
  priority: z.enum(["low", "medium", "high"]),
  estimatedMinutes: z.number().int().min(5).max(1440),
  dayOffset: z.number().int().min(0).max(729),
  requiredSkill: z.string().max(160).nullable(),
  completionCriteria: z.string().min(5).max(2000),
  resources: z.array(roadmapResourceSchema).max(5),
});

export const roadmapMilestoneSchema = z.object({
  weekNumber: z.number().int().min(1).max(105),
  title: z.string().min(2).max(180),
  description: z.string().min(5).max(3000),
  successCriteria: z.string().min(5).max(2000),
  tasks: z.array(roadmapTaskSchema).min(1).max(14),
});

export const roadmapSchema = z.object({
  refinedGoal: z.string().min(5).max(2000),
  assumptions: z.array(z.string().min(2).max(500)).max(12),
  weeklyObjectives: z.array(z.string().min(2).max(500)).min(1).max(105),
  milestones: z.array(roadmapMilestoneSchema).min(1).max(12),
}).superRefine((value, context) => {
  const allOffsets = value.milestones.flatMap(milestone => milestone.tasks.map(task => task.dayOffset));
  if (allOffsets.length > 220) context.addIssue({ code: "custom", path: ["milestones"], message: "A roadmap may contain no more than 220 tasks." });
});

export type GoalInput = z.infer<typeof goalInputSchema>;
export type RoadmapPayload = z.infer<typeof roadmapSchema>;
