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

// ファイル拡張子からドキュメントタイプを取得するヘルパー関数
function getFileTypeFromExtension(ext: string): string {
  const extMap: Record<string, string> = {
    '.pdf': 'pdf',
    '.docx': 'word',
    '.doc': 'word',
    '.xlsx': 'excel',
    '.xls': 'excel',
    '.pptx': 'powerpoint',
    '.ppt': 'powerpoint',
    '.txt': 'text'
  };
  
  return extMap[ext] || 'unknown';
}

// ストレージ設定 - knowledge-baseに一元化
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 一時保存ディレクトリはknowledge-base内に配置
    const tempDir = path.join(process.cwd(), 'knowledge-base', 'temp');
    
    // ディレクトリの存在を確認し、ない場合は作成
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    cb(null, tempDir);
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
      let processedDocument = null;
      
      // 必ずドキュメントの処理は行う（後の処理で必要）
      processedDocument = await processDocument(filePath);
      
      if (extractKnowledgeBase) {
        // ナレッジベースに追加
        docId = await addDocumentToKnowledgeBase(filePath);
        log(`ナレッジベースに追加しました: ${docId}`);
      } else if (extractImageSearch || createQA) {
        // 画像検索やQ&Aのみの場合でも、ドキュメントIDを生成して文書一覧に表示されるようにする
        const timestamp = Date.now();
        const filename = path.basename(filePath);
        const fileExt = path.extname(filename).toLowerCase();
        const fileType = getFileTypeFromExtension(fileExt);
        
        // ユニークなIDを生成
        docId = `doc_${timestamp}_${Math.floor(Math.random() * 1000)}`;
        
        // ナレッジベースインデックスに追加
        const index = loadKnowledgeBaseIndex();
        index.documents.push({
          id: docId,
          title: filename,
          path: filePath,
          type: fileType,
          chunkCount: 0, // 実際のチャンクはないが、表示用に追加
          addedAt: new Date().toISOString()
        });
        
        // インデックスを保存
        const indexPath = path.join(process.cwd(), 'knowledge-base', 'index.json');
        fs.writeFileSync(
          indexPath,
          JSON.stringify(index, null, 2)
        );
        
        log(`画像検索/Q&A専用ドキュメントとして追加: ${docId}`);
      }
      
      // 2. 画像検索用データの生成（画像の抽出とメタデータ生成）
      if (extractImageSearch) {
        // 既に処理されたドキュメントを使用
        if (processedDocument) {
          // 必要に応じて画像検索データにアイテムを追加
          // 成功メッセージにはこの処理結果を含める
          log(`画像検索用データを生成しました: ${processedDocument.chunks.length}チャンク`);
        }
      }
      
      // 3. Q&A用の処理
      if (createQA) {
        try {
          // OpenAIモジュールを直接インポート
          const { generateQAPairs } = await import('../lib/openai');
          
          // QAペアの初期化
          let qaPairs: any[] = [];
          
          // 既に処理されたドキュメントを使用
          if (processedDocument) {
            // 本文テキストを取得
            const fullText = processedDocument.chunks.map(chunk => chunk.text).join("\n");
            
            log(`Q&A生成用のテキスト準備完了: ${fullText.length}文字`);
            
            // Q&Aペアを生成
            qaPairs = await generateQAPairs(fullText, 10);
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
          } else {
            throw new Error('Q&A生成のためのドキュメント処理が完了していません');
          }
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
  
  // ナレッジベースの差分更新API
  app.post('/api/data-processor/merge', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ファイルがアップロードされていません' });
      }
      
      const { targetDocId } = req.body;
      
      if (!targetDocId) {
        return res.status(400).json({ error: '更新対象のドキュメントIDが指定されていません' });
      }
      
      log(`差分更新を開始します: ターゲットID=${targetDocId}, ファイル=${req.file.originalname}`);
      
      // 新しいファイルを処理
      const filePath = req.file.path;
      const newDocument = await processDocument(filePath);
      
      // 差分更新を実行
      await mergeDocumentContent(newDocument, targetDocId);
      
      // 元ファイルを削除
      try {
        fs.unlinkSync(filePath);
        log(`元ファイルを削除しました: ${filePath}`);
      } catch (deleteError) {
        log(`元ファイルの削除に失敗しました: ${deleteError}`);
      }
      
      return res.status(200).json({
        success: true,
        message: '差分更新が完了しました',
        targetDocId
      });
    } catch (error) {
      console.error('差分更新エラー:', error);
      return res.status(500).json({ 
        error: '差分更新中にエラーが発生しました',
        message: error instanceof Error ? error.message : '不明なエラーです'
      });
    }
  });
  
  // ナレッジベース文書一覧取得API
  app.get('/api/data-processor/documents', (req: Request, res: Response) => {
    try {
      const index = loadKnowledgeBaseIndex();
      return res.status(200).json({
        success: true,
        documents: index.documents.map(doc => ({
          id: doc.id,
          title: doc.title,
          type: doc.type,
          chunkCount: doc.chunkCount,
          addedAt: doc.addedAt
        }))
      });
    } catch (error) {
      console.error('ドキュメント一覧取得エラー:', error);
      return res.status(500).json({ 
        error: 'ドキュメント一覧取得中にエラーが発生しました',
        message: error instanceof Error ? error.message : '不明なエラーです'
      });
    }
  });
  
  // ナレッジベースバックアップAPI
  app.post('/api/data-processor/backup', async (req: Request, res: Response) => {
    try {
      const { docIds } = req.body;
      
      if (!Array.isArray(docIds)) {
        return res.status(400).json({ error: 'ドキュメントIDのリストが必要です' });
      }
      
      log(`バックアップ作成開始: ${docIds.length}個のドキュメント`);
      
      const zipFilePath = await backupKnowledgeBase(docIds);
      
      // 相対パスを返す
      const relativePath = path.relative(process.cwd(), zipFilePath);
      
      return res.status(200).json({
        success: true,
        backupPath: relativePath,
        message: 'バックアップが作成されました'
      });
    } catch (error) {
      console.error('バックアップエラー:', error);
      return res.status(500).json({ 
        error: 'バックアップ中にエラーが発生しました',
        message: error instanceof Error ? error.message : '不明なエラーです'
      });
    }
  });
  
  // バックアップファイルのダウンロード
  app.get('/api/data-processor/download-backup/:filename', (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const backupDir = path.join(process.cwd(), 'knowledge-base', 'backups');
      const filePath = path.join(backupDir, filename);
      
      // パスのバリデーション（ディレクトリトラバーサル対策）
      if (!filePath.startsWith(backupDir) || filePath.includes('..')) {
        return res.status(400).json({ error: '不正なファイルパスです' });
      }
      
      // ファイルの存在確認
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'ファイルが見つかりません' });
      }
      
      // ファイルのダウンロード
      return res.download(filePath);
    } catch (error) {
      console.error('バックアップダウンロードエラー:', error);
      return res.status(500).json({ 
        error: 'ダウンロード中にエラーが発生しました',
        message: error instanceof Error ? error.message : '不明なエラーです'
      });
    }
  });
}