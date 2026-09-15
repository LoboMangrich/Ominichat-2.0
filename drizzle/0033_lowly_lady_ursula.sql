ALTER TABLE `conversationTags` ADD `slug` varchar(32);--> statement-breakpoint
ALTER TABLE `conversationTags` ADD CONSTRAINT `conversationTags_slug_unique` UNIQUE(`slug`);