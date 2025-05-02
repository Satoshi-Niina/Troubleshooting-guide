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

// ファイル拡張子から最適な処理タイプを決定するヘルパー関数
function determineOptimalProcessingTypes(ext: string, filename: string): {
  forKnowledgeBase: boolean;
  forImageSearch: boolean;
  forQA: boolean;
  forEmergencyGuide: boolean;
} {
  ext = ext.toLowerCase();
  filename = filename.toLowerCase();
  
  // 基本設定（すべて有効）
  const result = {
    forKnowledgeBase: true,
    forImageSearch: true,
    forQA: true,
    forEmergencyGuide: true
  };
  
  // ファイル名に特定のキーワードが含まれている場合、応急処置ガイド向けに優先
  if (
    filename.includes('応急') || 
    filename.includes('emergency') || 
    filename.includes('guide') || 
    filename.includes('ガイド') ||
    filename.includes('手順') ||
    filename.includes('procedure')
  ) {
    result.forEmergencyGuide = true;
  }
  
  // 拡張子による調整
  switch (ext) {
    case '.pdf':
    case '.docx':
    case '.doc':
    case '.txt':
      // テキスト形式のドキュメントはナレッジベースとQ&Aに最適
      result.forKnowledgeBase = true;
      result.forQA = true;
      result.forImageSearch = false; // 画像はあまり重要ではない可能性
      break;
      
    case '.pptx':
    case '.ppt':
      // プレゼンテーションは画像検索と応急処置ガイドに最適
      result.forImageSearch = true;
      result.forEmergencyGuide = true;
      break;
      
    case '.xlsx':
    case '.xls':
      // スプレッドシートはデータ主体なのでナレッジベースに最適
      result.forKnowledgeBase = true;
      result.forImageSearch = false;
      break;
  }
  
  return result;
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
      const fileExt = path.extname(originalName).toLowerCase();
      
      // 元ファイル保存オプションのみユーザーから取得
      const keepOriginalFile = req.body.keepOriginalFile === 'true';
      
      // 他の処理オプションはファイルタイプから自動決定
      const processingTypes = determineOptimalProcessingTypes(fileExt, originalName);
      const extractKnowledgeBase = processingTypes.forKnowledgeBase;
      const extractImageSearch = processingTypes.forImageSearch;
      const createQA = processingTypes.forQA;
      const createEmergencyGuide = processingTypes.forEmergencyGuide;
      
      log(`データ処理を開始します: ${originalName}`);
      log(`自動決定されたオプション: 元ファイル保存=${keepOriginalFile}, ナレッジベース=${extractKnowledgeBase}, 画像検索=${extractImageSearch}, Q&A=${createQA}, 応急処置ガイド=${createEmergencyGuide}`);
      
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
      
      // 4. 応急処置ガイド用の処理
      if (createEmergencyGuide) {
        try {
          log(`応急処置ガイド用に処理を開始します: ${originalName}`);
          
          // 既に処理されたドキュメントを使用
          if (processedDocument) {
            // ドキュメントから抽出された画像がある場合
            if (processedDocument.images && processedDocument.images.length > 0) {
              // 応急処置ガイド用のディレクトリ設定
              const guidesDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
              if (!fs.existsSync(guidesDir)) {
                fs.mkdirSync(guidesDir, { recursive: true });
              }
              
              // ドキュメント名をベースにガイドIDを生成
              const timestamp = Date.now();
              const baseName = path.basename(filePath, path.extname(filePath))
                .replace(/[\/\\:*?"<>|]/g, '')
                .replace(/\s+/g, '_');
              const guideId = `guide_${timestamp}`;
              
              // 簡易的なガイド構造を作成
              const guideData = {
                id: guideId,
                title: originalName.split('.')[0] || 'ガイド',
                createdAt: new Date().toISOString(),
                steps: processedDocument.images!.map((image: { path: string; alt?: string }, index: number) => {
                  // 各画像をステップとして登録
                  return {
                    id: `${guideId}_step${index + 1}`,
                    title: `ステップ ${index + 1}`,
                    description: image.alt || `手順説明 ${index + 1}`,
                    imageUrl: image.path ? `/knowledge-base/${image.path.split('/knowledge-base/')[1] || image.path}` : '',
                    order: index + 1
                  };
                })
              };
              
              // 応急処置ガイドのJSONファイルとして保存
              const guideFilePath = path.join(guidesDir, `${baseName}_${timestamp}.json`);
              fs.writeFileSync(
                guideFilePath,
                JSON.stringify(guideData, null, 2)
              );
              
              log(`応急処置ガイドを作成しました: ${guideFilePath} (${guideData.steps.length}ステップ)`);
              
              // メタデータファイルも保存
              const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
              if (!fs.existsSync(jsonDir)) {
                fs.mkdirSync(jsonDir, { recursive: true });
              }
              
              const metadataFilePath = path.join(jsonDir, `${guideId}_metadata.json`);
              fs.writeFileSync(
                metadataFilePath,
                JSON.stringify({
                  id: guideId,
                  title: originalName.split('.')[0] || 'ガイド',
                  createdAt: new Date().toISOString(),
                  slides: guideData.steps.map((step: any, idx: number) => ({
                    slideId: `slide${idx + 1}`,
                    title: step.title,
                    content: step.description,
                    imageUrl: step.imageUrl,
                    order: step.order
                  }))
                }, null, 2)
              );
              
              log(`応急処置ガイドのメタデータを保存しました: ${metadataFilePath}`);
            } else {
              log(`応急処置ガイド作成に必要な画像がドキュメントから抽出されませんでした`);
            }
          } else {
            log(`応急処置ガイド生成のためのドキュメント処理が完了していません`);
          }
        } catch (guideError) {
          log(`応急処置ガイド生成中にエラーが発生しました: ${guideError}`);
          // ガイド生成エラーは処理を継続
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
          createQA,
          createEmergencyGuide
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