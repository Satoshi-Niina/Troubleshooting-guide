
import { db } from '../db';
import { users } from '../../shared/schema';
import { sql } from 'drizzle-orm';

async function seed() {
  try {
    // 初期管理者ユーザーの作成
    await db.insert(users).values({
      username: 'admin',
      login_id: 'admin',
      password: 'admin123', // 本番環境ではハッシュ化したパスワードを使用してください
      display_name: 'システム管理者',
      role: 'admin',
      department: 'システム管理部',
      createdAt: new Date()
    });

    console.log('データベースの初期データを作成しました');
  } catch (error) {
    console.error('データベースの初期化に失敗しました:', error);
  }
}

seed();
