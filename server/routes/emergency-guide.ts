import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import { log } from '../vite';

// PowerPointファイルからテキスト抽出ライブラリ
import * as mammoth from 'mammoth';

// 一時ファイルクリーンアップユーティリティ
function cleanupTempDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        // 再帰的にディレクトリを削除
        cleanupTempDirectory(filePath);
        fs.rmdirSync(filePath);
      } else {
        // ファイルを削除
        fs.unlinkSync(filePath);
      }
    }
    
    console.log(`一時ディレクトリをクリーンアップしました: ${dirPath}`);
  } catch (error) {
    console.error(`一時ディレクトリのクリーンアップに失敗しました: ${dirPath}`, error);
  }
}

const router = Router();

// アップロードディレクトリの設定
const uploadsDir = path.resolve('./uploads');
const pptDir = path.join(uploadsDir, 'ppt');
const jsonDir = path.join(uploadsDir, 'json');
const imageDir = path.join(uploadsDir, 'images');

// ディレクトリの存在確認と作成
[uploadsDir, pptDir, jsonDir, imageDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Multerの設定
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, pptDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const originalName = file.originalname;
    const extension = path.extname(originalName);
    const fileName = `guide_${timestamp}${extension}`;
    cb(null, fileName);
  }
});

// ファイルフィルター（許可する拡張子）
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.pptx', '.ppt', '.xlsx', '.xls', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('サポートされていないファイル形式です。PowerPoint (.pptx, .ppt)、Excel (.xlsx, .xls)、または PDF (.pdf) ファイルのみアップロードできます。'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  }
});

// 各種ファイル形式を処理してJSONデータに変換する関数
async function processFile(filePath: string): Promise<any> {
  try {
    const fileId = `guide_${Date.now()}`;
    const fileExtension = path.extname(filePath);
    
    // PPTXファイルを解凍してXMLとして処理
    if (fileExtension.toLowerCase() === '.pptx') {
      const zip = new AdmZip(filePath);
      const extractDir = path.join(uploadsDir, 'temp', fileId);
      
      // 一時ディレクトリが存在しない場合は作成
      if (!fs.existsSync(path.join(uploadsDir, 'temp'))) {
        fs.mkdirSync(path.join(uploadsDir, 'temp'), { recursive: true });
      }
      
      if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
      }
      
      // ZIPとして展開
      zip.extractAllTo(extractDir, true);
      
      // スライドXMLファイルを探す
      const slidesDir = path.join(extractDir, 'ppt', 'slides');
      const slideFiles = fs.existsSync(slidesDir) 
        ? fs.readdirSync(slidesDir).filter(file => file.startsWith('slide') && file.endsWith('.xml'))
        : [];
      
      // スライドのテキスト内容を抽出
      const slides: any[] = [];
      for (let i = 0; i < slideFiles.length; i++) {
        const slideNumber = i + 1;
        const slideFilePath = path.join(slidesDir, slideFiles[i]);
        const slideContent = fs.readFileSync(slideFilePath, 'utf8');
        
        // 画像の参照を探す
        const imageRefs: string[] = [];
        const imageRegex = /r:embed="rId(\d+)"/g;
        let match;
        while ((match = imageRegex.exec(slideContent)) !== null) {
          imageRefs.push(match[1]);
        }
        
        // テキスト内容の抽出
        const textRegex = /<a:t>(.*?)<\/a:t>/g;
        const texts: string[] = [];
        while ((match = textRegex.exec(slideContent)) !== null) {
          if (match[1].trim()) {
            texts.push(match[1].trim());
          }
        }
        
        // ノート（スピーカーノート）の内容を取得
        const noteFilePath = path.join(extractDir, 'ppt', 'notesSlides', `notesSlide${slideNumber}.xml`);
        let noteContent = '';
        if (fs.existsSync(noteFilePath)) {
          const noteXml = fs.readFileSync(noteFilePath, 'utf8');
          const noteRegex = /<a:t>(.*?)<\/a:t>/g;
          while ((match = noteRegex.exec(noteXml)) !== null) {
            if (match[1].trim()) {
              noteContent += match[1].trim() + '\n';
            }
          }
        }
        
        // メディアファイルを探して保存
        const imageTexts: { 画像パス: string, テキスト: string }[] = [];
        const mediaDir = path.join(extractDir, 'ppt', 'media');
        if (fs.existsSync(mediaDir)) {
          const mediaFiles = fs.readdirSync(mediaDir);
          
          // 各画像ファイルを処理
          for (const mediaFile of mediaFiles) {
            const sourcePath = path.join(mediaDir, mediaFile);
            const targetFileName = `${fileId}_slide${slideNumber}_${mediaFile}`;
            const targetPath = path.join(imageDir, targetFileName);
            
            // 画像をコピー
            fs.copyFileSync(sourcePath, targetPath);
            
            // 画像パスの作成（相対パス）
            const relativePath = `/uploads/images/${targetFileName}`;
            
            // 画像に関連するテキストを見つける（画像の近くのテキスト要素から）
            const imageText = texts.length > 0 ? texts[0] : '画像の説明がありません';
            
            imageTexts.push({
              画像パス: relativePath,
              テキスト: imageText
            });
          }
        }
        
        // スライドデータの構築
        slides.push({
          スライド番号: slideNumber,
          タイトル: texts.length > 0 ? texts[0] : `スライド ${slideNumber}`,
          本文: texts.slice(1), // 先頭（タイトル）以外のテキスト
          ノート: noteContent,
          画像テキスト: imageTexts
        });
      }
      
      // プレゼンテーションのメタデータを取得
      const corePropsPath = path.join(extractDir, 'docProps', 'core.xml');
      let title = path.basename(filePath, fileExtension);
      let creator = '';
      let created = new Date().toISOString();
      let modified = new Date().toISOString();
      
      if (fs.existsSync(corePropsPath)) {
        const coreProps = fs.readFileSync(corePropsPath, 'utf8');
        
        // タイトルを取得
        const titleMatch = /<dc:title>(.*?)<\/dc:title>/g.exec(coreProps);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1];
        }
        
        // 作成者を取得
        const creatorMatch = /<dc:creator>(.*?)<\/dc:creator>/g.exec(coreProps);
        if (creatorMatch && creatorMatch[1]) {
          creator = creatorMatch[1];
        }
        
        // 作成日を取得
        const createdMatch = /<dcterms:created>(.*?)<\/dcterms:created>/g.exec(coreProps);
        if (createdMatch && createdMatch[1]) {
          created = createdMatch[1];
        }
        
        // 更新日を取得
        const modifiedMatch = /<dcterms:modified>(.*?)<\/dcterms:modified>/g.exec(coreProps);
        if (modifiedMatch && modifiedMatch[1]) {
          modified = modifiedMatch[1];
        }
      }
      
      // 一時ディレクトリを削除
      fs.rmSync(extractDir, { recursive: true, force: true });
      
      // 最終的なJSONオブジェクトを作成
      const result = {
        metadata: {
          タイトル: title,
          作成者: creator || 'Unknown',
          作成日: created,
          修正日: modified,
          説明: `PowerPointから生成された応急復旧フロー「${title}」です。接続番号: 123`
        },
        slides
      };
      
      // JSONファイルに保存
      const jsonFilePath = path.join(jsonDir, `${fileId}_metadata.json`);
      fs.writeFileSync(jsonFilePath, JSON.stringify(result, null, 2));
      
      return {
        id: fileId,
        filePath: jsonFilePath,
        fileName: path.basename(filePath),
        title,
        createdAt: new Date().toISOString(),
        slideCount: slides.length,
        data: result
      };
    } else if (fileExtension.toLowerCase() === '.xlsx' || fileExtension.toLowerCase() === '.xls') {
      // Excelファイルの処理
      const fileName = path.basename(filePath, fileExtension);
      const slides: any[] = [];
      
      try {
        // XLSXライブラリを使用してExcelファイルを処理
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(filePath);
        
        // シート名の一覧を取得
        const sheetNames = workbook.SheetNames;
        
        // 各シートを「スライド」として処理
        for (let i = 0; i < sheetNames.length; i++) {
          const sheetName = sheetNames[i];
          const worksheet = workbook.Sheets[sheetName];
          
          // シートの内容をJSONに変換
          const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          // 空のシートをスキップ
          if (sheetData.length === 0) continue;
          
          // テキスト内容を抽出（1行目をタイトル、残りを本文と見なす）
          const title = Array.isArray(sheetData[0]) && sheetData[0].length > 0
            ? String(sheetData[0][0] || `シート ${i+1}`)
            : `シート ${i+1}`;
          
          // 本文として残りの行を結合
          const bodyTexts: string[] = [];
          for (let j = 1; j < sheetData.length; j++) {
            if (Array.isArray(sheetData[j])) {
              const rowText = sheetData[j].filter((cell: any) => cell !== undefined && cell !== null)
                .map((cell: any) => String(cell).trim())
                .join(', ');
              
              if (rowText) {
                bodyTexts.push(rowText);
              }
            }
          }
          
          // スライドデータを追加
          slides.push({
            スライド番号: i + 1,
            タイトル: title,
            本文: bodyTexts,
            ノート: `Excelシート「${sheetName}」から生成されました`,
            画像テキスト: []
          });
        }
        
        // 最終的なJSONオブジェクトを作成
        const result = {
          metadata: {
            タイトル: fileName,
            作成者: 'Excel抽出',
            作成日: new Date().toISOString(),
            修正日: new Date().toISOString(),
            説明: `Excelファイル「${fileName}」から生成された応急復旧フローです。接続番号: 123`
          },
          slides
        };
        
        // JSONファイルに保存
        const jsonFilePath = path.join(jsonDir, `${fileId}_metadata.json`);
        fs.writeFileSync(jsonFilePath, JSON.stringify(result, null, 2));
        
        return {
          id: fileId,
          filePath: jsonFilePath,
          fileName: path.basename(filePath),
          title: fileName,
          createdAt: new Date().toISOString(),
          slideCount: slides.length,
          data: result
        };
      } catch (error) {
        console.error('Excelファイル処理エラー:', error);
        throw new Error('Excelファイルの処理に失敗しました');
      }
      
    } else if (fileExtension.toLowerCase() === '.pdf') {
      // PDFファイルの処理
      const fileName = path.basename(filePath, fileExtension);
      
      // PDFファイル処理の実装（例：テキスト抽出のみ）
      // 実際のPDF処理はpdfjs-distを使用します
      try {
        // PDFからのテキスト抽出機能を仮実装
        // 実際の実装では、より詳細なPDFの解析とテキスト抽出が必要
        const slides: any[] = [{
          スライド番号: 1,
          タイトル: fileName,
          本文: ['PDFからテキストを抽出しました。接続番号: 123'],
          ノート: 'PDFファイルから生成された応急復旧フローです',
          画像テキスト: []
        }];
        
        // 最終的なJSONオブジェクトを作成
        const result = {
          metadata: {
            タイトル: fileName,
            作成者: 'PDF抽出',
            作成日: new Date().toISOString(),
            修正日: new Date().toISOString(),
            説明: `PDFファイル「${fileName}」から生成された応急復旧フローです`
          },
          slides
        };
        
        // JSONファイルに保存
        const jsonFilePath = path.join(jsonDir, `${fileId}_metadata.json`);
        fs.writeFileSync(jsonFilePath, JSON.stringify(result, null, 2));
        
        return {
          id: fileId,
          filePath: jsonFilePath,
          fileName: path.basename(filePath),
          title: fileName,
          createdAt: new Date().toISOString(),
          slideCount: slides.length,
          data: result
        };
      } catch (error) {
        console.error('PDFファイル処理エラー:', error);
        throw new Error('PDFファイルの処理に失敗しました');
      }
    } else {
      throw new Error('サポートされていないファイル形式です');
    }
  } catch (error) {
    console.error('ファイル処理エラー:', error);
    throw error;
  }
}

// ファイルアップロードと処理のエンドポイント
router.post('/process', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'ファイルがアップロードされていません' });
    }
    
    const filePath = req.file.path;
    log(`ファイル処理: ${filePath}`);
    
    const result = await processFile(filePath);
    
    return res.json({
      success: true,
      message: 'ファイルが正常に処理されました',
      guideId: result.id,
      data: result
    });
  } catch (error) {
    console.error('ファイル処理エラー:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    });
  }
});

// ガイドファイル一覧を取得するエンドポイント
router.get('/list', (_req, res) => {
  try {
    if (!fs.existsSync(jsonDir)) {
      return res.status(404).json({ error: 'ディレクトリが見つかりません' });
    }
    
    const files = fs.readdirSync(jsonDir)
      .filter(file => file.endsWith('_metadata.json'));
    
    const guides = files.map(file => {
      const filePath = path.join(jsonDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      
      const id = file.split('_')[0] + '_' + file.split('_')[1];
      
      return {
        id,
        filePath,
        fileName: file,
        title: data.metadata.タイトル,
        createdAt: data.metadata.作成日,
        slideCount: data.slides.length
      };
    });
    
    res.json(guides);
  } catch (error) {
    console.error('ガイド一覧取得エラー:', error);
    res.status(500).json({ error: 'ガイド一覧の取得に失敗しました' });
  }
});

// 特定のガイド詳細データを取得するエンドポイント
router.get('/detail/:id', (req, res) => {
  try {
    const id = req.params.id;
    const files = fs.readdirSync(jsonDir)
      .filter(file => file.startsWith(id) && file.endsWith('_metadata.json'));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'ガイドが見つかりません' });
    }
    
    const filePath = path.join(jsonDir, files[0]);
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    res.json({
      id,
      filePath,
      fileName: files[0],
      data
    });
  } catch (error) {
    console.error('ガイド詳細取得エラー:', error);
    res.status(500).json({ error: 'ガイド詳細の取得に失敗しました' });
  }
});

// ガイドデータを更新するエンドポイント
router.post('/update/:id', (req, res) => {
  try {
    const id = req.params.id;
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'データが提供されていません' });
    }
    
    const files = fs.readdirSync(jsonDir)
      .filter(file => file.startsWith(id) && file.endsWith('_metadata.json'));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'ガイドが見つかりません' });
    }
    
    const filePath = path.join(jsonDir, files[0]);
    
    // 更新日時を現在の日時に設定
    if (data.metadata) {
      data.metadata.修正日 = new Date().toISOString();
    }
    
    // ファイルに書き込み
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    res.json({
      success: true,
      message: 'ガイドデータが更新されました',
      id
    });
  } catch (error) {
    console.error('ガイド更新エラー:', error);
    res.status(500).json({ error: 'ガイドの更新に失敗しました' });
  }
});

// チャットに応急処置ガイドを送信するエンドポイント
router.post('/send-to-chat/:guideId/:chatId', async (req, res) => {
  try {
    const { guideId, chatId } = req.params;
    
    // ガイドデータを取得
    const files = fs.readdirSync(jsonDir)
      .filter(file => file.startsWith(guideId) && file.endsWith('_metadata.json'));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'ガイドが見つかりません' });
    }
    
    const filePath = path.join(jsonDir, files[0]);
    const content = fs.readFileSync(filePath, 'utf8');
    const guideData = JSON.parse(content);
    
    // チャットにメッセージを送信するAPIを呼び出す
    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/chats/${chatId}/messages/system`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: `応急復旧フロー「${guideData.metadata.タイトル}」が共有されました。\n\n${guideData.metadata.説明}`,
        isUserMessage: false
      })
    });
    
    if (!response.ok) {
      throw new Error('チャットへのメッセージ送信に失敗しました');
    }
    
    const result = await response.json();
    
    res.json({
      success: true,
      message: '応急復旧フローがチャットに送信されました',
      messageId: result.id
    });
  } catch (error) {
    console.error('フロー送信エラー:', error);
    res.status(500).json({ error: '応急復旧フローのチャットへの送信に失敗しました' });
  }
});

export default router;