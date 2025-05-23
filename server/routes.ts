import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { loginSchema, insertUserSchema, insertChatSchema, insertMessageSchema, insertMediaSchema, users, chatExports, documents, insertDocumentSchema } from "@shared/schema";
import { z } from "zod";
import session from "express-session";
import { WebSocket, WebSocketServer } from "ws";
import { processOpenAIRequest, generateSearchQuery, analyzeVehicleImage } from "./lib/openai";
import { processPerplexityRequest } from "./lib/perplexity";
import fs from "fs";
import path from "path";
import { db } from "./db";
import { upload } from './lib/multer-config';
import { 
  addDocumentToKnowledgeBase, 
  listKnowledgeBaseDocuments, 
  removeDocumentFromKnowledgeBase 
} from './lib/knowledge-base';
import { formatChatHistoryForExternalSystem } from './lib/chat-export-formatter';
import techSupportRouter from './routes/tech-support';
import troubleshootingRouter from './routes/troubleshooting';
import { registerDataProcessorRoutes } from './routes/data-processor';
import emergencyGuideRouter from './routes/emergency-guide';
import { emergencyFlowRouter } from './routes/emergency-flow-router';
import { registerSyncRoutes } from './routes/sync-routes';
import { flowGeneratorRouter } from './routes/flow-generator';
import troubleshootingRouter from './routes/troubleshooting.js';
import { usersRouter } from './routes/users';

// Extend the express-session types
declare module 'express-session' {
  interface SessionData {
    userId: number;
    userRole: string;
  }
}

// Session will now use Postgres via storage.sessionStore

export async function registerRoutes(app: Express): Promise<Server> {
  // Register tech support router
  app.use('/api/tech-support', techSupportRouter);

  // Use troubleshooting router
  app.use('/api/troubleshooting', troubleshootingRouter);

  // Register data processor routes
  registerDataProcessorRoutes(app);

  // Register emergency guide routes
  app.use('/api/emergency-guide', emergencyGuideRouter);

  // Register emergency flow routes
  app.use('/api/emergency-flow', emergencyFlowRouter);

  // Register flow generator routes
  app.use('/api/flow-generator', flowGeneratorRouter);

  // Register sync routes for offline capabilities
  registerSyncRoutes(app);

  // Add a health check endpoint for testing
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      openaiKeyExists: !!process.env.OPENAI_API_KEY,
      perplexityKeyExists: !!process.env.PERPLEXITY_API_KEY
    });
  });

  // Add a public OpenAI test endpoint (for testing only)
  app.post('/api/chatgpt-test', async (req, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }

      const response = await processOpenAIRequest(text, true);
      return res.json({ response });
    } catch (error) {
      console.error("Error in /api/chatgpt-test:", error);
      return res.status(500).json({ message: "Error processing request", error: String(error) });
    }
  });

  // Perplexity API endpoint
  app.post('/api/perplexity', async (req, res) => {
    try {
      const { query, systemPrompt, useKnowledgeBaseOnly = true } = req.body;

      if (!query) {
        return res.status(400).json({ message: "Query is required" });
      }

      console.log(`Perplexity API request: query=${query}, useKnowledgeBaseOnly=${useKnowledgeBaseOnly}`);
      const { content, citations } = await processPerplexityRequest(query, systemPrompt, useKnowledgeBaseOnly);

      return res.json({ content, citations });
    } catch (error) {
      console.error("Error in /api/perplexity:", error);
      return res.status(500).json({ 
        message: "Error processing Perplexity request", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Setup session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "emergency-recovery-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { 
        secure: false, // Set to false for development in Replit
        maxAge: 86400000 // 24 hours
      },
      store: storage.sessionStore,
    })
  );

  // Auth middleware
  const requireAuth = (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Admin middleware
  const requireAdmin = async (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const credentials = loginSchema.parse(req.body);
      const user = await storage.getUserByUsername(credentials.username);

      if (!user || user.password !== credentials.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      req.session.userRole = user.role;

      return res.json({ 
        id: user.id, 
        username: user.username, 
        displayName: user.displayName, 
        role: user.role 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      return res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ 
      id: user.id, 
      username: user.username, 
      displayName: user.displayName, 
      role: user.role,
      department: user.department
    });
  });

  // User management routes (admin only)
  app.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await db.select({
        id: users.id,
        username: users.username,
        display_name: users.display_name,
        role: users.role,
        department: users.department
      }).from(users);
      return res.json(result);
    } catch (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser(userData);
      return res.status(201).json({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        department: user.department
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors });
      }
      console.error("Error creating user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ユーザー編集エンドポイント
  app.patch("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      // ユーザーの存在確認
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // ユーザー名の重複チェック（ユーザー名が変更される場合）
      if (req.body.username && req.body.username !== existingUser.username) {
        const userWithSameUsername = await storage.getUserByUsername(req.body.username);
        if (userWithSameUsername && userWithSameUsername.id !== userId) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }

      // 更新データから不要なフィールドを除外
      const { password, ...updateData } = req.body;

      // ユーザー情報更新
      if (updateData.role && !['admin', 'employee'].includes(updateData.role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // 保存
      const updatedUser = await storage.updateUser(userId, updateData);

      return res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        displayName: updatedUser.displayName,
        role: updatedUser.role,
        department: updatedUser.department
      });
    } catch (error) {
      console.error("Error updating user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ユーザー削除エンドポイント
  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      // 自分自身は削除できない
      if (userId === req.session.userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      // ユーザーの存在確認
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // ユーザーとその関連データを削除
      await storage.deleteUser(userId);
      return res.status(200).json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Chat routes
  app.get("/api/chats", requireAuth, async (req, res) => {
    const chats = await storage.getChatsForUser(req.session.userId!);
    return res.json(chats);
  });

  app.post("/api/chats", requireAuth, async (req, res) => {
    try {
      const chatData = insertChatSchema.parse({
        ...req.body,
        userId: req.session.userId
      });

      const chat = await storage.createChat(chatData);
      return res.json(chat);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/chats/:id", requireAuth, async (req, res) => {
    const chat = await storage.getChat(parseInt(req.params.id));

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    if (chat.userId !== req.session.userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json(chat);
  });

  app.get("/api/chats/:id/messages", requireAuth, async (req, res) => {
    const chatId = parseInt(req.params.id);
    const clearCache = req.query.clear === 'true';

    const chat = await storage.getChat(chatId);

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // チャットアクセス制限を一時的に緩和 (すべてのログインユーザーがすべてのチャットを閲覧可能に)
    console.log(`チャット閲覧: chatId=${chat.id}, chatUserId=${chat.userId}, sessionUserId=${req.session.userId}`);
    // if (chat.userId !== req.session.userId) {
    //   return res.status(403).json({ message: "Forbidden" });
    // }

    // クリアフラグが立っている場合、空の配列を返す
    if (clearCache) {
      // キャッシュクリアが要求された場合は空配列を返す
      console.log(`[DEBUG] Chat messages cache cleared for chat ID: ${chatId}`);
      // キャッシュクリアヘッダーを追加
      res.setHeader('X-Chat-Cleared', 'true');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.json([]);
    }

    const messages = await storage.getMessagesForChat(chat.id);

    // Get media for each message
    const messagesWithMedia = await Promise.all(
      messages.map(async (message) => {
        const media = await storage.getMediaForMessage(message.id);
        return { ...message, media };
      })
    );

    return res.json(messagesWithMedia);
  });

  // チャット履歴をクリアするAPI
  app.post("/api/chats/:id/clear", requireAuth, async (req, res) => {
    try {
      const chatId = parseInt(req.params.id);

      const chat = await storage.getChat(chatId);
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      // チャットアクセス制限を一時的に緩和 (すべてのログインユーザーが全チャットの履歴をクリア可能に)
      console.log(`チャット履歴クリア: chatId=${chat.id}, chatUserId=${chat.userId}, sessionUserId=${req.session.userId}`);
      // if (chat.userId !== req.session.userId) {
      //   return res.status(403).json({ message: "Forbidden" });
      // }

      // メッセージとそれに関連するメディアを実際に削除する
      try {
        // データベースからメッセージを削除する
        await storage.clearChatMessages(chatId);
        console.log(`[DEBUG] Chat messages cleared for chat ID: ${chatId}`);
      } catch (dbError) {
        console.error(`Error clearing messages from database: ${dbError}`);
        // データベースエラーが発生した場合でもUIクリアは続行
      }

      // クライアント側でのクリア用フラグをセット
      return res.json({ 
        cleared: true,
        message: "Chat cleared successfully" 
      });
    } catch (error) {
      console.error('Chat clear error:', error);
      return res.status(500).json({ message: "Error clearing chat" });
    }
  });

  // 履歴送信のためのAPI
  app.post("/api/chats/:id/export", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const chatId = parseInt(req.params.id);
      const { lastExportTimestamp } = req.body;

      const chat = await storage.getChat(chatId);
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      // チャットアクセス制限を一時的に緩和
      console.log(`チャットエクスポート: chatId=${chat.id}, chatUserId=${chat.userId}, sessionUserId=${userId}`);
      // if (chat.userId !== userId) {
      //   return res.status(403).json({ message: "Forbidden" });
      // }

      // 指定されたタイムスタンプ以降のメッセージを取得
      const messages = await storage.getMessagesForChatAfterTimestamp(
        chatId, 
        lastExportTimestamp ? new Date(lastExportTimestamp) : new Date(0)
      );

      // 現在のタイムスタンプを記録（次回の履歴送信で使用）
      const exportTimestamp = new Date();

      // チャットのエクスポートレコードを保存
      await storage.saveChatExport(chatId, userId, exportTimestamp);

      // メッセージが存在する場合、フォーマット済みデータも自動的に生成・保存
      if (messages.length > 0) {
        try {
          // フォーマット済みデータを生成（外部システム向け）
          const allMessages = await storage.getMessagesForChat(chatId);

          // メッセージIDごとにメディアを取得
          const messageMedia: Record<number, any[]> = {};
          for (const message of allMessages) {
            messageMedia[message.id] = await storage.getMediaForMessage(message.id);
          }

          // 最新のエクスポート記録を取得
          const lastExport = await storage.getLastChatExport(chatId);

          // 外部システム用にフォーマット
          const formattedData = await formatChatHistoryForExternalSystem(
            chat,
            allMessages,
            messageMedia,
            lastExport
          );

          // ファイルとして保存
          const { exportFileManager } = await import('./lib/export-file-manager');
          exportFileManager.saveFormattedExport(chatId, formattedData);

          console.log(`チャット ${chatId} のフォーマット済みデータを自動生成しました`);
        } catch (formatError) {
          console.error("フォーマット済みデータの生成中にエラーが発生しました:", formatError);
          // フォーマット処理の失敗はメインの応答に影響しないようにするため、エラーをキャッチするだけ
        }
      }

      res.json({ 
        success: true, 
        exportTimestamp,
        messageCount: messages.length
      });
    } catch (error) {
      console.error("Error exporting chat history:", error);
      res.status(500).json({ error: "Failed to export chat history" });
    }
  });

  // 外部AI分析システム向けフォーマット済みデータを取得するAPI
  app.get("/api/chats/:id/export-formatted", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const chatId = parseInt(req.params.id);

      // チャット情報を取得
      const chat = await storage.getChat(chatId);
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      // アクセス権チェック
      console.log(`フォーマット済みエクスポート: chatId=${chat.id}, chatUserId=${chat.userId}, sessionUserId=${userId}`);
      if (chat.userId !== userId && req.session.userRole !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      // チャットの全メッセージを取得
      const messages = await storage.getMessagesForChat(chatId);

      // メッセージIDごとにメディアを取得
      const messageMedia: Record<number, any[]> = {};
      for (const message of messages) {
        messageMedia[message.id] = await storage.getMediaForMessage(message.id);
      }

      // 最新のエクスポート記録を取得
      const lastExport = await storage.getLastChatExport(chatId);

      // 外部システム用にフォーマット
      const formattedData = await formatChatHistoryForExternalSystem(
        chat,
        messages,
        messageMedia,
        lastExport
      );

      res.json(formattedData);
    } catch (error) {
      console.error("Error formatting chat for external system:", error);
      res.status(500).json({ error: "Failed to format chat for external system" });
    }
  });

  // チャットの最後のエクスポート履歴を取得
  app.get("/api/chats/:id/last-export", requireAuth, async (req, res) => {
    try {
      const chatId = parseInt(req.params.id);
      const chat = await storage.getChat(chatId);

      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      // チャットアクセス制限を一時的に緩和
      console.log(`チャットエクスポート履歴: chatId=${chat.id}, chatUserId=${chat.userId}, sessionUserId=${req.session.userId}`);
      // if (chat.userId !== req.session.userId) {
      //   return res.status(403).json({ message: "Forbidden" });
      // }

      const lastExport = await storage.getLastChatExport(chatId);
      res.json(lastExport || { timestamp: null });
    } catch (error) {
      console.error("Error fetching last export:", error);
      res.status(500).json({ error: "Failed to fetch last export information" });
    }
  });

  // 応急処置ガイドなどのシステムメッセージをチャットに追加するためのエンドポイント
  app.post("/api/chats/:id/messages/system", requireAuth, async (req, res) => {
    try {
      const chatId = parseInt(req.params.id);
      // フロントエンドから受け取るパラメータをスキーマに合わせて調整
      const { content, isUserMessage = true } = req.body;

      const chat = await storage.getChat(chatId);
      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      // チャットアクセス制限を一時的に緩和
      console.log(`システムメッセージ送信: chatId=${chat.id}, chatUserId=${chat.userId}, sessionUserId=${req.session.userId}`);

      // メッセージを作成（スキーマに合わせてフィールドを調整）
      const message = await storage.createMessage({
        chatId,
        content,
        isAiResponse: !isUserMessage,
        senderId: req.session.userId
      });

      return res.json(message);
    } catch (error) {
      console.error("システムメッセージ送信エラー:", error);
      return res.status(500).json({ message: "Error creating system message" });
    }
  });

  app.post("/api/chats/:id/messages", requireAuth, async (req, res) => {
    try {
      const chat = await storage.getChat(parseInt(req.params.id));
      const { content, useOnlyKnowledgeBase = true } = req.body;

      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      // チャットアクセス制限を一時的に緩和 (すべてのログインユーザーが全チャットにアクセス可能)
      console.log(`チャットアクセス: chatId=${chat.id}, chatUserId=${chat.userId}, sessionUserId=${req.session.userId}`);
      console.log(`設定: ナレッジベースのみを使用=${useOnlyKnowledgeBase}`);
      // if (chat.userId !== req.session.userId) {
      //   return res.status(403).json({ message: "Forbidden" });
      // }

      const messageData = insertMessageSchema.parse({
        ...req.body,
        chatId: chat.id,
        senderId: req.session.userId,
        isAiResponse: false
      });

      const message = await storage.createMessage(messageData);

      // AI モデル切り替えフラグ (将来的に設定ページから変更可能に)
      // 一時的にPerplexity機能を無効化
      const usePerplexity = false; // req.body.usePerplexity || false;

      let aiResponse = '';
      let citations: any[] = [];

      // 現時点ではPerplexity API未対応のため、OpenAIのみ使用
      // OpenAI API を使用 (デフォルト)
      console.log(`OpenAIモデルを使用`);
      aiResponse = await processOpenAIRequest(message.content, useOnlyKnowledgeBase);

      // Perplexity API は一時的に無効化
      /*
      if (usePerplexity) {
        // Perplexity API を使用
        console.log(`Perplexityモデルを使用`);
        const perplexityResponse = await processPerplexityRequest(message.content, '', useOnlyKnowledgeBase);
        aiResponse = perplexityResponse.content;
        citations = perplexityResponse.citations;
      } else {
        // OpenAI API を使用 (デフォルト)
        console.log(`OpenAIモデルを使用`);
        aiResponse = await processOpenAIRequest(message.content, useOnlyKnowledgeBase);
      }
      */

      // 引用情報がある場合は末尾に追加
      if (citations && citations.length > 0) {
        aiResponse += '\n\n参考情報：';
        citations.forEach((citation, index) => {
          aiResponse += `\n[${index + 1}] ${citation.url}`;
        });
      }

      // Create AI response message
      const aiMessage = await storage.createMessage({
        content: aiResponse,
        chatId: chat.id,
        isAiResponse: true,
        senderId: null
      });

      return res.json({
        userMessage: message,
        aiMessage
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Media routes
  app.post("/api/media", requireAuth, async (req, res) => {
    try {
      const mediaData = insertMediaSchema.parse(req.body);
      const media = await storage.createMedia(mediaData);
      return res.json(media);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Document routes (admin only)
  app.get("/api/documents", requireAuth, async (req, res) => {
    const documents = await storage.getDocumentsForUser(req.session.userId!);
    return res.json(documents);
  });

  app.post("/api/documents", requireAuth, async (req, res) => {
    try {
      const documentData = insertDocumentSchema.parse({
        ...req.body,
        userId: req.session.userId
      });

      const document = await storage.createDocument(documentData);
      return res.json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors });
      }
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/documents/:id", requireAuth, async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id));

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (document.userId !== req.session.userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updatedDocument = await storage.updateDocument(document.id, req.body);
      return res.json(updatedDocument);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Search routes
  app.get("/api/search", requireAuth, async (req, res) => {
    try {
      const keyword = req.query.q as string;

      if (!keyword) {
        return res.status(400).json({ message: "Search query is required" });
      }

      const documents = await storage.searchDocumentsByKeyword(keyword);
      return res.json(documents);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Knowledge Base API routes
  // ドキュメント一覧取得 (一般ユーザーも閲覧可能)
  app.get('/api/knowledge', requireAuth, (req, res) => {
    try {
      const documents = listKnowledgeBaseDocuments();
      console.log('ナレッジベース一覧結果:', documents);
      res.json(documents);
    } catch (error) {
      console.error('Error listing knowledge base documents:', error);
      res.status(500).json({ error: 'Failed to list documents' });
    }
  });

  // ドキュメントアップロード
  app.post('/api/knowledge/upload', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ファイルがありません' });
      }

      const filePath = req.file.path;
      try {
        const docId = await addDocumentToKnowledgeBase(filePath);
        return res.status(201).json({ 
          success: true, 
          docId,
          message: 'ドキュメントが正常に追加されました'
        });
      } catch (err) {
        // エラー発生時にアップロードファイルを削除
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        throw err;
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      res.status(500).json({ error: '知識ベースへの追加に失敗しました: ' + errorMessage });
    }
  });

  // ドキュメント削除
  app.delete('/api/knowledge/:docId', requireAuth, requireAdmin, (req, res) => {
    try {
      const docId = req.params.docId;
      console.log(`ドキュメント削除リクエスト受信: ID=${docId}`);

      // ドキュメントとその関連ファイルを削除
      const success = removeDocumentFromKnowledgeBase(docId);

      if (success) {
        // 画像検索データを再初期化
        fetch('http://localhost:5000/api/tech-support/init-image-search-data', {
          method: 'POST'
        }).then(response => {
          if (response.ok) {
            console.log('画像検索データを再初期化しました');
          } else {
            console.warn('画像検索データの再初期化に失敗しました');
          }
        }).catch(err => {
          console.error('画像検索データ再初期化エラー:', err);
        });

        res.json({ 
          success: true, 
          message: 'ドキュメントとその関連ファイルが正常に削除されました',
          docId: docId
        });
      } else {
        res.status(404).json({ error: '指定されたドキュメントが見つかりません' });
      }
    } catch (error) {
      console.error('Error removing document:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      res.status(500).json({ error: 'ドキュメントの削除に失敗しました: ' + errorMessage });
    }
  });

  // ドキュメント再処理
  app.post('/api/knowledge/:docId/process', requireAuth, requireAdmin, async (req, res) => {
    try {
      const docId = req.params.docId;

      // ナレッジベースからドキュメント情報を取得
      const documents = listKnowledgeBaseDocuments();
      const document = documents.find(doc => doc.id === docId);

      if (!document) {
        return res.status(404).json({ error: '指定されたドキュメントが見つかりません' });
      }

      // ドキュメントのパスを取得
      const docPath = path.join(process.cwd(), 'knowledge-base', document.title);

      if (!fs.existsSync(docPath)) {
        return res.status(404).json({ error: 'ドキュメントファイルが見つかりません: ' + docPath });
      }

      console.log(`ドキュメント再処理を開始: ${docPath}`);

      // 再処理を実行
      const newDocId = await addDocumentToKnowledgeBase(docPath);

      res.json({ 
        success: true, 
        docId: newDocId, 
        message: 'ドキュメントが正常に再処理されました'       });
    } catch (error) {
      console.error('Error processing document:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      res.status(500).json({ error: 'ドキュメントの再処理に失敗しました: ' + errorMessage });
    }
  });

  // OpenAI API routes
  app.post("/api/chatgpt", requireAuth, async (req, res) => {
    try {
      const { text, useOnlyKnowledgeBase = true } = req.body;

      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }

      console.log(`ChatGPT API呼び出し: ナレッジベースのみを使用=${useOnlyKnowledgeBase}`);
      const response = await processOpenAIRequest(text, useOnlyKnowledgeBase);

      // Check for specific error messages returned from OpenAI
      if (response.includes("OpenAI APIキーが無効")) {
        return res.status(401).json({ message: response });
      }

      if (response.includes("OpenAI APIのリクエスト制限")) {
        return res.status(429).json({ message: response });
      }

      return res.json({ response });
    } catch (error) {
      console.error("Error in /api/chatgpt:", error);
      return res.status(500).json({ message: "Error processing request" });
    }
  });

  app.post("/api/optimize-search-query", requireAuth, async (req, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }

      const optimizedQuery = await generateSearchQuery(text);
      return res.json({ optimizedQuery });
    } catch (error) {
      console.error("Error in /api/optimize-search-query:", error);
      return res.status(500).json({ message: "Error optimizing search query" });
    }
  });

  app.post("/api/analyze-image", requireAuth, async (req, res) => {
    try {
      const { image } = req.body;

      if (!image) {
        return res.status(400).json({ message: "Image data is required" });
      }

      const result = await analyzeVehicleImage(image);

      // Check for specific error messages returned from OpenAI
      if (result.analysis.includes("OpenAI APIキーが無効")) {
        return res.status(401).json({ message: result.analysis });
      }

      if (result.analysis.includes("OpenAI APIのリクエスト制限")) {
        return res.status(429).json({ message: result.analysis });
      }

      return res.json(result);
    } catch (error) {
      console.error("Error in /api/analyze-image:", error);
      return res.status(500).json({ message: "Error analyzing image" });
    }
  });

  // Create HTTP server
  const httpServer = createServer(app);

  // Set up WebSocket server for real-time chat
  const wss = new WebSocketServer({ 
    noServer: true
  });

  // Handle upgrade requests
  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  // Make sure to properly import WebSocket type
  wss.on('connection', (ws: WebSocket) => {
    console.log("WebSocket client connected");

    ws.on('message', (message: string) => {
      console.log("Received message:", message);
      // Broadcast message to all clients
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });

    ws.on('close', () => {
      console.log("WebSocket client disconnected");
    });

    ws.on('error', (error) => {
      console.error("WebSocket error:", error);
    });

    // Send a welcome message
    ws.send(JSON.stringify({
      type: 'system',
      content: 'Connected to Emergency Recovery Chat WebSocket server'
    }));
  });
  app.use('/api/troubleshooting', troubleshootingRouter);
  app.use('/api/users', usersRouter);
  return httpServer;
}