CREATE TABLE `guruSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`apiToken` varchar(128),
	`webhookSecret` varchar(128),
	`isActive` boolean NOT NULL DEFAULT false,
	`lastEventAt` timestamp,
	`totalCustomersImported` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guruSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `guruSettings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `guruWebhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` varchar(191),
	`contactEmail` varchar(320),
	`contactName` varchar(255),
	`productName` varchar(255),
	`status` varchar(64),
	`value` float,
	`rawPayload` json,
	`processedAt` timestamp,
	`customerId` int,
	`action` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guruWebhookEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `guruContactId` varchar(191);--> statement-breakpoint
ALTER TABLE `customers` ADD `guruTransactionId` varchar(191);--> statement-breakpoint
ALTER TABLE `customers` ADD `guruProductId` varchar(191);--> statement-breakpoint
ALTER TABLE `customers` ADD `guruProductName` varchar(255);--> statement-breakpoint
ALTER TABLE `customers` ADD `guruPurchaseValue` float;--> statement-breakpoint
ALTER TABLE `customers` ADD `guruPurchaseStatus` varchar(64);--> statement-breakpoint
ALTER TABLE `customers` ADD `guruSyncedAt` timestamp;