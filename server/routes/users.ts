
import { Router } from 'express';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import bcrypt from 'bcrypt';

const router = Router();

// ユーザー一覧取得
router.get('/', authenticateToken, async (req, res) => {
  try {
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
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'ユーザー一覧の取得に失敗しました' });
  }
});

// ユーザー作成
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { username, password, display_name, role, department } = req.body;

    if (!username || !password || !display_name) {
      return res.status(400).json({ message: '必須項目が入力されていません' });
    }

    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username)
    });

    if (existingUser) {
      return res.status(400).json({ message: 'このユーザー名は既に使用されています' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [newUser] = await db.insert(users).values({
      username,
      password: hashedPassword,
      display_name,
      role: role || 'employee',
      department: department || null
    }).returning();

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      display_name: newUser.display_name,
      role: newUser.role,
      department: newUser.department
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'ユーザーの作成に失敗しました' });
  }
});

export default router;
