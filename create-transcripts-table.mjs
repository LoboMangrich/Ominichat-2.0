import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS meeting_transcripts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content LONGTEXT NOT NULL,
    file_url TEXT,
    file_key TEXT,
    summary TEXT,
    key_points TEXT,
    action_items TEXT,
    health_score_delta INT DEFAULT 0,
    analyzed_at BIGINT,
    created_by INT,
    created_at BIGINT NOT NULL,
    INDEX idx_transcripts_customer (customer_id)
  )
`);

console.log("✅ meeting_transcripts table created");
await conn.end();
