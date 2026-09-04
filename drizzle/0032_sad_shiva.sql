CREATE INDEX `idx_conversations_status_updated` ON `conversations` (`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_conversations_customer` ON `conversations` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_customer_journey_customer_status` ON `customerJourney` (`customerId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_customers_phone` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `idx_customers_email` ON `customers` (`email`);--> statement-breakpoint
CREATE INDEX `idx_customers_status` ON `customers` (`status`);--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_created` ON `messages` (`conversationId`,`createdAt`);