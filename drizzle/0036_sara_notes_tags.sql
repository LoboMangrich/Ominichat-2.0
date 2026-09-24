CREATE TABLE `saraConversationTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`saraConversationId` varchar(64) NOT NULL,
	`tagId` int NOT NULL,
	`assignedBy` int,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saraConversationTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_saraConversationTags_conversation_tag` UNIQUE(`saraConversationId`,`tagId`)
);
--> statement-breakpoint
CREATE TABLE `saraInternalNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`saraConversationId` varchar(64) NOT NULL,
	`authorId` int NOT NULL,
	`text` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saraInternalNotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_saraConversationTags_tag` ON `saraConversationTags` (`tagId`);--> statement-breakpoint
CREATE INDEX `idx_saraInternalNotes_conversation` ON `saraInternalNotes` (`saraConversationId`);