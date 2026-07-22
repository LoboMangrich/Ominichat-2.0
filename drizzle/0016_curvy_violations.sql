CREATE TABLE `aiSupervisionQueue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int,
	`customerId` int,
	`conversationId` int,
	`actionType` enum('welcome_message','proactive_outreach','nps_survey','renewal_reminder','churn_risk_alert','upsell_suggestion','auto_reply','escalation') NOT NULL,
	`actionDescription` text NOT NULL,
	`messageContent` text,
	`status` enum('pending','approved','rejected','executed','failed') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`reviewNote` text,
	`executedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiSupervisionQueue_id` PRIMARY KEY(`id`)
);
