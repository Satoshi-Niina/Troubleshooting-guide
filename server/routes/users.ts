
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
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
      displayName: users.display_name,
      role: users.role,
      department: users.department,
      createdAt: users.created_at
    }).from(users);
    
    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'ユーザー一覧の取得に失敗しました' });
  }
});

// ユーザー作成
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { username, password, displayName, role, department } = req.body;
    
    // 既存ユーザーチェック
    const existingUser = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'このユーザー名は既に使用されています' });
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // ユーザー作成
    const [newUser] = await db.insert(users).values({
      username,
      password: hashedPassword,
      display_name: displayName,
      role: role || 'employee',
      department
    }).returning();

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.display_name,
      role: newUser.role,
      department: newUser.department
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'ユーザーの作成に失敗しました' });
  }
});

export default router;
