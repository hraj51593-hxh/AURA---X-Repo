import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { attendanceRecords, goals } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { addDateOnlyDays, dateOnlyFromTimestamp, isValidDateOnly } from "@shared/goal-dates";

const database = async () => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The application database is unavailable." });
  return db;
};
const parseDay = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dayInZone = (timeZone?: string) => {
  const zone = timeZone || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Use a valid time zone for attendance." });
  }
};
const getGoalStart = (goal: { startDate: string | null; startedAt: Date }) => goal.startDate ?? dateOnlyFromTimestamp(goal.startedAt);
const assertGoalDay = (day: string, goal: { startDate: string | null; startedAt: Date; durationDays: number }, today: string) => {
  if (!isValidDateOnly(day)) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid calendar date." });
  const start = getGoalStart(goal);
  const end = addDateOnlyDays(start, goal.durationDays - 1);
  if (day < start || day > end) throw new TRPCError({ code: "BAD_REQUEST", message: "Attendance must be within this goal's start date and duration." });
  if (day > today) throw new TRPCError({ code: "BAD_REQUEST", message: "Future attendance cannot be recorded." });
};

export const attendanceRouter = router({
  list: protectedProcedure.input(z.object({ goalId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await database();
    const [goal] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.id))).limit(1);
    if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found." });
    return db.select({ id: attendanceRecords.id, day: attendanceRecords.day, status: attendanceRecords.status, note: attendanceRecords.note }).from(attendanceRecords).where(and(eq(attendanceRecords.goalId, goal.id), eq(attendanceRecords.userId, ctx.user.id))).orderBy(attendanceRecords.day);
  }),
  record: protectedProcedure.input(z.object({ goalId: z.number().int().positive(), day: z.string(), status: z.enum(["showed_up", "missed"]), timeZone: z.string().max(100).optional(), note: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const [goal] = await db.select({ id: goals.id, startDate: goals.startDate, startedAt: goals.startedAt, durationDays: goals.durationDays }).from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.id))).limit(1);
    if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found." });
    const parsedDay = parseDay(input.day);
    if (Number.isNaN(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== input.day) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid calendar date." });
    assertGoalDay(input.day, goal, dayInZone(input.timeZone));
    await db.insert(attendanceRecords).values({ userId: ctx.user.id, goalId: goal.id, day: parsedDay, status: input.status, note: input.note?.trim() || null }).onDuplicateKeyUpdate({ set: { status: input.status, note: input.note?.trim() || null, updatedAt: new Date() } });
    return { success: true };
  }),
  clear: protectedProcedure.input(z.object({ goalId: z.number().int().positive(), day: z.string(), timeZone: z.string().max(100).optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const [goal] = await db.select({ id: goals.id, startDate: goals.startDate, startedAt: goals.startedAt, durationDays: goals.durationDays }).from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, ctx.user.id))).limit(1);
    if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found." });
    const day = parseDay(input.day);
    if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== input.day) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid calendar date." });
    assertGoalDay(input.day, goal, dayInZone(input.timeZone));
    await db.delete(attendanceRecords).where(and(eq(attendanceRecords.goalId, goal.id), eq(attendanceRecords.userId, ctx.user.id), eq(attendanceRecords.day, day)));
    return { success: true };
  }),
});
