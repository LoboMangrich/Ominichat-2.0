ALTER TABLE `conversations` MODIFY COLUMN `tags` json;--> statement-breakpoint
ALTER TABLE `customers` MODIFY COLUMN `tags` json;--> statement-breakpoint
ALTER TABLE `customers` MODIFY COLUMN `customFields` json;