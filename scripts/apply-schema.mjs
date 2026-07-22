import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(url);

const statements = [
  // Update users table with new roles
  `ALTER TABLE users MODIFY COLUMN role enum('user','admin','Admin','Manager','Agent') NOT NULL DEFAULT 'Agent'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatarUrl text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS isActive boolean NOT NULL DEFAULT true`,

  // Customers
  `CREATE TABLE IF NOT EXISTS customers (
    id int AUTO_INCREMENT NOT NULL,
    ghlContactId varchar(128),
    name varchar(255) NOT NULL,
    email varchar(320),
    phone varchar(64),
    program varchar(128),
    status enum('Active','At Risk','Churned','New') NOT NULL DEFAULT 'New',
    tags json,
    assignedAgentId int,
    ghlSyncedAt timestamp NULL,
    lastInteractionAt timestamp NULL,
    notes text,
    company varchar(255),
    address text,
    customFields json,
    npsScore float,
    csatScore float,
    lifetimeValue float DEFAULT 0,
    createdAt timestamp NOT NULL DEFAULT (now()),
    updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT customers_id PRIMARY KEY(id)
  )`,

  // Conversations
  `CREATE TABLE IF NOT EXISTS conversations (
    id int AUTO_INCREMENT NOT NULL,
    customerId int NOT NULL,
    assignedAgentId int,
    channel enum('whatsapp','email','chat') NOT NULL DEFAULT 'whatsapp',
    status enum('Open','Waiting','Closed') NOT NULL DEFAULT 'Open',
    subject varchar(255),
    tags json,
    qualityScore float,
    sentimentScore float,
    upsellOpportunity float,
    referralReadiness float,
    aiSummary text,
    aiRecommendations text,
    aiAnalyzedAt timestamp NULL,
    firstResponseAt timestamp NULL,
    closedAt timestamp NULL,
    createdAt timestamp NOT NULL DEFAULT (now()),
    updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT conversations_id PRIMARY KEY(id)
  )`,

  // Messages
  `CREATE TABLE IF NOT EXISTS messages (
    id int AUTO_INCREMENT NOT NULL,
    conversationId int NOT NULL,
    senderId int,
    senderType enum('agent','customer','system') NOT NULL,
    content text NOT NULL,
    mediaUrl text,
    mediaType varchar(64),
    isInternal boolean NOT NULL DEFAULT false,
    whatsappMessageId varchar(128),
    readAt timestamp NULL,
    createdAt timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT messages_id PRIMARY KEY(id)
  )`,

  // Conversation Labels
  `CREATE TABLE IF NOT EXISTS conversationLabels (
    id int AUTO_INCREMENT NOT NULL,
    conversationId int NOT NULL,
    label varchar(64) NOT NULL,
    color varchar(32) DEFAULT '#6366f1',
    createdBy int,
    createdAt timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT conversationLabels_id PRIMARY KEY(id)
  )`,

  // Surveys
  `CREATE TABLE IF NOT EXISTS surveys (
    id int AUTO_INCREMENT NOT NULL,
    customerId int NOT NULL,
    conversationId int,
    type enum('NPS','CSAT') NOT NULL,
    score int,
    feedback text,
    classification enum('Promoter','Passive','Detractor'),
    status enum('Pending','Sent','Completed','Expired') NOT NULL DEFAULT 'Pending',
    sentAt timestamp NULL,
    completedAt timestamp NULL,
    followUpSent boolean NOT NULL DEFAULT false,
    createdAt timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT surveys_id PRIMARY KEY(id)
  )`,

  // Referrals
  `CREATE TABLE IF NOT EXISTS referrals (
    id int AUTO_INCREMENT NOT NULL,
    referrerId int NOT NULL,
    referredName varchar(255),
    referredEmail varchar(320),
    referredPhone varchar(64),
    program varchar(128),
    status enum('Pending','Contacted','Converted','Lost') NOT NULL DEFAULT 'Pending',
    agentId int,
    ghlLeadId varchar(128),
    notes text,
    createdAt timestamp NOT NULL DEFAULT (now()),
    updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT referrals_id PRIMARY KEY(id)
  )`,

  // Agent Metrics
  `CREATE TABLE IF NOT EXISTS agentMetrics (
    id int AUTO_INCREMENT NOT NULL,
    agentId int NOT NULL,
    date varchar(10) NOT NULL,
    firstResponseTimeAvg float,
    avgResolutionTime float,
    csatScore float,
    qualityScore float,
    conversationsCount int DEFAULT 0,
    conversationsClosed int DEFAULT 0,
    referralsGenerated int DEFAULT 0,
    upsellsGenerated int DEFAULT 0,
    npsAvg float,
    createdAt timestamp NOT NULL DEFAULT (now()),
    updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT agentMetrics_id PRIMARY KEY(id)
  )`,

  // GHL Settings
  `CREATE TABLE IF NOT EXISTS ghlSettings (
    id int AUTO_INCREMENT NOT NULL,
    userId int NOT NULL,
    locationId varchar(128),
    accessToken text,
    refreshToken text,
    tokenExpiresAt timestamp NULL,
    isConnected boolean NOT NULL DEFAULT false,
    lastSyncAt timestamp NULL,
    webhookSecret varchar(128),
    createdAt timestamp NOT NULL DEFAULT (now()),
    updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT ghlSettings_id PRIMARY KEY(id),
    CONSTRAINT ghlSettings_userId_unique UNIQUE(userId)
  )`,

  // Upsell Opportunities
  `CREATE TABLE IF NOT EXISTS upsellOpportunities (
    id int AUTO_INCREMENT NOT NULL,
    customerId int NOT NULL,
    conversationId int,
    agentId int,
    program varchar(128),
    status enum('Identified','Presented','Accepted','Declined') NOT NULL DEFAULT 'Identified',
    score float,
    notes text,
    createdAt timestamp NOT NULL DEFAULT (now()),
    updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT upsellOpportunities_id PRIMARY KEY(id)
  )`,
];

let success = 0;
let errors = 0;
for (const sql of statements) {
  try {
    await conn.execute(sql);
    const name = sql.trim().split(/\s+/).slice(0, 4).join(" ");
    console.log(`✓ ${name}`);
    success++;
  } catch (e) {
    console.error(`✗ Error: ${e.message.substring(0, 100)}`);
    errors++;
  }
}

await conn.end();
console.log(`\nDone: ${success} succeeded, ${errors} errors`);
