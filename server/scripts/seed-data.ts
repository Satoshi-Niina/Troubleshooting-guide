
import { db } from '../db';
import { users } from '@shared/schema';

async function seed() {
  try {
    // 初期管理者ユーザーの作成
    await db.insert(users).values({
      username: 'niina',
      password: '0077', // 本番環境ではハッシュ化したパスワードを使用してください
      displayName: 'システム管理者',
      role: 'admin',
      department: 'タカベニ'
    });

    console.log('データベースの初期データを作成しました');
  } catch (error) {
    console.error('データベースの初期化に失敗しました:', error);
  }
}

seed();
