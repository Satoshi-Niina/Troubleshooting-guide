import { Router } from 'express';
import { db } from '../db';
import { schema } from '../db/schema';
const { users } = schema;
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// ✅ ユーザー一覧取得
router.get('/', async (req, res) => {
  try {
    const allUsers = await db.select().from(users).then(users => users.map(user => ({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      department: user.department
    })));
    
    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'ユーザー一覧の取得に失敗しました' });
  }
});

// ✅ ユーザー作成
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { username, password, display_name, role, department } = req.body;

    // 必須項目のバリデーション
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

    // 既存ユーザーのチェック
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, username)
    });

    if (existingUser) {
      return res.status(400).json({ message: 'このユーザー名は既に使用されています' });
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // ユーザーの作成
    const newUser = await db.insert(users).values({
      username,
      password: hashedPassword,
      display_name,
      role: role || 'employee',
      department: department || null,
      description: '',
      created_at: new Date()
    }).returning();

    res.status(201).json({
      id: newUser[0].id,
      username: newUser[0].username,
      display_name: newUser[0].display_name,
      role: newUser[0].role,
      department: newUser[0].department
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'ユーザーの作成に失敗しました' });
  }
});

export default router;
