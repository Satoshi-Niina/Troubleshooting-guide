import { Router } from 'express';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

// 初期管理者ユーザーの作成を確認
const initializeAdminUser = async () => {
  try {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.username, 'admin'),
    });

    if (!adminUser) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await db.insert(users).values({
        username: 'admin',
        password: hashedPassword,
        display_name: 'Administrator',
        role: 'admin',
        department: 'System'
      });
      console.log('Initial admin user created');
    }
  } catch (error) {
    console.error('Error creating initial admin user:', error);
  }
};

initializeAdminUser();
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
      display_name: users.display_name,
      role: users.role,
      department: users.department
    }).from(users);

    res.json(allUsers || []);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'ユーザー一覧の取得に失敗しました' });
  }
});

// ユーザー作成
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { username, password, display_name, role, department } = req.body;

    // 入力値の検証
    if (!username || !password || !display_name) {
      return res.status(400).json({ 
        message: '必須項目が入力されていません',
        details: {
          username: !username ? 'ユーザー名は必須です' : null,
          password: !password ? 'パスワードは必須です' : null,
          display_name: !display_name ? '表示名は必須です' : null,
        }
      });
    }

    // 既存ユーザーの確認
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username),
      columns: {
        username: true
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'このユーザー名は既に使用されています',
        field: 'username'
      });
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.insert(users).values({
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