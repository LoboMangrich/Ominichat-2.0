ALTER TABLE `scheduledMessages` ADD `lastError` text;--> statement-breakpoint
ALTER TABLE `scheduledMessages` ADD `retryCount` int DEFAULT 0 NOT NULL;