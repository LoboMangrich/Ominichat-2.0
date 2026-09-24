CREATE TABLE `saraWebhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(128) NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`saraConversationId` varchar(64),
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	`processingError` varchar(255),
	`notifyUserId` int,
	`notifyAll` boolean NOT NULL DEFAULT false,
	CONSTRAINT `saraWebhookEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_saraWebhookEvents_eventId` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE INDEX `idx_saraWebhookEvents_receivedAt` ON `saraWebhookEvents` (`receivedAt`);