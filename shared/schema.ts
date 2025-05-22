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
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
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

// Chat schemas
export const insertChatSchema = createInsertSchema(chats).omit({
  id: true,
  createdAt: true,
});

export type Chat = typeof chats.$inferSelect;
export type InsertChat = z.infer<typeof insertChatSchema>;

// Message schemas
export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Media schemas
export const insertMediaSchema = createInsertSchema(media).omit({
  id: true,
});

export type Media = typeof media.$inferSelect;
export type InsertMedia = z.infer<typeof insertMediaSchema>;

// Documents table definition
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  type: text('type').notNull(),
  url: text('url').notNull(),
  processedAt: timestamp('processed_at').defaultNow().notNull()
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  processedAt: true,
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;