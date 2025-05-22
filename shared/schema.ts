
// データベースに必要なdrizzle-ormの型とヘルパーをインポート
import { pgTable, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// メディアテーブルの定義
// 画像や動画などのメディアファイルを管理
export const media = pgTable('media', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`), // UUIDを自動生成
  messageId: integer('message_id').notNull(), // 関連するメッセージのID
  type: text('type').notNull(), // メディアの種類（画像、動画など）
  url: text('url').notNull(), // メディアファイルのURL
  description: text('description'), // メディアの説明（オプション）
  createdAt: timestamp('created_at').defaultNow().notNull() // 作成日時
});

// ユーザーテーブルの定義
// システムのユーザー情報を管理
export const users = pgTable('users', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`), // UUIDを自動生成
  username: text('username').notNull(), // ユーザー名
  password: text('password').notNull(), // パスワード（ハッシュ化されて保存）
  display_name: text('display_name').notNull(), // 表示名
  role: text('role').notNull(), // ユーザーの役割（管理者、一般ユーザーなど）
  department: text('department'), // 所属部署（オプション）
  createdAt: timestamp('created_at').defaultNow().notNull() // アカウント作成日時
});

// 緊急フローテーブルの定義
// 緊急時の対応手順を管理
export const emergencyFlows = pgTable('emergency_flows', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`), // UUIDを自動生成
  title: text('title').notNull(), // フローのタイトル
  steps: jsonb('steps').notNull(), // 手順のステップ（JSON形式）
  keyword: text('keyword').notNull(), // 検索用キーワード
  createdAt: timestamp('created_at').defaultNow().notNull() // 作成日時
});

// 画像テーブルの定義
// システムで使用する画像とその説明を管理
export const images = pgTable('images', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`), // UUIDを自動生成
  url: text('url').notNull(), // 画像のURL
  description: text('description').notNull(), // 画像の説明
  embedding: jsonb('embedding').notNull(), // 画像の特徴ベクトル（AI検索用）
  createdAt: timestamp('created_at').defaultNow().notNull() // 作成日時
});

// チャットエクスポートテーブルの定義
// チャット履歴のエクスポート記録を管理
export const chatExports = pgTable('chat_exports', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`), // UUIDを自動生成
  chatId: text('chat_id').notNull(), // 関連するチャットのID
  userId: text('user_id').notNull(), // エクスポートを実行したユーザーのID
  timestamp: timestamp('timestamp').defaultNow().notNull(), // エクスポート実行日時
});
