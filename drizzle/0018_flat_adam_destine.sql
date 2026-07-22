ALTER TABLE `channelSettings` MODIFY COLUMN `waProvider` enum('meta','zapi','evolution') DEFAULT 'meta';--> statement-breakpoint
ALTER TABLE `channelSettings` ADD `evolutionApiUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `channelSettings` ADD `evolutionApiKey` text;--> statement-breakpoint
ALTER TABLE `channelSettings` ADD `evolutionInstanceName` varchar(128);--> statement-breakpoint
ALTER TABLE `whatsappGroups` ADD `groupType` enum('vip','community','support') DEFAULT 'community';--> statement-breakpoint
ALTER TABLE `whatsappGroups` ADD `aiAutoReply` boolean DEFAULT false NOT NULL;