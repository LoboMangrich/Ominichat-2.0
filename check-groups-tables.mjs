import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check if tables exist
const [tables] = await conn.execute("SHOW TABLES LIKE '%group%'");
console.log('Group tables in DB:', tables.map(t => Object.values(t)[0]));

// Create tables if they don't exist
await conn.execute(`
  CREATE TABLE IF NOT EXISTS whatsappGroups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    groupId VARCHAR(128) NOT NULL UNIQUE,
    groupName VARCHAR(255) NOT NULL,
    description TEXT,
    participantCount INT DEFAULT 0,
    isMonitored TINYINT(1) DEFAULT 1,
    alertSilenceHours INT DEFAULT 48,
    linkedCustomerId INT,
    lastCustomerMessageAt BIGINT,
    lastTeamMessageAt BIGINT,
    createdAt BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()*1000),
    updatedAt BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()*1000)
  )
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS groupMessages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    groupId VARCHAR(128) NOT NULL,
    senderId VARCHAR(128) NOT NULL,
    senderName VARCHAR(255),
    senderType ENUM('customer','team','system') DEFAULT 'customer',
    content TEXT NOT NULL,
    messageType VARCHAR(50) DEFAULT 'text',
    timestamp BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()*1000),
    externalId VARCHAR(255),
    createdAt BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()*1000)
  )
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS groupAlerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    groupId VARCHAR(128) NOT NULL,
    type ENUM('silence','unanswered_request','negative_sentiment','high_activity') NOT NULL,
    severity ENUM('low','medium','high','critical') DEFAULT 'medium',
    message TEXT NOT NULL,
    aiSummary TEXT,
    isResolved TINYINT(1) DEFAULT 0,
    resolvedAt BIGINT,
    resolvedBy INT,
    createdAt BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()*1000)
  )
`);

const [tables2] = await conn.execute("SHOW TABLES LIKE '%group%'");
console.log('Group tables after creation:', tables2.map(t => Object.values(t)[0]));

await conn.end();
console.log('Done!');
