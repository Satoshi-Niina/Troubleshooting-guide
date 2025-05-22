import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  await client.connect();

  const filePath = path.join(__dirname, '../extracted_data.json'); // JSONの場所に応じて調整
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const jsonData = JSON.parse(rawData);
  const guides = jsonData['保守用車データ'];

  for (const guide of guides) {
    await client.query(
      `INSERT INTO emergency_guides (id, title, description, details, images, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        guide.id,
        guide.title,
        guide.description,
        guide.details,
        JSON.stringify(guide.all_images),
        JSON.stringify({
          category: guide.category,
          keywords: guide.keywords,
          metadata_json: guide.metadata_json,
        }),
      ]
    );
  }

  console.log('✅ データ移行が完了しました');
  await client.end();
}

migrate().catch(console.error);
