import { pgTable, text, timestamp, serial, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const chatExports = pgTable('chat_exports', {
  id: serial('id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  userId: integer('user_id').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull()
});

export const insertChatExportSchema = createInsertSchema(chatExports).omit({
  id: true
});

export type ChatExport = typeof chatExports.$inferSelect;
export type InsertChatExport = z.infer<typeof insertChatExportSchema>;

export const chats = pgTable('chats', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  chatId: integer('chat_id').notNull(),
  senderId: integer('sender_id').notNull(),
  content: text('content').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull()
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  display_name: text('display_name').notNull(),
  role: text('role').default('employee').notNull(),
  department: text('department'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Schema validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;