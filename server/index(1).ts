import express from 'express';
import { Client } from 'pg';
import dotenv from 'dotenv';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());

// ✅ /api/users POST 登録エンドポイント
app.post('/api/users', async (req, res) => {
  const { username, display_name, password, role, department } = req.body;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);
    await client.query(
      `INSERT INTO users (username, display_name, password, role, department)
       VALUES ($1, $2, $3, $4, $5)`,
      [username, display_name, hashedPassword, role, department]
    );
    res.status(201).json({ message: "登録完了" });
  } catch (err: any) {
    // ✅ ここが重要です
    console.error("❌ DBエラー:", err.message);  // ← これを追加
    res.status(500).json({ error: "登録失敗" });
  } finally {
    await client.end();
  }
});


app.get('/', (_req, res) => {
  res.send('✅ サーバーは動作中です');
});

app.listen(PORT, () => {
  console.log(`✅ サーバーが起動しました http://localhost:${PORT}`);
});
