CREATE TABLE `alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('chargeback','reclame_aqui','refund','dispute','system') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`customerId` int,
	`customerName` varchar(255),
	`customerEmail` varchar(320),
	`externalId` varchar(128),
	`amount` float,
	`status` enum('open','in_progress','resolved','dismissed') NOT NULL DEFAULT 'open',
	`resolvedBy` int,
	`resolvedAt` timestamp,
	`rawPayload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`channel` enum('whatsapp','email','instagram','telegram') NOT NULL DEFAULT 'whatsapp',
	`status` enum('draft','scheduled','sending','sent','failed') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`sentAt` timestamp,
	`totalRecipients` int DEFAULT 0,
	`sentCount` int DEFAULT 0,
	`failedCount` int DEFAULT 0,
	`filterProgram` varchar(128),
	`filterStatus` varchar(64),
	`filterTag` varchar(64),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `broadcasts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `internalMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderId` int NOT NULL,
	`receiverId` int,
	`roomId` varchar(64),
	`content` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `internalMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quickReplies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(128) NOT NULL,
	`content` text NOT NULL,
	`shortcut` varchar(32),
	`isGlobal` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quickReplies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduledMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`customerId` int,
	`content` text NOT NULL,
	`scheduledAt` timestamp NOT NULL,
	`status` enum('pending','sent','cancelled','failed') NOT NULL DEFAULT 'pending',
	`createdBy` int NOT NULL,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scheduledMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int,
	`conversationId` int,
	`title` varchar(255) NOT NULL,
	`description` text,
	`status` enum('todo','in_progress','done','cancelled') NOT NULL DEFAULT 'todo',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`assignedTo` int,
	`dueDate` timestamp,
	`completedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `conversations` MODIFY COLUMN `customerId` int;