
import { Router } from 'express';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// ユーザー一覧取得
router.get('/', authenticateToken, async (req, res) => {
  try {
    const allUsers = await db.select().from(users);
    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'ユーザー一覧の取得に失敗しました' });
  }
});

export default router;
