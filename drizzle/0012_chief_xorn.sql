ALTER TABLE `channelSettings` ADD `waProvider` enum('meta','zapi') DEFAULT 'meta';--> statement-breakpoint
ALTER TABLE `channelSettings` ADD `zapiInstanceId` varchar(128);--> statement-breakpoint
ALTER TABLE `channelSettings` ADD `zapiToken` text;--> statement-breakpoint
ALTER TABLE `channelSettings` ADD `zapiClientToken` text;--> statement-breakpoint
ALTER TABLE `channelSettings` ADD `zapiWebhookToken` varchar(128);