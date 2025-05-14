
import { db } from '../db';
import { users } from '@shared/schema';

async function seed() {
  try {
    // 管理者ユーザーの作成
    await db.insert(users).values({
      username: 'admin',
      password: 'admin123', // 本番環境ではハッシュ化したパスワードを使用してください
      displayName: '管理者',
      role: 'admin',
      department: '管理部'
    });

    console.log('データベースの初期データを作成しました');
  } catch (error) {
    console.error('データベースの初期化に失敗しました:', error);
  }
}

seed();
