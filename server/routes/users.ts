
import { Router } from 'express';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { storage } from '../storage';

const router = Router();

// ユーザー一覧取得
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query.users.findMany();
    const sanitizedUsers = result.map(user => ({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      department: user.department
    }));
    res.json(sanitizedUsers);
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
    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ message: 'このユーザー名は既に使用されています' });
    }

    // ユーザー作成
    const newUser = await storage.createUser({
      username,
      password,
      displayName,
      role: role || 'employee',
      department
    });

    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.displayName,
      role: newUser.role,
      department: newUser.department
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'ユーザーの作成に失敗しました' });
  }
});

export default router;
