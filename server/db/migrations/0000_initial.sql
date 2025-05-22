-- Drop existing tables and types if they exist
DROP TABLE IF EXISTS chat_exports CASCADE;
DROP TABLE IF EXISTS keywords CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS media CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS chats CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role;

-- Create user role enum
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'user');

-- Create users table with explicit sequence
CREATE SEQUENCE users_id_seq;
CREATE TABLE users (
    id INTEGER DEFAULT nextval('users_id_seq') PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    password TEXT,
    role user_role DEFAULT 'user',
    department TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chats table with explicit sequence
CREATE SEQUENCE chats_id_seq;
CREATE TABLE chats (
    id INTEGER DEFAULT nextval('chats_id_seq') PRIMARY KEY,
    title TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create messages table with explicit sequence
CREATE SEQUENCE messages_id_seq;
CREATE TABLE messages (
    id INTEGER DEFAULT nextval('messages_id_seq') PRIMARY KEY,
    chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create media table with explicit sequence
CREATE SEQUENCE media_id_seq;
CREATE TABLE media (
    id INTEGER DEFAULT nextval('media_id_seq') PRIMARY KEY,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create documents table with explicit sequence
CREATE SEQUENCE documents_id_seq;
CREATE TABLE documents (
    id INTEGER DEFAULT nextval('documents_id_seq') PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create keywords table with explicit sequence
CREATE SEQUENCE keywords_id_seq;
CREATE TABLE keywords (
    id INTEGER DEFAULT nextval('keywords_id_seq') PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chat exports table with explicit sequence
CREATE SEQUENCE chat_exports_id_seq;
CREATE TABLE chat_exports (
    id INTEGER DEFAULT nextval('chat_exports_id_seq') PRIMARY KEY,
    chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
    export_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial user
INSERT INTO users (username, display_name, password, role, department)
VALUES ('niina', 'Niina Satoshi', '$2b$10$your_hashed_password', 'admin', 'IT');

-- Set sequence values
SELECT setval('users_id_seq', 1, true);
SELECT setval('chats_id_seq', 1, true);
SELECT setval('messages_id_seq', 1, true);
SELECT setval('media_id_seq', 1, true);
SELECT setval('documents_id_seq', 1, true);
SELECT setval('keywords_id_seq', 1, true);
SELECT setval('chat_exports_id_seq', 1, true); 