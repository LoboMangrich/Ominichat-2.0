CREATE TABLE `conversationTagAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`tagId` int NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversationTagAssignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversationTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`color` varchar(32) NOT NULL DEFAULT '#6366f1',
	`icon` varchar(32) NOT NULL DEFAULT 'tag',
	`isDefault` boolean NOT NULL DEFAULT false,
	`isSystem` boolean NOT NULL DEFAULT false,
	`createdByUserId` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversationTags_id` PRIMARY KEY(`id`)
);
