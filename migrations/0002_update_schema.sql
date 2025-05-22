
-- チャットテーブルの作成
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- メッセージテーブルの作成
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_ai_response BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 既存のテーブルの更新（必要な場合）
ALTER TABLE users
ADD COLUMN IF NOT EXISTS department TEXT;

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
