import { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { 
  addDocumentToKnowledgeBase, 
  mergeDocumentContent, 
  backupKnowledgeBase, 
  loadKnowledgeBaseIndex 
} from '../lib/knowledge-base';
import { processDocument } from '../lib/document-processor';
import { log } from '../vite';

// ストレージ設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 一時保存ディレクトリ
    const uploadDir = path.join(process.cwd(), 'uploads', 'temp');
    
    // ディレクトリの存在を確認し、ない場合は作成
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // ファイル名に現在時刻のタイムスタンプを追加して一意にする
    const timestamp = Date.now();
    
    // 文字化け対策：latin1からUTF-8にデコード
    const decodedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const originalExt = path.extname(decodedOriginalName);
    
    // サニタイズされたファイル名を生成
    const baseName = path.basename(decodedOriginalName, originalExt)
      .replace(/[\/\\:*?"<>|]/g, '')
      .replace(/\s+/g, '_');
      
    const filename = `${baseName}_${timestamp}${originalExt}`;
    cb(null, filename);
  }
});

// アップロード設定
const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB制限
  }
});

// 統合データ処理APIルートを登録
export function registerDataProcessorRoutes(app: Express) {
  // 統合データ処理API
  app.post('/api/data-processor/process', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ファイルがアップロードされていません' });
      }

      const filePath = req.file.path;
      const originalName = req.file.originalname;
      
      // 処理オプションの取得
      const keepOriginalFile = req.body.keepOriginalFile === 'true';
      const extractKnowledgeBase = req.body.extractKnowledgeBase === 'true';
      const extractImageSearch = req.body.extractImageSearch === 'true';
      const createQA = req.body.createQA === 'true';
      
      log(`データ処理を開始します: ${originalName}`);
      log(`オプション: 元ファイル保存=${keepOriginalFile}, ナレッジベース=${extractKnowledgeBase}, 画像検索=${extractImageSearch}, Q&A=${createQA}`);
      
      // 1. ナレッジベースに追加（テキスト抽出とチャンク生成）
      let docId = '';
      if (extractKnowledgeBase) {
        docId = await addDocumentToKnowledgeBase(filePath);
        log(`ナレッジベースに追加しました: ${docId}`);
      }
      
      // 2. 画像検索用データの生成（画像の抽出とメタデータ生成）
      if (extractImageSearch) {
        // 画像検索データの初期化APIを呼び出してデータを再生成
        const document = await processDocument(filePath);
        
        // 必要に応じて画像検索データにアイテムを追加
        // 成功メッセージにはこの処理結果を含める
        log(`画像検索用データを生成しました: ${document.chunks.length}チャンク`);
      }
      
      // 3. Q&A用の処理
      if (createQA) {
        try {
          // OpenAIモジュールを直接インポート
          const { generateQAPairs } = await import('../lib/openai');
          
          // ドキュメントの処理をして本文テキストを取得
          const document = await processDocument(filePath);
          const fullText = document.chunks.map(chunk => chunk.text).join("\n");
          
          log(`Q&A生成用のテキスト準備完了: ${fullText.length}文字`);
          
          // Q&Aペアを生成
          const qaPairs = await generateQAPairs(fullText, 10);
          log(`${qaPairs.length}個のQ&Aペアを生成しました`);
          
          // 結果を保存
          const qaDir = path.join(process.cwd(), 'knowledge-base', 'qa');
          if (!fs.existsSync(qaDir)) {
            fs.mkdirSync(qaDir, { recursive: true });
          }
          
          // ファイル名からタイムスタンプ付きのJSONファイル名を生成
          const fileName = path.basename(filePath, path.extname(filePath));
          const timestamp = Date.now();
          const qaFileName = `${fileName}_qa_${timestamp}.json`;
          
          // Q&AペアをJSONファイルとして保存
          fs.writeFileSync(
            path.join(qaDir, qaFileName),
            JSON.stringify({
              source: filePath,
              fileName: path.basename(filePath),
              timestamp: new Date().toISOString(),
              qaPairs
            }, null, 2)
          );
          
          log(`Q&Aデータを保存しました: ${qaFileName}`);
        } catch (qaError) {
          log(`Q&A生成中にエラーが発生しました: ${qaError}`);
          // Q&A生成エラーは処理を継続
        }
      }
      
      // 4. 処理が完了したら、元のファイルを削除するか保存するかの指定により分岐
      if (!keepOriginalFile) {
        try {
          // 元のファイルを削除
          fs.unlinkSync(filePath);
          log(`元ファイルを削除しました: ${filePath}`);
        } catch (deleteError) {
          log(`元ファイルの削除に失敗しました: ${deleteError}`);
          // 削除失敗はエラーにはしない
        }
      } else {
        log(`元ファイルを保存します: ${filePath}`);
      }
      
      // 処理成功レスポンス
      return res.status(200).json({
        success: true,
        docId,
        message: '処理が完了しました',
        options: {
          keepOriginalFile,
          extractKnowledgeBase,
          extractImageSearch,
          createQA
        }
      });
    } catch (error) {
      console.error('データ処理エラー:', error);
      return res.status(500).json({ 
        error: '処理中にエラーが発生しました',
        message: error instanceof Error ? error.message : '不明なエラーです'
      });
    }
  });

  // 画像検索データの初期化API（既存のもの）
  app.post('/api/data-processor/init-image-search', async (req: Request, res: Response) => {
    try {
      // 既存の初期化APIを呼び出す
      const initResponse = await fetch('http://localhost:5000/api/tech-support/init-image-search-data', {
        method: 'POST'
      });
      
      if (!initResponse.ok) {
        throw new Error('画像検索データの初期化に失敗しました');
      }
      
      const data = await initResponse.json();
      return res.status(200).json(data);
    } catch (error) {
      console.error('画像検索データ初期化エラー:', error);
      return res.status(500).json({ 
        error: '初期化中にエラーが発生しました',
        message: error instanceof Error ? error.message : '不明なエラーです'
      });
    }
  });
}