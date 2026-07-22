CREATE TABLE `communicationInsights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodDays` int NOT NULL DEFAULT 30,
	`totalMessages` int NOT NULL DEFAULT 0,
	`totalConversations` int NOT NULL DEFAULT 0,
	`sentimentPositive` int NOT NULL DEFAULT 0,
	`sentimentNeutral` int NOT NULL DEFAULT 0,
	`sentimentNegative` int NOT NULL DEFAULT 0,
	`topics` json,
	`suggestions` json,
	`rawSummary` text,
	`analyzedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `communicationInsights_id` PRIMARY KEY(`id`)
);
