CREATE TABLE `customerMilestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`type` enum('victory','challenge','milestone','complaint') NOT NULL DEFAULT 'milestone',
	`title` varchar(255) NOT NULL,
	`description` text,
	`date` timestamp NOT NULL DEFAULT (now()),
	`createdByUserId` int,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerMilestones_id` PRIMARY KEY(`id`)
);
