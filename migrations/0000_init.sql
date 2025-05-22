
-- Create user role enum type
CREATE TYPE user_role AS ENUM ('employee', 'admin');

-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password VARCHAR(100) NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  department VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chats table
CREATE TABLE chats (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create messages table
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  sender_id INTEGER REFERENCES users(id),
  is_ai_response BOOLEAN NOT NULL DEFAULT false,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE
);

-- Create media table
CREATE TABLE media (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail TEXT
);

-- Insert initial admin user
INSERT INTO users (username, display_name, password, role, department)
VALUES ('niina', 'niina', '0077', 'admin', 'takabeni')
ON CONFLICT (username) DO NOTHING;
