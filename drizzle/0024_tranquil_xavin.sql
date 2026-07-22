CREATE TABLE `customerJourneyTasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`phase` enum('onboarding','monthly','renewal','manual') NOT NULL DEFAULT 'manual',
	`dayOffset` int,
	`dueDate` timestamp,
	`status` enum('pending','done','skipped') NOT NULL DEFAULT 'pending',
	`priority` enum('critical','high','normal') NOT NULL DEFAULT 'normal',
	`completedAt` timestamp,
	`completedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerJourneyTasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customerNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`content` text NOT NULL,
	`type` enum('note','call','meeting','email','whatsapp') NOT NULL DEFAULT 'note',
	`createdByUserId` int,
	`createdByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerNotes_id` PRIMARY KEY(`id`)
);
