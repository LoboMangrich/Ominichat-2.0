CREATE TABLE `customerJourney` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`playbookId` int NOT NULL,
	`currentStepId` int,
	`status` enum('active','completed','paused','cancelled') NOT NULL DEFAULT 'active',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`nextActionAt` timestamp,
	`stepsCompleted` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerJourney_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `journeyStepExecutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journeyId` int NOT NULL,
	`stepId` int NOT NULL,
	`customerId` int NOT NULL,
	`status` enum('pending','executed','skipped','failed') NOT NULL DEFAULT 'pending',
	`scheduledAt` timestamp NOT NULL,
	`executedAt` timestamp,
	`result` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `journeyStepExecutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `playbookSteps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playbookId` int NOT NULL,
	`stepOrder` int NOT NULL,
	`delayDays` int NOT NULL DEFAULT 0,
	`stepType` enum('send_message','send_nps','send_csat','create_task','update_health_score','escalate_to_human','add_tag') NOT NULL DEFAULT 'send_message',
	`messageTemplate` text,
	`taskTitle` text,
	`taskDescription` text,
	`healthScoreDelta` int,
	`tagToAdd` varchar(128),
	`condition` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `playbookSteps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `playbooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`program` varchar(128),
	`agentId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`triggerEvent` enum('customer_created','nps_submitted','health_score_drop','renewal_approaching','no_interaction','manual') NOT NULL DEFAULT 'customer_created',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `playbooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `triggerRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`conditionType` enum('no_interaction_days','health_score_below','nps_score_below','renewal_days_remaining','tag_added','status_changed') NOT NULL,
	`conditionValue` varchar(128) NOT NULL,
	`actionType` enum('send_ai_message','create_supervision_item','update_status','assign_playbook','create_task','send_nps') NOT NULL,
	`actionConfig` json,
	`agentId` int,
	`program` varchar(128),
	`lastEvaluatedAt` timestamp,
	`triggerCount` int NOT NULL DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `triggerRules_id` PRIMARY KEY(`id`)
);
