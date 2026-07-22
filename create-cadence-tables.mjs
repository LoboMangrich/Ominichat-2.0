import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await createConnection(url);
console.log("Connected to DB");

await conn.execute(`
  CREATE TABLE IF NOT EXISTS cadenceRules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    triggerType ENUM('days_since_entry','days_since_contact','days_before_renewal','health_score_below','new_customer') NOT NULL,
    triggerValue INT NOT NULL DEFAULT 0,
    actionType ENUM('send_whatsapp','send_group_message','create_task','update_health_score','notify_agent') NOT NULL,
    messageTemplate TEXT,
    taskTitle VARCHAR(255),
    healthScoreDelta INT,
    targetProgram VARCHAR(128),
    targetStatus ENUM('Active','At Risk','New','all') DEFAULT 'all',
    isActive BOOLEAN NOT NULL DEFAULT TRUE,
    executionFrequency ENUM('once','daily','weekly','monthly') NOT NULL DEFAULT 'once',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`);
console.log("✅ cadenceRules table created");

await conn.execute(`
  CREATE TABLE IF NOT EXISTS cadenceExecutions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ruleId INT NOT NULL,
    customerId INT NOT NULL,
    status ENUM('sent','failed','skipped','pending') NOT NULL DEFAULT 'pending',
    generatedMessage TEXT,
    errorMessage TEXT,
    executedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    customerName VARCHAR(255),
    customerProgram VARCHAR(128),
    healthScoreAtExecution INT
  )
`);
console.log("✅ cadenceExecutions table created");

await conn.end();
console.log("Done!");
