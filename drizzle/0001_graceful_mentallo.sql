CREATE TABLE `aura_activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`goalId` int,
	`eventType` varchar(64) NOT NULL,
	`summary` varchar(255) NOT NULL,
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aura_activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aura_assessment_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessmentId` int NOT NULL,
	`userId` int NOT NULL,
	`answers` json NOT NULL,
	`scorePercent` int,
	`feedback` text,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aura_assessment_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aura_assessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`goalId` int NOT NULL,
	`milestoneId` int,
	`title` varchar(180) NOT NULL,
	`instructions` text NOT NULL,
	`questions` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aura_assessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aura_coach_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`goalId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aura_coach_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aura_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`category` varchar(80) NOT NULL,
	`skillLevel` varchar(80) NOT NULL,
	`durationDays` int NOT NULL,
	`minutesPerDay` int NOT NULL,
	`successCriteria` text,
	`constraints` text,
	`learningStyle` varchar(160),
	`budgetPreference` varchar(160),
	`status` enum('draft','active','paused','completed','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`targetAt` timestamp,
	CONSTRAINT `aura_goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aura_learning_resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`goalId` int NOT NULL,
	`taskId` int,
	`title` varchar(180) NOT NULL,
	`type` enum('documentation','tutorial','article','video','practice','project','other') NOT NULL DEFAULT 'other',
	`url` varchar(2048),
	`description` text NOT NULL,
	`urlVerified` boolean NOT NULL DEFAULT false,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aura_learning_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aura_milestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roadmapId` int NOT NULL,
	`weekNumber` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text NOT NULL,
	`successCriteria` text NOT NULL,
	`status` enum('upcoming','active','completed') NOT NULL DEFAULT 'upcoming',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aura_milestones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aura_plan_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`goalId` int NOT NULL,
	`userId` int NOT NULL,
	`reason` text NOT NULL,
	`suggestedChange` text NOT NULL,
	`evidenceSummary` text NOT NULL,
	`proposedSchedule` json,
	`status` enum('pending','accepted','dismissed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `aura_plan_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aura_roadmaps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`goalId` int NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`refinedGoal` text NOT NULL,
	`assumptions` json NOT NULL,
	`weeklyObjectives` json NOT NULL,
	`status` enum('active','paused','superseded') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aura_roadmaps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aura_sessions` (
	`tokenHash` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aura_sessions_tokenHash` PRIMARY KEY(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `aura_task_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('todo','completed','missed') NOT NULL DEFAULT 'todo',
	`notes` text,
	`evidence` text,
	`actualMinutes` int,
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aura_task_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `aura_task_progress_task_user_uq` UNIQUE(`taskId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `aura_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`goalId` int NOT NULL,
	`milestoneId` int,
	`title` varchar(180) NOT NULL,
	`description` text NOT NULL,
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`estimatedMinutes` int NOT NULL,
	`dayOffset` int NOT NULL DEFAULT 0,
	`dueAt` timestamp,
	`requiredSkill` varchar(160),
	`completionCriteria` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aura_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(120);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `loginMethod` varchar(64) DEFAULT 'password';--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `aura_activity_logs` ADD CONSTRAINT `aura_activity_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_activity_logs` ADD CONSTRAINT `aura_activity_logs_goalId_aura_goals_id_fk` FOREIGN KEY (`goalId`) REFERENCES `aura_goals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_assessment_attempts` ADD CONSTRAINT `aura_assessment_attempts_assessmentId_aura_assessments_id_fk` FOREIGN KEY (`assessmentId`) REFERENCES `aura_assessments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_assessment_attempts` ADD CONSTRAINT `aura_assessment_attempts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_assessments` ADD CONSTRAINT `aura_assessments_goalId_aura_goals_id_fk` FOREIGN KEY (`goalId`) REFERENCES `aura_goals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_assessments` ADD CONSTRAINT `aura_assessments_milestoneId_aura_milestones_id_fk` FOREIGN KEY (`milestoneId`) REFERENCES `aura_milestones`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_coach_messages` ADD CONSTRAINT `aura_coach_messages_goalId_aura_goals_id_fk` FOREIGN KEY (`goalId`) REFERENCES `aura_goals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_coach_messages` ADD CONSTRAINT `aura_coach_messages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_goals` ADD CONSTRAINT `aura_goals_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_learning_resources` ADD CONSTRAINT `aura_learning_resources_goalId_aura_goals_id_fk` FOREIGN KEY (`goalId`) REFERENCES `aura_goals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_learning_resources` ADD CONSTRAINT `aura_learning_resources_taskId_aura_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `aura_tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_milestones` ADD CONSTRAINT `aura_milestones_roadmapId_aura_roadmaps_id_fk` FOREIGN KEY (`roadmapId`) REFERENCES `aura_roadmaps`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_plan_adjustments` ADD CONSTRAINT `aura_plan_adjustments_goalId_aura_goals_id_fk` FOREIGN KEY (`goalId`) REFERENCES `aura_goals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_plan_adjustments` ADD CONSTRAINT `aura_plan_adjustments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_roadmaps` ADD CONSTRAINT `aura_roadmaps_goalId_aura_goals_id_fk` FOREIGN KEY (`goalId`) REFERENCES `aura_goals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_sessions` ADD CONSTRAINT `aura_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_task_progress` ADD CONSTRAINT `aura_task_progress_taskId_aura_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `aura_tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_task_progress` ADD CONSTRAINT `aura_task_progress_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_tasks` ADD CONSTRAINT `aura_tasks_goalId_aura_goals_id_fk` FOREIGN KEY (`goalId`) REFERENCES `aura_goals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_tasks` ADD CONSTRAINT `aura_tasks_milestoneId_aura_milestones_id_fk` FOREIGN KEY (`milestoneId`) REFERENCES `aura_milestones`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `aura_activity_user_idx` ON `aura_activity_logs` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `aura_attempts_user_idx` ON `aura_assessment_attempts` (`userId`,`assessmentId`);--> statement-breakpoint
CREATE INDEX `aura_assessments_goal_idx` ON `aura_assessments` (`goalId`);--> statement-breakpoint
CREATE INDEX `aura_coach_goal_idx` ON `aura_coach_messages` (`goalId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `aura_goals_owner_idx` ON `aura_goals` (`userId`);--> statement-breakpoint
CREATE INDEX `aura_goals_status_idx` ON `aura_goals` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `aura_resources_goal_idx` ON `aura_learning_resources` (`goalId`);--> statement-breakpoint
CREATE INDEX `aura_resources_task_idx` ON `aura_learning_resources` (`taskId`);--> statement-breakpoint
CREATE INDEX `aura_milestones_roadmap_idx` ON `aura_milestones` (`roadmapId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `aura_adjustments_user_idx` ON `aura_plan_adjustments` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `aura_roadmaps_goal_idx` ON `aura_roadmaps` (`goalId`,`status`);--> statement-breakpoint
CREATE INDEX `aura_sessions_user_idx` ON `aura_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `aura_sessions_expiry_idx` ON `aura_sessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `aura_task_progress_user_idx` ON `aura_task_progress` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `aura_tasks_goal_idx` ON `aura_tasks` (`goalId`,`dayOffset`);--> statement-breakpoint
CREATE INDEX `aura_tasks_milestone_idx` ON `aura_tasks` (`milestoneId`);