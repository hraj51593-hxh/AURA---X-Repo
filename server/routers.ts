import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { goalInputSchema } from "@shared/aura-schemas";
import { addDateOnlyDays, dateOnlyFromTimestamp } from "@shared/goal-dates";
import { activityLogs, goals, learningResources, milestones, planAdjustments, roadmaps, sessions, taskProgress, tasks, users } from "../drizzle/schema";
import { getDb } from "./db";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { clearSessionCookie, createSession, destroySession, enforceRateLimit, hashPassword, normalizeEmail, safeUser, verifyPassword } from "./services/auth";
import { generateRoadmap } from "./services/roadmap-ai";
import { learningRouter } from "./routers/learning";
import { attendanceRouter } from "./routers/attendance";
import { auriVoiceRouter } from "./routers/auri-voice";

const getDatabase = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The application database is unavailable. Please try again later." });
  return db;
};

const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user ? safeUser(ctx.user) : null),
  register: publicProcedure.input(z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(320), password: z.string().min(10).max(128) })).mutation(async ({ ctx, input }) => {
    enforceRateLimit(`register:${ctx.req.ip}`, 5, 60 * 60 * 1000);
    const db = await getDatabase();
    const email = normalizeEmail(input.email);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists. Try signing in instead." });
    const passwordHash = await hashPassword(input.password);
    const inserted = await db.insert(users).values({ name: input.name.trim(), email, passwordHash, loginMethod: "password", lastSignedIn: new Date() }).$returningId();
    const userId = inserted[0]?.id;
    if (!userId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your account could not be created. Please try again." });
    await createSession(userId, ctx.req, ctx.res);
    return { success: true, user: { id: userId, name: input.name.trim(), email, role: "user" as const } };
  }),
  login: publicProcedure.input(z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
    enforceRateLimit(`login:${ctx.req.ip}`, 10, 15 * 60 * 1000);
    const db = await getDatabase();
    const email = normalizeEmail(input.email);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Email or password is incorrect." });
    }
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
    await createSession(user.id, ctx.req, ctx.res);
    return { success: true, user: safeUser({ ...user, lastSignedIn: new Date() }) };
  }),
  updateProfile: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120) })).mutation(async ({ ctx, input }) => {
    const db = await getDatabase();
    await db.update(users).set({ name: input.name.trim(), updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
    return { success: true, name: input.name.trim() };
  }),
  changePassword: protectedProcedure.input(z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10).max(128) })).mutation(async ({ ctx, input }) => {
    const db = await getDatabase();
    const [account] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!account?.passwordHash || !(await verifyPassword(input.currentPassword, account.passwordHash))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
    await db.update(users).set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
    await db.delete(sessions).where(eq(sessions.userId, ctx.user.id));
    await createSession(ctx.user.id, ctx.req, ctx.res);
    return { success: true };
  }),
  deleteAccount: protectedProcedure.input(z.object({ confirmed: z.literal(true) })).mutation(async ({ ctx }) => {
    const db = await getDatabase();
    await db.delete(users).where(eq(users.id, ctx.user.id));
    await destroySession(ctx.req);
    clearSessionCookie(ctx.req, ctx.res);
    return { success: true };
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    await destroySession(ctx.req);
    clearSessionCookie(ctx.req, ctx.res);
    return { success: true } as const;
  }),
  requestPasswordReset: publicProcedure.input(z.object({ email: z.string().trim().email().max(320) })).mutation(async () => {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Password reset email delivery is not configured for this project yet. Contact the project owner for account help." });
  }),
});

const goalRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDatabase();
    const ownGoals = await db.select().from(goals).where(eq(goals.userId, ctx.user.id)).orderBy(desc(goals.updatedAt));
    if (!ownGoals.length) return [];
    const ids = ownGoals.map(goal => goal.id);
    const [allTasks, progress, allMilestones, allRoadmaps, resources, adjustments] = await Promise.all([
      db.select().from(tasks).where(inArray(tasks.goalId, ids)).orderBy(tasks.dayOffset, tasks.sortOrder),
      db.select().from(taskProgress).where(eq(taskProgress.userId, ctx.user.id)),
      db.select().from(milestones).where(inArray(milestones.roadmapId, (await db.select({ id: roadmaps.id }).from(roadmaps).where(inArray(roadmaps.goalId, ids))).map(item => item.id))),
      db.select().from(roadmaps).where(inArray(roadmaps.goalId, ids)).orderBy(desc(roadmaps.version)),
      db.select().from(learningResources).where(inArray(learningResources.goalId, ids)),
      db.select().from(planAdjustments).where(and(eq(planAdjustments.userId, ctx.user.id), eq(planAdjustments.status, "pending"))).orderBy(desc(planAdjustments.createdAt)),
    ]);
    return ownGoals.map(goal => {
      const roadmap = allRoadmaps.find(item => item.goalId === goal.id && item.status !== "superseded");
      const roadMapMilestones = roadmap ? allMilestones.filter(item => item.roadmapId === roadmap.id) : [];
      const activeMilestoneIds = new Set(roadMapMilestones.map(item => item.id));
      const goalTasks = allTasks.filter(item => item.goalId === goal.id && item.milestoneId !== null && activeMilestoneIds.has(item.milestoneId)).map(task => ({ ...task, progress: progress.find(item => item.taskId === task.id) ?? null }));
      const activeTaskIds = new Set(goalTasks.map(task => task.id));
      const goalResources = resources.filter(item => item.goalId === goal.id && (item.taskId === null || activeTaskIds.has(item.taskId)));
      return {
        ...goal,
        roadmap: roadmap ? { ...roadmap, assumptions: roadmap.assumptions, weeklyObjectives: roadmap.weeklyObjectives, milestones: roadMapMilestones } : null,
        tasks: goalTasks,
        resources: goalResources,
        adjustments: adjustments.filter(item => item.goalId === goal.id),
      };
    });
  }),
  createDraft: protectedProcedure.input(goalInputSchema).mutation(async ({ ctx, input }) => {
    const db = await getDatabase();
    const insert = await db.insert(goals).values({
      userId: ctx.user.id,
      title: input.title,
      description: input.description,
      category: input.category,
      skillLevel: input.skillLevel,
      durationDays: input.durationDays,
      startDate: input.startDate,
      minutesPerDay: input.minutesPerDay,
      successCriteria: input.successCriteria || null,
      constraints: input.constraints || null,
      learningStyle: input.learningStyle || null,
      budgetPreference: input.budgetPreference || null,
      status: "draft",
      startedAt: new Date(`${input.startDate}T00:00:00.000Z`),
      targetAt: new Date(`${addDateOnlyDays(input.startDate, input.durationDays - 1)}T00:00:00.000Z`),
    }).$returningId();
    const goalId = insert[0]?.id;
    if (!goalId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The goal draft could not be saved." });
    await db.insert(activityLogs).values({ userId: ctx.user.id, goalId, eventType: "goal_created", summary: "Created a goal draft" });
    return { id: goalId };
  }),
  generate: protectedProcedure.input(z.object({ goalId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    enforceRateLimit(`roadmap:${ctx.user.id}`, 5, 60 * 60 * 1000);
    const db = await getDatabase();
    const [goal] = await db.select().from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.id))).limit(1);
    if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found." });
    const payload = await generateRoadmap({
      title: goal.title,
      description: goal.description,
      category: goal.category,
      skillLevel: goal.skillLevel,
      durationDays: goal.durationDays,
      startDate: goal.startDate ?? dateOnlyFromTimestamp(goal.startedAt),
      minutesPerDay: goal.minutesPerDay,
      successCriteria: goal.successCriteria,
      constraints: goal.constraints,
      learningStyle: goal.learningStyle,
      budgetPreference: goal.budgetPreference,
    });
    await db.transaction(async tx => {
      const previous = await tx.select({ id: roadmaps.id }).from(roadmaps).where(and(eq(roadmaps.goalId, goal.id), eq(roadmaps.status, "active")));
      for (const item of previous) await tx.update(roadmaps).set({ status: "superseded" }).where(eq(roadmaps.id, item.id));
      const [current] = await tx.select({ version: sql<number>`coalesce(max(${roadmaps.version}), 0) + 1` }).from(roadmaps).where(eq(roadmaps.goalId, goal.id));
      const newRoadmap = await tx.insert(roadmaps).values({ goalId: goal.id, version: Number(current?.version || 1), refinedGoal: payload.refinedGoal, assumptions: payload.assumptions, weeklyObjectives: payload.weeklyObjectives, status: "active" }).$returningId();
      const roadmapId = newRoadmap[0]?.id;
      if (!roadmapId) throw new Error("Roadmap persistence failed");
      for (const [milestoneIndex, milestone] of payload.milestones.entries()) {
        const [savedMilestone] = await tx.insert(milestones).values({ roadmapId, weekNumber: milestone.weekNumber, title: milestone.title, description: milestone.description, successCriteria: milestone.successCriteria, status: milestoneIndex === 0 ? "active" : "upcoming", sortOrder: milestoneIndex }).$returningId();
        if (!savedMilestone?.id) throw new Error("Milestone persistence failed");
        for (const [taskIndex, task] of milestone.tasks.entries()) {
          const goalStartDate = goal.startDate ?? dateOnlyFromTimestamp(goal.startedAt);
          const dueAt = new Date(`${addDateOnlyDays(goalStartDate, task.dayOffset)}T00:00:00.000Z`);
          const [savedTask] = await tx.insert(tasks).values({ goalId: goal.id, milestoneId: savedMilestone.id, title: task.title, description: task.description, priority: task.priority, estimatedMinutes: task.estimatedMinutes, dayOffset: task.dayOffset, dueAt, requiredSkill: task.requiredSkill, completionCriteria: task.completionCriteria, sortOrder: taskIndex }).$returningId();
          if (!savedTask?.id) throw new Error("Task persistence failed");
          for (const resource of task.resources) {
            if (resource.url && !resource.url.startsWith("https://")) continue;
            await tx.insert(learningResources).values({ goalId: goal.id, taskId: savedTask.id, title: resource.title, type: resource.type, url: resource.url, description: resource.description, urlVerified: false });
          }
        }
      }
      await tx.update(goals).set({ status: "active", updatedAt: new Date() }).where(and(eq(goals.id, goal.id), eq(goals.userId, ctx.user.id)));
      await tx.insert(activityLogs).values({ userId: ctx.user.id, goalId: goal.id, eventType: "roadmap_generated", summary: "Generated and saved an AI roadmap", details: { version: Number(current?.version || 1), taskCount: payload.milestones.reduce((sum, item) => sum + item.tasks.length, 0) } });
    });
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({ goalId: z.number().int().positive(), title: z.string().trim().min(3).max(160).optional(), description: z.string().trim().min(8).max(5000).optional(), successCriteria: z.string().trim().max(3000).nullable().optional(), constraints: z.string().trim().max(3000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const { goalId, ...changes } = input;
    if (!Object.keys(changes).length) throw new TRPCError({ code: "BAD_REQUEST", message: "Provide at least one field to update." });
    const db = await getDatabase();
    const result = await db.update(goals).set({ ...changes, updatedAt: new Date() }).where(and(eq(goals.id, goalId), eq(goals.userId, ctx.user.id)));
    if (!result[0]?.affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found." });
    await db.insert(activityLogs).values({ userId: ctx.user.id, goalId, eventType: "goal_updated", summary: "Updated goal details" });
    return { success: true };
  }),
  setStatus: protectedProcedure.input(z.object({ goalId: z.number().int().positive(), status: z.enum(["active", "paused", "completed", "archived"]) })).mutation(async ({ ctx, input }) => {
    const db = await getDatabase();
    const result = await db.update(goals).set({ status: input.status, updatedAt: new Date() }).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.id)));
    if (!result[0]?.affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found." });
    await db.insert(activityLogs).values({ userId: ctx.user.id, goalId: input.goalId, eventType: "goal_status_changed", summary: `Goal ${input.status}` });
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ goalId: z.number().int().positive(), confirmed: z.literal(true) })).mutation(async ({ ctx, input }) => {
    const db = await getDatabase();
    const result = await db.delete(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.id)));
    if (!result[0]?.affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found." });
    return { success: true };
  }),
});

const taskRouter = router({
  setProgress: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), completed: z.boolean().optional(), status: z.enum(["todo", "completed", "missed"]).optional(), notes: z.string().max(3000).optional(), evidence: z.string().max(3000).optional(), actualMinutes: z.number().int().min(0).max(1440).optional() }).refine(value => value.completed !== undefined || value.status !== undefined, "Provide a task status." )).mutation(async ({ ctx, input }) => {
    const db = await getDatabase();
    const [ownedTask] = await db.select({ id: tasks.id, goalId: tasks.goalId }).from(tasks).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(tasks.id, input.taskId), eq(goals.userId, ctx.user.id))).limit(1);
    if (!ownedTask) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
    const status = input.status ?? (input.completed ? "completed" : "todo");
    const completedAt = status === "completed" ? new Date() : null;
    await db.insert(taskProgress).values({ taskId: input.taskId, userId: ctx.user.id, status, notes: input.notes || null, evidence: input.evidence || null, actualMinutes: input.actualMinutes ?? null, completedAt }).onDuplicateKeyUpdate({ set: { status, notes: input.notes || null, evidence: input.evidence || null, actualMinutes: input.actualMinutes ?? null, completedAt, updatedAt: new Date() } });
    const eventType = status === "completed" ? "task_completed" : status === "missed" ? "task_missed" : "task_reopened";
    const summary = status === "completed" ? "Marked a task complete" : status === "missed" ? "Recorded a missed task" : "Reopened a task";
    await db.insert(activityLogs).values({ userId: ctx.user.id, goalId: ownedTask.goalId, eventType, summary, details: { taskId: input.taskId } });
    return { success: true, status };
  }),
});

const resourceRouter = router({
  markReviewed: protectedProcedure.input(z.object({ resourceId: z.number().int().positive(), reviewed: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await getDatabase();
    const result = await db.update(learningResources).set({ reviewedAt: input.reviewed ? new Date() : null }).where(and(eq(learningResources.id, input.resourceId), sql`${learningResources.goalId} in (select ${goals.id} from ${goals} where ${goals.userId} = ${ctx.user.id})`));
    if (!result[0]?.affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found." });
    return { success: true };
  }),
  markBookmarked: protectedProcedure.input(z.object({ resourceId: z.number().int().positive(), bookmarked: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await getDatabase();
    const result = await db.update(learningResources).set({ bookmarkedAt: input.bookmarked ? new Date() : null }).where(and(eq(learningResources.id, input.resourceId), sql`${learningResources.goalId} in (select ${goals.id} from ${goals} where ${goals.userId} = ${ctx.user.id})`));
    if (!result[0]?.affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found." });
    return { success: true };
  }),
});

export const appRouter = router({
  system: router({ health: publicProcedure.query(() => ({ ok: true })) }),
  auth: authRouter,
  goals: goalRouter,
  learning: learningRouter,
  attendance: attendanceRouter,
  tasks: taskRouter,
  resources: resourceRouter,
  auriVoice: auriVoiceRouter,
  analytics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDatabase();
    const owned = await db.select({ id: goals.id, status: goals.status }).from(goals).where(eq(goals.userId, ctx.user.id));
    if (!owned.length) return { activeGoals: 0, totalGoals: 0, completedTasks: 0, totalTasks: 0, progressPercent: 0, weeklyProgress: [], upcomingTasks: [], recentActivity: [] };
    const ids = owned.map(goal => goal.id);
    const [allTasks, allProgress, upcomingTasks, recentActivity] = await Promise.all([
      db.select({ id: tasks.id, title: tasks.title, goalId: tasks.goalId, dueAt: tasks.dueAt, estimatedMinutes: tasks.estimatedMinutes }).from(tasks).innerJoin(milestones, eq(tasks.milestoneId, milestones.id)).innerJoin(roadmaps, eq(milestones.roadmapId, roadmaps.id)).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(goals.userId, ctx.user.id), eq(roadmaps.status, "active"))).orderBy(tasks.dueAt).limit(220),
      db.select().from(taskProgress).where(eq(taskProgress.userId, ctx.user.id)),
      db.select({ id: tasks.id, title: tasks.title, goalId: tasks.goalId, dueAt: tasks.dueAt, estimatedMinutes: tasks.estimatedMinutes }).from(tasks).innerJoin(milestones, eq(tasks.milestoneId, milestones.id)).innerJoin(roadmaps, eq(milestones.roadmapId, roadmaps.id)).innerJoin(goals, eq(tasks.goalId, goals.id)).where(and(eq(goals.userId, ctx.user.id), eq(roadmaps.status, "active"), sql`${tasks.dueAt} >= now()`)).orderBy(tasks.dueAt).limit(6),
      db.select().from(activityLogs).where(eq(activityLogs.userId, ctx.user.id)).orderBy(desc(activityLogs.createdAt)).limit(8),
    ]);
    const activeTaskIds = new Set(allTasks.map(item => item.id));
    const progress = allProgress.filter(item => activeTaskIds.has(item.taskId));
    const completed = progress.filter(item => item.status === "completed");
    const completedTasks = completed.length;
    const weeklyProgress = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      const key = day.toISOString().slice(0, 10);
      return { date: key, completed: completed.filter(item => item.completedAt?.toISOString().slice(0, 10) === key).length };
    });
    const completedIds = new Set(completed.map(item => item.taskId));
    return { activeGoals: owned.filter(goal => goal.status === "active").length, totalGoals: owned.length, completedTasks, totalTasks: allTasks.length, progressPercent: allTasks.length ? Math.round(completedTasks / allTasks.length * 100) : 0, weeklyProgress, upcomingTasks: upcomingTasks.filter(task => !completedIds.has(task.id)), recentActivity };
  }),
});

export type AppRouter = typeof appRouter;
