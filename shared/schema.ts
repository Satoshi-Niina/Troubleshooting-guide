import { pgTable, text, serial, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// User role enum
export const userRoleEnum = pgEnum('user_role', ['employee', 'admin']);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  role: userRoleEnum("role").notNull().default('employee'),
  department: text("department"),
});

// Messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  senderId: integer("sender_id").references(() => users.id),
  isAiResponse: boolean("is_ai_response").notNull().default(false),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  chatId: integer("chat_id").references(() => chats.id),
});

// Media attachments table
export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => messages.id),
  type: text("type").notNull(), // image, video
  url: text("url").notNull(),
  thumbnail: text("thumbnail"),
});

// Chats table
export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Processed documents table
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(), // pdf, pptx, xlsx
  url: text("url").notNull(),
  jsonUrl: text("json_url"),
  imagesUrl: text("images_url"),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
  userId: integer("user_id").references(() => users.id),
});

// Search keywords table for document indexing
export const keywords = pgTable("keywords", {
  id: serial("id").primaryKey(),
  word: text("word").notNull(),
  documentId: integer("document_id").references(() => documents.id),
  relevance: integer("relevance").notNull().default(1),
});

// チャット履歴エクスポートテーブル
export const chatExports = pgTable("chat_exports", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").references(() => chats.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Schema validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

export const insertMediaSchema = createInsertSchema(media).omit({
  id: true,
});

export const insertChatSchema = createInsertSchema(chats).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  processedAt: true,
});

export const insertKeywordSchema = createInsertSchema(keywords).omit({
  id: true,
});

export const insertChatExportSchema = createInsertSchema(chatExports).omit({
  id: true,
  timestamp: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Media = typeof media.$inferSelect;
export type InsertMedia = z.infer<typeof insertMediaSchema>;

export type Chat = typeof chats.$inferSelect;
export type InsertChat = z.infer<typeof insertChatSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type Keyword = typeof keywords.$inferSelect;
export type InsertKeyword = z.infer<typeof insertKeywordSchema>;

export type ChatExport = typeof chatExports.$inferSelect;
export type InsertChatExport = z.infer<typeof insertChatExportSchema>;

// Auth types
// Relations
export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats),
  messages: many(messages),
  documents: many(documents),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, { fields: [chats.userId], references: [users.id] }),
  messages: many(messages),
  exports: many(chatExports),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  media: many(media),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  message: one(messages, { fields: [media.messageId], references: [messages.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  keywords: many(keywords),
}));

export const keywordsRelations = relations(keywords, ({ one }) => ({
  document: one(documents, { fields: [keywords.documentId], references: [documents.id] }),
}));

export const chatExportsRelations = relations(chatExports, ({ one }) => ({
  chat: one(chats, { fields: [chatExports.chatId], references: [chats.id] }),
  user: one(users, { fields: [chatExports.userId], references: [users.id] }),
}));

export const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(4),
});

export type LoginCredentials = z.infer<typeof loginSchema>;
