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
import { db } from './db';

// データベース接続テスト
const testDatabaseConnection = async () => {
  try {
    await db.select().from(users).limit(1);
    console.log('データベース接続OK');
    return true;
  } catch (error) {
    console.error('データベース接続エラー:', error);
    return false;
  }
};

export const storage = {
  testConnection: testDatabaseConnection,
  // Session store
  sessionStore: new DatabaseStorage().sessionStore,

  // User methods
  getUser: async (id: number): Promise<User | undefined> => {
    return new DatabaseStorage().getUser(id);
  },
  getUserByUsername: async (username: string): Promise<User | undefined> => {
    return new DatabaseStorage().getUserByUsername(username);
  },
  createUser: async (user: InsertUser): Promise<User> => {
    return new DatabaseStorage().createUser(user);
  },
  updateUser: async (id: number, user: Partial<User>): Promise<User> => {
    return new DatabaseStorage().updateUser(id, user);
  },
  deleteUser: async (id: number): Promise<void> => {
    return new DatabaseStorage().deleteUser(id);
  },

  // Chat methods
  getChat: async (id: number): Promise<Chat | undefined> => {
    return new DatabaseStorage().getChat(id);
  },
  getChatsForUser: async (userId: number): Promise<Chat[]> => {
    return new DatabaseStorage().getChatsForUser(userId);
  },
  createChat: async (chat: InsertChat): Promise<Chat> => {
    return new DatabaseStorage().createChat(chat);
  },

  // Message methods
  getMessage: async (id: number): Promise<Message | undefined> => {
    return new DatabaseStorage().getMessage(id);
  },
  getMessagesForChat: async (chatId: number): Promise<Message[]> => {
    return new DatabaseStorage().getMessagesForChat(chatId);
  },
  getMessagesForChatAfterTimestamp: async (chatId: number, timestamp: Date): Promise<Message[]> => {
    return new DatabaseStorage().getMessagesForChatAfterTimestamp(chatId, timestamp);
  },
  createMessage: async (message: InsertMessage): Promise<Message> => {
    return new DatabaseStorage().createMessage(message);
  },
  clearChatMessages: async (chatId: number): Promise<void> => {
    return new DatabaseStorage().clearChatMessages(chatId);
  },

  // Media methods
  getMedia: async (id: number): Promise<Media | undefined> => {
    return new DatabaseStorage().getMedia(id);
  },
  getMediaForMessage: async (messageId: number): Promise<Media[]> => {
    return new DatabaseStorage().getMediaForMessage(messageId);
  },
  createMedia: async (media: InsertMedia): Promise<Media> => {
    return new DatabaseStorage().createMedia(media);
  },

  // Document methods
  getDocument: async (id: number): Promise<Document | undefined> => {
    return new DatabaseStorage().getDocument(id);
  },
  getDocumentsForUser: async (userId: number): Promise<Document[]> => {
    return new DatabaseStorage().getDocumentsForUser(userId);
  },
  createDocument: async (document: InsertDocument): Promise<Document> => {
    return new DatabaseStorage().createDocument(document);
  },
  updateDocument: async (id: number, updates: Partial<Document>): Promise<Document | undefined> => {
    return new DatabaseStorage().updateDocument(id, updates);
  },

  // Keyword methods
  getKeywordsForDocument: async (documentId: number): Promise<Keyword[]> => {
    return new DatabaseStorage().getKeywordsForDocument(documentId);
  },
  createKeyword: async (keyword: InsertKeyword): Promise<Keyword> => {
    return new DatabaseStorage().createKeyword(keyword);
  },
  searchDocumentsByKeyword: async (keyword: string): Promise<Document[]> => {
    return new DatabaseStorage().searchDocumentsByKeyword(keyword);
  },

  // Chat export methods
  saveChatExport: async (chatId: number, userId: number, timestamp: Date): Promise<void> => {
    return new DatabaseStorage().saveChatExport(chatId, userId, timestamp);
  },
  getLastChatExport: async (chatId: number): Promise<ChatExport | null> => {
    return new DatabaseStorage().getLastChatExport(chatId);
  }
};