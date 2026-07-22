ALTER TABLE `customers` ADD `mrr` float DEFAULT 0;--> statement-breakpoint
ALTER TABLE `customers` ADD `renewalDate` timestamp;--> statement-breakpoint
ALTER TABLE `customers` ADD `healthScore` float;