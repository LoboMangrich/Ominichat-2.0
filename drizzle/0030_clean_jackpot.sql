CREATE TABLE `clientGoals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`targetValue` float NOT NULL,
	`currentValue` float DEFAULT 0,
	`unit` varchar(64) DEFAULT 'R$',
	`deadline` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientGoals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clientROI` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`saleValue` float DEFAULT 0,
	`profitValue` float DEFAULT 0,
	`category` enum('passagem','midia','contrato','upsell','outro') DEFAULT 'outro',
	`saleDate` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientROI_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `formSubmissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`formId` int NOT NULL,
	`submitterName` varchar(255),
	`submitterEmail` varchar(320),
	`data` json NOT NULL,
	`createdTaskId` int,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `formSubmissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `formTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`fields` json NOT NULL,
	`taskTitle` varchar(255),
	`taskCategory` enum('cliente','contrato','onboarding','reuniao','passagem','midia','contratacao','outro') DEFAULT 'outro',
	`taskTeam` enum('IPL','MCM','RCC','Geral') DEFAULT 'Geral',
	`taskPriority` enum('low','medium','high','urgent') DEFAULT 'medium',
	`assignToUserId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`publicSlug` varchar(128),
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `formTemplates_id` PRIMARY KEY(`id`),
	CONSTRAINT `formTemplates_publicSlug_unique` UNIQUE(`publicSlug`)
);
--> statement-breakpoint
CREATE TABLE `taskAttachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` text NOT NULL,
	`fileSize` int,
	`mimeType` varchar(128),
	`attachmentType` enum('contrato','reuniao','grupo','outro') DEFAULT 'outro',
	`uploadedByUserId` int,
	`uploadedByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `taskAttachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `team` enum('IPL','MCM','RCC','Geral') DEFAULT 'Geral';--> statement-breakpoint
ALTER TABLE `tasks` ADD `category` enum('cliente','contrato','onboarding','reuniao','passagem','midia','contratacao','outro') DEFAULT 'outro';--> statement-breakpoint
ALTER TABLE `tasks` ADD `googleCalendarEventId` varchar(255);--> statement-breakpoint
ALTER TABLE `tasks` ADD `meetingLink` varchar(512);