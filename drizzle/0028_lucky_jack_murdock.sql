CREATE TABLE `meeting_transcripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`file_url` text,
	`file_key` text,
	`summary` text,
	`key_points` text,
	`action_items` text,
	`health_score_delta` int DEFAULT 0,
	`analyzed_at` timestamp,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `meeting_transcripts_id` PRIMARY KEY(`id`)
);
