CREATE TABLE `groupAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` varchar(128) NOT NULL,
	`groupName` varchar(256),
	`type` enum('silence','unanswered_request','negative_sentiment','high_activity') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`message` text NOT NULL,
	`aiSummary` text,
	`isResolved` boolean NOT NULL DEFAULT false,
	`resolvedAt` timestamp,
	`resolvedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `groupAlerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groupMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` varchar(128) NOT NULL,
	`externalMessageId` varchar(128),
	`senderId` varchar(128) NOT NULL,
	`senderName` varchar(256),
	`senderType` enum('customer','agent','unknown') NOT NULL DEFAULT 'unknown',
	`content` text NOT NULL,
	`messageType` varchar(32) DEFAULT 'text',
	`sentiment` enum('positive','neutral','negative'),
	`hasUnansweredRequest` boolean DEFAULT false,
	`analyzed` boolean NOT NULL DEFAULT false,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `groupMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsappGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` varchar(128) NOT NULL,
	`groupName` varchar(256) NOT NULL,
	`description` text,
	`participantCount` int DEFAULT 0,
	`isMonitored` boolean NOT NULL DEFAULT true,
	`lastCustomerMessageAt` timestamp,
	`lastAgentMessageAt` timestamp,
	`alertSilenceHours` int DEFAULT 48,
	`linkedCustomerId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappGroups_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsappGroups_groupId_unique` UNIQUE(`groupId`)
);
