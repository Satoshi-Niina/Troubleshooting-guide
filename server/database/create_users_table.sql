CREATE TABLE users (
  username TEXT PRIMARY KEY,       -- ログインID（英数字）
  display_name TEXT,               -- 表示名（日本語）
  password TEXT,                   -- パスワード（平文は非推奨、後でハッシュ化）
  role TEXT CHECK (role IN ('admin', 'manager', 'user')), -- 権限種別
  department TEXT,                 -- 所属（任意文字列）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
