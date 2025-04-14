import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { processDocument } from '../lib/document-processor';
import { log } from '../vite';

const router = Router();

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
    
    const filename = `emergency_guide_${baseName}_${timestamp}${originalExt}`;
    cb(null, filename);
  }
});

// アップロード設定
const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB制限
  },
  fileFilter: (req, file, cb) => {
    // PowerPointファイルのみを許可
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pptx' || ext === '.ppt') {
      cb(null, true);
    } else {
      cb(new Error('PowerPointファイル(.pptx, .ppt)のみアップロード可能です'));
    }
  }
});

// 応急処置ガイド一覧取得API
router.get('/list', async (req: Request, res: Response) => {
  try {
    const jsonDir = path.join(process.cwd(), 'public', 'uploads', 'json');
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
      return res.json([]);
    }
    
    // メタデータJSONファイルのみを取得
    const jsonFiles = fs.readdirSync(jsonDir)
      .filter(file => file.startsWith('mc_') && file.endsWith('_metadata.json'))
      .sort((a, b) => {
        // タイムスタンプで降順にソート
        const timeA = a.match(/mc_(\d+)_/)?.[1] || '0';
        const timeB = b.match(/mc_(\d+)_/)?.[1] || '0';
        return parseInt(timeB) - parseInt(timeA);
      });
    
    const guideFiles = jsonFiles.map(file => {
      const fullPath = path.join(jsonDir, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const metadata = JSON.parse(content);
        return {
          id: file.replace('_metadata.json', ''),
          filePath: fullPath,
          fileName: file,
          title: metadata.metadata?.タイトル || 'タイトルなし',
          createdAt: metadata.metadata?.作成日 || new Date().toISOString(),
          slideCount: metadata.slides?.length || 0
        };
      } catch (error) {
        console.error(`エラー: JSONファイル ${file} の処理中にエラーが発生しました`, error);
        return null;
      }
    }).filter(Boolean);
    
    return res.json(guideFiles);
  } catch (error) {
    console.error('ガイド一覧取得エラー:', error);
    return res.status(500).json({ error: 'ガイド一覧の取得に失敗しました' });
  }
});

// 応急処置ガイド詳細取得API
router.get('/detail/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const jsonDir = path.join(process.cwd(), 'public', 'uploads', 'json');
    const filePath = path.join(jsonDir, `${id}_metadata.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '指定されたガイドが見つかりません' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const guideData = JSON.parse(content);
    
    return res.json({
      id,
      data: guideData
    });
  } catch (error) {
    console.error('ガイド詳細取得エラー:', error);
    return res.status(500).json({ error: 'ガイド詳細の取得に失敗しました' });
  }
});

// 応急処置ガイド更新API
router.post('/update/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data } = req.body;
    
    const jsonDir = path.join(process.cwd(), 'public', 'uploads', 'json');
    const filePath = path.join(jsonDir, `${id}_metadata.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '指定されたガイドが見つかりません' });
    }
    
    // JSONデータを保存
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    return res.json({
      success: true,
      message: 'ガイドを更新しました',
      id
    });
  } catch (error) {
    console.error('ガイド更新エラー:', error);
    return res.status(500).json({ error: 'ガイドの更新に失敗しました' });
  }
});

// PowerPointから応急処置ガイドを生成するAPI
router.post('/process', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    
    log(`応急処置ガイドの生成を開始します: ${originalName}`);
    
    // PowerPointを処理してメタデータを抽出
    const document = await processDocument(filePath);
    const metadataJson = document.metadataJson;
    
    // メタデータJSONファイルパスからファイル名を抽出
    const metadataFileName = path.basename(metadataJson);
    const guideId = metadataFileName.replace('_metadata.json', '');
    
    // 処理後、元ファイルを削除
    try {
      fs.unlinkSync(filePath);
      log(`一時ファイルを削除しました: ${filePath}`);
    } catch (deleteError) {
      log(`一時ファイルの削除に失敗しました: ${deleteError}`);
    }
    
    // 処理成功レスポンス
    return res.status(200).json({
      success: true,
      guideId,
      metadataJson,
      message: '処理が完了しました'
    });
  } catch (error) {
    console.error('応急処置ガイド生成エラー:', error);
    return res.status(500).json({ 
      error: '応急処置ガイドの生成に失敗しました',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;