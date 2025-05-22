
import { db } from '../db';
import { users } from '../../shared/schema';
import { sql } from 'drizzle-orm';

async function seed() {
  try {
    // 初期管理者ユーザーの作成
    await db.insert(users).values({
      username: 'niina',
      display_name: 'Niina Admin',
      password: '0077', // 本番環境ではハッシュ化したパスワードを使用してください
      role: 'admin',
      department: 'takabeni'
    }).onConflictDoNothing();

    // 従業員ユーザーの作成
    await db.insert(users).values({
      username: 'employee',
      display_name: '従業員ユーザー',
      password: 'employee123',
      role: 'employee',
      department: 'general'
    }).onConflictDoNothing();

    console.log('データベースの初期データを作成しました');
  } catch (error) {
    console.error('データベースの初期化に失敗しました:', error);
  }
}

seed();
