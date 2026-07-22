CREATE TABLE `cadenceExecutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ruleId` int NOT NULL,
	`customerId` int NOT NULL,
	`status` enum('sent','failed','skipped','pending') NOT NULL DEFAULT 'pending',
	`generatedMessage` text,
	`errorMessage` text,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	`customerName` varchar(255),
	`customerProgram` varchar(128),
	`healthScoreAtExecution` int,
	CONSTRAINT `cadenceExecutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cadenceRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`triggerType` enum('days_since_entry','days_since_contact','days_before_renewal','health_score_below','new_customer') NOT NULL,
	`triggerValue` int NOT NULL DEFAULT 0,
	`actionType` enum('send_whatsapp','send_group_message','create_task','update_health_score','notify_agent') NOT NULL,
	`messageTemplate` text,
	`taskTitle` varchar(255),
	`healthScoreDelta` int,
	`targetProgram` varchar(128),
	`targetStatus` enum('Active','At Risk','New','all') DEFAULT 'all',
	`isActive` boolean NOT NULL DEFAULT true,
	`executionFrequency` enum('once','daily','weekly','monthly') NOT NULL DEFAULT 'once',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cadenceRules_id` PRIMARY KEY(`id`)
);
