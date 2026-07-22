CREATE TABLE `knowledgeCaptures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`question` text NOT NULL,
	`normalizedQuestion` varchar(512) NOT NULL,
	`category` enum('acesso_plataforma','conteudo_modulo','financeiro_reembolso','certificado','comunidade','suporte_tecnico','resultado_produto','outros') NOT NULL DEFAULT 'outros',
	`frequency` int NOT NULL DEFAULT 1,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`status` enum('pending','approved','dismissed') NOT NULL DEFAULT 'pending',
	`resolution` text,
	`sourceConversationIds` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeCaptures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeFAQ` (
	`id` int AUTO_INCREMENT NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`category` enum('acesso_plataforma','conteudo_modulo','financeiro_reembolso','certificado','comunidade','suporte_tecnico','resultado_produto','outros') NOT NULL DEFAULT 'outros',
	`agentIds` json DEFAULT ('[]'),
	`captureId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeFAQ_id` PRIMARY KEY(`id`)
);
