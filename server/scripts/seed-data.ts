
import { db } from '../db';
import { users } from '../../shared/schema';
import bcrypt from 'bcrypt';

async function seed() {
  try {
    // パスワードのハッシュ化
    const adminPassword = await bcrypt.hash('0077', 10);
    const employeePassword = await bcrypt.hash('employee123', 10);

    // 初期管理者ユーザーの作成
    await db.insert(users).values({
      username: 'niina',
      display_name: 'Niina Admin',
      password: adminPassword,
      role: 'admin',
      department: 'takabeni'
    }).onConflictDoNothing();

    // 従業員ユーザーの作成
    await db.insert(users).values({
      username: 'employee',
      display_name: '従業員ユーザー',
      password: employeePassword,
      role: 'employee',
      department: 'general'
    }).onConflictDoNothing();

    console.log('データベースの初期データを作成しました');
  } catch (error) {
    console.error('データベースの初期化に失敗しました:', error);
  }
}

seed();
