
// データベースに必要なdrizzle-ormの型とヘルパーをインポート
import { pgTable, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ユーザーテーブルの定義
// システムのユーザー情報を管理
export const users = pgTable('users', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  display_name: text('display_name').notNull(),
  role: text('role').notNull().default('employee'),
  department: text('department'),
  description: text('description'),
  created_at: timestamp('created_at').defaultNow().notNull()
});


// チャットテーブルの定義
// チャットセッション情報を管理
export const chats = pgTable('chats', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`), // UUIDを自動生成
  userId: text('user_id').notNull(), // チャットを開始したユーザーのID
  title: text('title'), // チャットのタイトル（オプション）
  createdAt: timestamp('created_at').defaultNow().notNull() // 作成日時
});

// メッセージテーブルの定義
// チャット内のメッセージを管理
export const messages = pgTable('messages', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`), // UUIDを自動生成
  chatId: text('chat_id').notNull(), // 関連するチャットのID
  senderId: text('sender_id').notNull(), // 送信者のID
  content: text('content').notNull(), // メッセージの内容
  isAiResponse: boolean('is_ai_response').notNull().default(false), // AIの応答かどうか
  createdAt: timestamp('created_at').defaultNow().notNull() // 送信日時
});

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
  timestamp: timestamp('timestamp').defaultNow().notNull() // エクスポート実行日時
});

// Zodスキーマの定義（バリデーション用）
import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string(),
  password: z.string()
});

export const insertUserSchema = z.object({
  username: z.string(),
  password: z.string(),
  display_name: z.string(),
  role: z.string(),
  department: z.string().optional()
});

export const insertChatSchema = z.object({
  userId: z.string(),
  title: z.string().optional()
});

export const insertMessageSchema = z.object({
  chatId: z.string(),
  content: z.string(),
  senderId: z.string(),
  isAiResponse: z.boolean().default(false)
});

export const insertMediaSchema = z.object({
  messageId: z.number(),
  type: z.string(),
  url: z.string(),
  description: z.string().optional()
});

export const insertDocumentSchema = z.object({
  title: z.string(),
  content: z.string(),
  userId: z.string()
});

export const schema = {
  users,
  chats,
  messages,
  media,
  emergencyFlows,
  images,
  chatExports,
};
