CREATE TABLE `channelHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`channel` enum('whatsapp','email','instagram','telegram','chat') NOT NULL,
	`identifier` varchar(100) NOT NULL,
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`disconnectedAt` timestamp,
	`disconnectReason` varchar(255),
	`conversationCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channelHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `conversations` ADD `whatsappNumber` varchar(30);--> statement-breakpoint
ALTER TABLE `conversations` ADD `archivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `conversations` ADD `archivedReason` varchar(255);