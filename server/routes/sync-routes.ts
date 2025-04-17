import { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { storage } from '../storage';
import { insertMediaSchema } from '@shared/schema';

// 知識ベースディレクトリを使用
const mediaDir = path.join(process.cwd(), 'knowledge-base', 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

// multerストレージ設定
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, mediaDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName) || '.jpg';
    const filename = `media_${timestamp}${ext}`;
    cb(null, filename);
  }
});

// アップロードハンドラ
const upload = multer({
  storage: mediaStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB制限
  },
  fileFilter: (req, file, cb) => {
    // 許可するMIMEタイプ
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`サポートされていないファイル形式です: ${file.mimetype}`));
    }
  }
});

export function registerSyncRoutes(app: Express): void {
  // メディアアップロードAPI
  app.post('/api/media/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ファイルがアップロードされていません' });
      }
      
      // アップロードされたメディアのメタデータを返す
      const mediaUrl = `/knowledge-base/media/${req.file.filename}`;
      
      // メディアの種類（画像/動画/音声）を判定
      let mediaType = 'image';
      if (req.file.mimetype.startsWith('video/')) {
        mediaType = 'video';
      } else if (req.file.mimetype.startsWith('audio/')) {
        mediaType = 'audio';
      }
      
      // サムネイル生成などの処理はここに追加（必要に応じて）
      
      res.json({
        success: true,
        url: mediaUrl,
        type: mediaType,
        size: req.file.size
      });
    } catch (error) {
      console.error('メディアアップロードエラー:', error);
      res.status(500).json({ error: 'メディアのアップロードに失敗しました' });
    }
  });
  
  // チャットメッセージの同期API
  app.post('/api/chats/:id/sync-messages', async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: '認証されていません' });
      }
      
      const userId = req.session.userId;
      const chatId = parseInt(req.params.id);
      const { messages } = req.body;
      
      // チャットの存在確認
      const chat = await storage.getChat(chatId);
      if (!chat) {
        return res.status(404).json({ error: 'チャットが見つかりません' });
      }
      
      // チャットアクセス権限（コメントアウトで全ユーザーに解放）
      // if (chat.userId !== userId) {
      //   return res.status(403).json({ error: 'アクセス権限がありません' });
      // }
      
      // メッセージを処理
      const processedMessages = [];
      for (const message of messages) {
        try {
          // メッセージを保存（timestampはサーバー側で設定される）
          const savedMessage = await storage.createMessage({
            chatId,
            content: message.content,
            isAiResponse: message.role === 'assistant'
          });
          
          // メディアを処理
          if (message.media && Array.isArray(message.media)) {
            for (const mediaItem of message.media) {
              // URLからファイル名を抽出
              const mediaUrl = mediaItem.url;
              
              // データベースにメディア情報を保存
              await storage.createMedia({
                messageId: savedMessage.id,
                type: mediaItem.type || 'image',
                url: mediaUrl,
                thumbnail: mediaItem.thumbnail
              });
            }
          }
          
          processedMessages.push(savedMessage.id);
        } catch (messageError) {
          console.error(`メッセージ処理エラー:`, messageError);
          // 1件のメッセージエラーで全体を失敗させないよう続行
        }
      }
      
      // チャットエクスポートレコードを更新
      await storage.saveChatExport(chatId, userId, new Date());
      
      res.json({
        success: true,
        syncedCount: processedMessages.length,
        messageIds: processedMessages
      });
    } catch (error) {
      console.error('メッセージ同期エラー:', error);
      res.status(500).json({ error: 'メッセージの同期に失敗しました' });
    }
  });
}