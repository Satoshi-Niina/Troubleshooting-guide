import express from 'express';
import { Client } from 'pg';

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect();

router.get('/', async (_, res) => {
  const result = await client.query('SELECT * FROM emergency_guides ORDER BY created_at DESC');
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { id, title, description, details, images, metadata } = req.body;
  await client.query(
    `INSERT INTO emergency_guides (id, title, description, details, images, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, title, description, details, JSON.stringify(images), JSON.stringify(metadata)]
  );
  res.status(201).json({ message: '登録成功' });
});

export default router;
