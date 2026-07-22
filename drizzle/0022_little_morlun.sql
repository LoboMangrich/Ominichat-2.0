CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`agentId` int,
	`filterMinHealthScore` int,
	`filterMaxHealthScore` int,
	`filterProgram` varchar(255),
	`filterStatus` varchar(50),
	`filterLifecycleStage` varchar(100),
	`status` enum('draft','scheduled','running','completed','cancelled') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`sentAt` timestamp,
	`totalTargeted` int DEFAULT 0,
	`totalSent` int DEFAULT 0,
	`totalReplied` int DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `handoffMode` enum('ai','human') DEFAULT 'ai' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `assignedUserId` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `handoffAt` timestamp;--> statement-breakpoint
ALTER TABLE `conversations` ADD `handoffNote` text;