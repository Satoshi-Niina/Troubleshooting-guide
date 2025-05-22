DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,                        -- 自動連番の主キー
  username TEXT UNIQUE NOT NULL,                -- ログインID（英数小文字）
  display_name TEXT NOT NULL,                   -- 表示名（日本語）
  password TEXT NOT NULL,                       -- ハッシュ化済パスワード
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user', 'employee')),
  department TEXT,                              -- 所属（部署名など）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
); 