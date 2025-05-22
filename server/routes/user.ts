import express from 'express';
import { Client } from 'pg';
import bcrypt from 'bcrypt';

const router = express.Router();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect();

// POST: ユーザー登録（パスワード暗号化付き）
router.post('/', async (req, res) => {
  try {
    const { username, display_name, password, role, department } = req.body;

    // ✅ パスワードをbcryptでハッシュ化
    const hashedPassword = bcrypt.hashSync(password, 10); // 10は「強度」

    await client.query(
      `INSERT INTO users (username, display_name, password, role, department)
       VALUES ($1, $2, $3, $4, $5)`,
      [username, display_name, hashedPassword, role, department]
    );

    res.status(201).json({ message: 'ユーザー登録成功（暗号化済）' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '登録失敗' });
  }
});

export default router;
