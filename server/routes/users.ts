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

    const formattedUsers = allUsers.map(user => ({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      department: user.department
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'ユーザー一覧の取得に失敗しました' });
  }
});

// ユーザー作成
router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('ユーザー作成リクエスト受信:', req.body);
    const { username, password, display_name, role, department } = req.body;
    
    if (!username || !password) {
      console.log('バリデーションエラー: 必須項目不足');
      return res.status(400).json({ message: '必須項目が入力されていません' });
    }

    // 既存ユーザーチェック
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    console.log('既存ユーザーチェック結果:', existingUser);

    if (existingUser.length > 0) {
      console.log('重複エラー: すでに存在するユーザー名');
      return res.status(400).json({ message: 'このユーザー名は既に使用されています' });
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // ユーザー作成
    const result = await db.insert(users)
      .values({
        username,
        password: hashedPassword,
        display_name: display_name || username,
        role: role || 'employee',
        department: department || null
      })
      .returning();

    console.log('データベース挿入結果:', result);

    if (!result || result.length === 0) {
      console.error('ユーザー作成失敗: 結果が空');
      throw new Error('ユーザーの作成に失敗しました');
    }

    const newUser = result[0];
    res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.display_name,
      role: newUser.role,
      department: newUser.department
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      message: 'ユーザーの作成に失敗しました',
      error: error.message 
    });
  }
});

export default router;