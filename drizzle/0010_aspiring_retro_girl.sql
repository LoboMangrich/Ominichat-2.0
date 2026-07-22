CREATE TABLE `satisfactionRatings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`customerId` int,
	`rating` enum('great','ok','bad') NOT NULL,
	`ratingLabel` varchar(16) NOT NULL,
	`channel` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `satisfactionRatings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `satisfactionSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`message` text NOT NULL DEFAULT ('Como você avalia nosso atendimento? Responda: 👍 Ótimo, 😐 Regular ou 👎 Ruim'),
	`delayMinutes` int NOT NULL DEFAULT 0,
	`channels` json DEFAULT ('["whatsapp","telegram"]'),
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `satisfactionSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `slaSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channel` enum('whatsapp','email','instagram','telegram','all') NOT NULL,
	`windowMinutes` int NOT NULL DEFAULT 60,
	`warningMinutes` int NOT NULL DEFAULT 45,
	`isActive` boolean NOT NULL DEFAULT true,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `slaSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `slaSettings_channel_unique` UNIQUE(`channel`)
);
--> statement-breakpoint
CREATE TABLE `weeklyReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`weekStart` timestamp NOT NULL,
	`weekEnd` timestamp NOT NULL,
	`totalConversations` int NOT NULL DEFAULT 0,
	`closedConversations` int NOT NULL DEFAULT 0,
	`avgResponseMinutes` float,
	`slaCompliancePct` float,
	`avgCsat` float,
	`newCustomers` int NOT NULL DEFAULT 0,
	`totalAlerts` int NOT NULL DEFAULT 0,
	`resolvedAlerts` int NOT NULL DEFAULT 0,
	`topAgents` json,
	`channelBreakdown` json,
	`emailSentAt` timestamp,
	`generatedBy` varchar(64) NOT NULL DEFAULT 'system',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weeklyReports_id` PRIMARY KEY(`id`)
);
