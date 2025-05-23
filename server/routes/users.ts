
import { Router } from 'express';
import { users } from '@shared/schema';
import { db } from '../db';

const router = Router();

// ✅ ユーザー一覧取得
router.get('/', async (req, res) => {
  try {
    // select()の代わりに明示的にカラムを指定して取得
    const allUsers = await db.query.users.findMany({
      columns: {
        id: true,
        username: true,
        display_name: true,
        role: true,
        department: true
      }
    });
    
    res.json(allUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export const usersRouter = router;
