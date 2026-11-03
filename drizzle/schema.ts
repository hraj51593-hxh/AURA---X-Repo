import {
  boolean,
  date,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    // openId remains nullable for compatibility with the managed starter's OAuth records.
    openId: varchar("openId", { length: 64 }).unique(),
    name: varchar("name", { length: 120 }),
    email: varchar("email", { length: 320 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    loginMethod: varchar("loginMethod", { length: 64 }).default("password"),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => ({ emailUnique: uniqueIndex("users_email_unique").on(table.email) }),
);

export const sessions = mysqlTable(
  "aura_sessions",
  {
    tokenHash: varchar("tokenHash", { length: 64 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  },
  table => ({ userIndex: index("aura_sessions_user_idx").on(table.userId), expiryIndex: index("aura_sessions_expiry_idx").on(table.expiresAt) }),
);

export const goals = mysqlTable(
  "aura_goals",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    skillLevel: varchar("skillLevel", { length: 80 }).notNull(),
    durationDays: int("durationDays").notNull(),
    startDate: date("startDate", { mode: "string" }),
    minutesPerDay: int("minutesPerDay").notNull(),
    successCriteria: text("successCriteria"),
    constraints: text("constraints"),
    learningStyle: varchar("learningStyle", { length: 160 }),
    budgetPreference: varchar("budgetPreference", { length: 160 }),
    status: mysqlEnum("status", ["draft", "active", "paused", "completed", "archived"]).default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    targetAt: timestamp("targetAt"),
  },
  table => ({ ownerIndex: index("aura_goals_owner_idx").on(table.userId), statusIndex: index("aura_goals_status_idx").on(table.userId, table.status) }),
);

export const roadmaps = mysqlTable(
  "aura_roadmaps",
  {
    id: int("id").autoincrement().primaryKey(),
    goalId: int("goalId").notNull().references(() => goals.id, { onDelete: "cascade" }),
    version: int("version").default(1).notNull(),
    refinedGoal: text("refinedGoal").notNull(),
    assumptions: json("assumptions").$type<string[]>().notNull(),
    weeklyObjectives: json("weeklyObjectives").$type<string[]>().notNull(),
    status: mysqlEnum("status", ["active", "paused", "superseded"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ goalIndex: index("aura_roadmaps_goal_idx").on(table.goalId, table.status) }),
);

export const milestones = mysqlTable(
  "aura_milestones",
  {
    id: int("id").autoincrement().primaryKey(),
    roadmapId: int("roadmapId").notNull().references(() => roadmaps.id, { onDelete: "cascade" }),
    weekNumber: int("weekNumber").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    successCriteria: text("successCriteria").notNull(),
    status: mysqlEnum("status", ["upcoming", "active", "completed"]).default("upcoming").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ roadmapIndex: index("aura_milestones_roadmap_idx").on(table.roadmapId, table.sortOrder) }),
);

export const tasks = mysqlTable(
  "aura_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    goalId: int("goalId").notNull().references(() => goals.id, { onDelete: "cascade" }),
    milestoneId: int("milestoneId").references(() => milestones.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description").notNull(),
    priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
    estimatedMinutes: int("estimatedMinutes").notNull(),
    dayOffset: int("dayOffset").default(0).notNull(),
    dueAt: timestamp("dueAt"),
    requiredSkill: varchar("requiredSkill", { length: 160 }),
    completionCriteria: text("completionCriteria").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ goalIndex: index("aura_tasks_goal_idx").on(table.goalId, table.dayOffset), milestoneIndex: index("aura_tasks_milestone_idx").on(table.milestoneId) }),
);

export const taskProgress = mysqlTable(
  "aura_task_progress",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["todo", "completed", "missed"]).default("todo").notNull(),
    notes: text("notes"),
    evidence: text("evidence"),
    actualMinutes: int("actualMinutes"),
    completedAt: timestamp("completedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ taskUserUnique: uniqueIndex("aura_task_progress_task_user_uq").on(table.taskId, table.userId), userIndex: index("aura_task_progress_user_idx").on(table.userId, table.status) }),
);

export const attendanceRecords = mysqlTable(
  "aura_attendance",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    goalId: int("goalId").notNull().references(() => goals.id, { onDelete: "cascade" }),
    day: date("day", { mode: "date" }).notNull(),
    status: mysqlEnum("status", ["showed_up", "missed"]).notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ dayUnique: uniqueIndex("aura_attendance_user_goal_day_uq").on(table.userId, table.goalId, table.day), ownerIndex: index("aura_attendance_user_idx").on(table.userId, table.goalId, table.day) }),
);

export const learningResources = mysqlTable(
  "aura_learning_resources",
  {
    id: int("id").autoincrement().primaryKey(),
    goalId: int("goalId").notNull().references(() => goals.id, { onDelete: "cascade" }),
    taskId: int("taskId").references(() => tasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    type: mysqlEnum("type", ["documentation", "tutorial", "article", "book", "course", "paper", "video", "dataset", "practice", "project", "other"]).default("other").notNull(),
    url: varchar("url", { length: 2048 }),
    description: text("description").notNull(),
    urlVerified: boolean("urlVerified").default(false).notNull(),
    reviewedAt: timestamp("reviewedAt"),
    bookmarkedAt: timestamp("bookmarkedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ goalIndex: index("aura_resources_goal_idx").on(table.goalId), taskIndex: index("aura_resources_task_idx").on(table.taskId) }),
);

export type AssessmentQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export const assessments = mysqlTable(
  "aura_assessments",
  {
    id: int("id").autoincrement().primaryKey(),
    goalId: int("goalId").notNull().references(() => goals.id, { onDelete: "cascade" }),
    milestoneId: int("milestoneId").references(() => milestones.id, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    instructions: text("instructions").notNull(),
    questions: json("questions").$type<AssessmentQuestion[]>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ goalIndex: index("aura_assessments_goal_idx").on(table.goalId) }),
);

export const assessmentAttempts = mysqlTable(
  "aura_assessment_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    assessmentId: int("assessmentId").notNull().references(() => assessments.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    answers: json("answers").$type<number[]>().notNull(),
    scorePercent: int("scorePercent"),
    feedback: text("feedback"),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  },
  table => ({ assessmentUserIndex: index("aura_attempts_user_idx").on(table.userId, table.assessmentId) }),
);

export const coachMessages = mysqlTable(
  "aura_coach_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    goalId: int("goalId").notNull().references(() => goals.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ goalIndex: index("aura_coach_goal_idx").on(table.goalId, table.createdAt) }),
);

export const planAdjustments = mysqlTable(
  "aura_plan_adjustments",
  {
    id: int("id").autoincrement().primaryKey(),
    goalId: int("goalId").notNull().references(() => goals.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    suggestedChange: text("suggestedChange").notNull(),
    evidenceSummary: text("evidenceSummary").notNull(),
    proposedSchedule: json("proposedSchedule").$type<{ taskId: number; dayOffset: number }[]>(),
    status: mysqlEnum("status", ["pending", "accepted", "dismissed"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
  },
  table => ({ userIndex: index("aura_adjustments_user_idx").on(table.userId, table.status) }),
);

export const activityLogs = mysqlTable(
  "aura_activity_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    goalId: int("goalId").references(() => goals.id, { onDelete: "cascade" }),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    summary: varchar("summary", { length: 255 }).notNull(),
    details: json("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ userIndex: index("aura_activity_user_idx").on(table.userId, table.createdAt) }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Roadmap = typeof roadmaps.$inferSelect;
