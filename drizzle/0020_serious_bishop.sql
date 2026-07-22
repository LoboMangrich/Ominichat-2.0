CREATE TABLE `healthScoreLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`score` float NOT NULL,
	`breakdown` json,
	`calculatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `healthScoreLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `triggerLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ruleId` int NOT NULL,
	`ruleName` varchar(255) NOT NULL,
	`customerId` int NOT NULL,
	`customerName` varchar(255),
	`agentId` int,
	`agentName` varchar(255),
	`conditionType` varchar(64) NOT NULL,
	`conditionValue` varchar(128) NOT NULL,
	`conditionSnapshot` json,
	`actionType` varchar(64) NOT NULL,
	`actionResult` enum('success','skipped','error') NOT NULL DEFAULT 'success',
	`actionDetail` text,
	`isSimulation` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `triggerLogs_id` PRIMARY KEY(`id`)
);
