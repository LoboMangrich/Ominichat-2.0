CREATE TABLE `aiAgents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`channel` enum('whatsapp','email','instagram','telegram','all') NOT NULL DEFAULT 'all',
	`isActive` boolean NOT NULL DEFAULT false,
	`systemPrompt` text,
	`escalationThreshold` int DEFAULT 70,
	`greetingMessage` text,
	`escalationMessage` text,
	`maxAutoReplies` int DEFAULT 5,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiAgents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channelSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channel` enum('whatsapp','email','instagram','telegram') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`waPhoneNumberId` varchar(128),
	`waToken` text,
	`waVerifyToken` varchar(128),
	`emailHost` varchar(255),
	`emailPort` int,
	`emailUser` varchar(320),
	`emailPassword` text,
	`emailFromName` varchar(128),
	`igPageId` varchar(128),
	`igAccessToken` text,
	`tgBotToken` text,
	`tgWebhookSecret` varchar(128),
	`slaFirstResponseMinutes` int DEFAULT 60,
	`slaResolutionHours` int DEFAULT 24,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channelSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `channelSettings_channel_unique` UNIQUE(`channel`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeBase` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`category` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeBase_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `conversations` MODIFY COLUMN `channel` enum('whatsapp','email','instagram','telegram','chat') NOT NULL DEFAULT 'whatsapp';--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `senderType` enum('agent','customer','system','ai') NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `handledByAi` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `aiAgentId` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `firstResponseTimeSeconds` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `handleTimeSeconds` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `slaBreached` boolean DEFAULT false;