import { 
  users, type User, type InsertUser,
  messages, type Message, type InsertMessage,
  media, type Media, type InsertMedia,
  chats, type Chat, type InsertChat,
  documents, type Document, type InsertDocument,
  keywords, type Keyword, type InsertKeyword,
  chatExports, type ChatExport, type InsertChatExport
} from "@shared/schema";
import session from "express-session";
import { DatabaseStorage } from "./database-storage";

// 注: schemaから直接ChatExportを使用します

export interface IStorage {
  // Session store
  sessionStore: session.Store;
  
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  
  // Chat methods
  getChat(id: number): Promise<Chat | undefined>;
  getChatsForUser(userId: number): Promise<Chat[]>;
  createChat(chat: InsertChat): Promise<Chat>;
  
  // Message methods
  getMessage(id: number): Promise<Message | undefined>;
  getMessagesForChat(chatId: number): Promise<Message[]>;
  getMessagesForChatAfterTimestamp(chatId: number, timestamp: Date): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  clearChatMessages(chatId: number): Promise<void>; // チャットメッセージをクリアする新メソッド
  
  // Media methods
  getMedia(id: number): Promise<Media | undefined>;
  getMediaForMessage(messageId: number): Promise<Media[]>;
  createMedia(media: InsertMedia): Promise<Media>;
  
  // Document methods
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentsForUser(userId: number): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined>;
  
  // Keyword methods
  getKeywordsForDocument(documentId: number): Promise<Keyword[]>;
  createKeyword(keyword: InsertKeyword): Promise<Keyword>;
  searchDocumentsByKeyword(keyword: string): Promise<Document[]>;
  
  // Chat export methods
  saveChatExport(chatId: number, userId: number, timestamp: Date): Promise<void>;
  getLastChatExport(chatId: number): Promise<ChatExport | null>;
}

export const storage = new DatabaseStorage();
