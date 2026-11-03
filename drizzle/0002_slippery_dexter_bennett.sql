CREATE TABLE `aura_attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`goalId` int NOT NULL,
	`day` date NOT NULL,
	`status` enum('showed_up','missed') NOT NULL,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aura_attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `aura_attendance_user_goal_day_uq` UNIQUE(`userId`,`goalId`,`day`)
);
--> statement-breakpoint
ALTER TABLE `aura_attendance` ADD CONSTRAINT `aura_attendance_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aura_attendance` ADD CONSTRAINT `aura_attendance_goalId_aura_goals_id_fk` FOREIGN KEY (`goalId`) REFERENCES `aura_goals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `aura_attendance_user_idx` ON `aura_attendance` (`userId`,`goalId`,`day`);