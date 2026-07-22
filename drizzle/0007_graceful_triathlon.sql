CREATE TABLE `aiAgentLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int NOT NULL,
	`conversationId` int,
	`event` enum('auto_reply','escalated','greeted','resolved') NOT NULL,
	`channel` varchar(32),
	`customerName` varchar(255),
	`responseTimeMs` int,
	`qualityScore` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiAgentLogs_id` PRIMARY KEY(`id`)
);
