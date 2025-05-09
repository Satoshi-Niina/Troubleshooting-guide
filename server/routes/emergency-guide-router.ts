import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import fetch from 'node-fetch';
import { log } from '../vite';

// PowerPointファイルからテキスト抽出ライブラリ
import * as mammoth from 'mammoth';

// 型定義
interface ImageText {
  画像パス: string;
  テキスト: string;
}

interface Slide {
  スライド番号?: number;
  タイトル?: string;
  本文?: string[];
  ノート?: string;
  画像テキスト?: ImageText[];
  imageUrl?: string;
}

interface GuideData {
  slides?: Slide[];
  metadata?: {
    タイトル: string;
    作成者?: string;
    作成日?: string;
    修正日?: string;
    説明?: string;
  };
  title?: string;
  description?: string;
}

const router = Router();

// 知識ベースディレクトリの設定 - uploadsフォルダの使用を廃止
const knowledgeBaseDir = path.resolve('./knowledge-base');
const kbPptDir = path.join(knowledgeBaseDir, 'ppt');
const kbJsonDir = path.join(knowledgeBaseDir, 'json');
const kbImageDir = path.join(knowledgeBaseDir, 'images');
const kbTempDir = path.join(knowledgeBaseDir, 'temp');

// ディレクトリの存在確認と作成
[knowledgeBaseDir, kbPptDir, kbJsonDir, kbImageDir, kbTempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// クリーンアップ処理：問題となるファイルを削除 (開発用)
const cleanupSpecificFiles = () => {
  try {
    // 問題のあるガイドファイルを確認して削除
    const problemFile = path.join(kbJsonDir, 'guide_1744876404679_metadata.json');
    if (fs.existsSync(problemFile)) {
      console.log('問題となるファイルを削除します:', problemFile);
      fs.unlinkSync(problemFile);
    }
    
    // 関連する画像を削除
    if (fs.existsSync(kbImageDir)) {
      const imageFiles = fs.readdirSync(kbImageDir);
      const relatedImages = imageFiles.filter(img => img.startsWith('guide_1744876404679'));
      
      relatedImages.forEach(imgFile => {
        const imgPath = path.join(kbImageDir, imgFile);
        if (fs.existsSync(imgPath)) {
          fs.unlinkSync(imgPath);
          console.log('関連画像を削除しました:', imgPath);
        }
      });
    }
  } catch (error) {
    console.error('クリーンアップ中にエラーが発生しました:', error);
  }
};

// アプリケーション起動時にクリーンアップを実行
cleanupSpecificFiles();

// Multerの設定
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, kbPptDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const originalName = file.originalname;
    const extension = path.extname(originalName);
    const fileName = `guide_${timestamp}${extension}`;
    cb(null, fileName);
  }
});

// ファイルフィルター（PPTX、PDFとJSONを許可）
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.pptx', '.ppt', '.pdf', '.xlsx', '.xls', '.json'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('サポートされていないファイル形式です。PowerPoint (.pptx, .ppt)、Excel (.xlsx, .xls)、PDF (.pdf)、またはJSON (.json) ファイルのみアップロードできます。'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  }
});

// PowerPoint（PPTX）ファイルを処理してJSONデータに変換する関数
async function processPowerPointFile(filePath: string): Promise<any> {
  try {
    const fileId = `guide_${Date.now()}`;
    const fileExtension = path.extname(filePath);
    
    // PPTXファイルを解凍してXMLとして処理
    if (fileExtension.toLowerCase() === '.pptx') {
      const zip = new AdmZip(filePath);
      const extractDir = path.join(kbTempDir, fileId);
      
      // 一時ディレクトリが存在しない場合は作成
      if (!fs.existsSync(kbTempDir)) {
        fs.mkdirSync(kbTempDir, { recursive: true });
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
            const targetPath = path.join(kbImageDir, targetFileName);
            
            // 画像をコピー
            fs.copyFileSync(sourcePath, targetPath);
            
            // 画像パスの作成（相対パス）
            const relativePath = `/knowledge-base/images/${targetFileName}`;
            
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
          説明: `PowerPointから生成された応急処置ガイド「${title}」です。接続番号: 123`
        },
        slides
      };
      
      // JSONファイルを知識ベースディレクトリに保存
      const kbJsonFilePath = path.join(kbJsonDir, `${fileId}_metadata.json`);
      fs.writeFileSync(kbJsonFilePath, JSON.stringify(result, null, 2));
      
      return {
        id: fileId,
        filePath: kbJsonFilePath,
        fileName: path.basename(filePath),
        title,
        createdAt: new Date().toISOString(),
        slideCount: slides.length,
        data: result
      };
    } else {
      throw new Error('サポートされていないファイル形式です');
    }
  } catch (error) {
    console.error('PowerPointファイル処理エラー:', error);
    throw error;
  }
}

// JSONファイルを処理する関数
async function processJsonFile(filePath: string): Promise<any> {
  try {
    const fileId = `guide_${Date.now()}`;
    console.log(`JSONファイル処理: ID=${fileId}`);
    
    // 知識ベースディレクトリが存在することを確認
    if (!fs.existsSync(kbJsonDir)) {
      fs.mkdirSync(kbJsonDir, { recursive: true });
      console.log(`知識ベースJSONディレクトリを作成: ${kbJsonDir}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(fileContent);
    
    // ファイルパスとファイル名をログ出力
    console.log(`元のファイルパス: ${filePath}`);
    console.log(`元のファイル名: ${path.basename(filePath)}`);
    
    // アップロードされた画像パスがある場合、相対パスに変換
    if (jsonData.steps) {
      for (const step of jsonData.steps) {
        if (step.imageUrl && step.imageUrl.startsWith('/uploads/')) {
          step.imageUrl = step.imageUrl.replace('/uploads/', '/knowledge-base/');
        }
      }
    }
    
    // 知識ベースディレクトリに一箇所だけ保存（画像パスはナレッジベースの相対パスを使用）
    const kbJsonFilePath = path.join(kbJsonDir, `${fileId}_metadata.json`);
    console.log(`保存先ファイルパス: ${kbJsonFilePath}`);
    
    // JSONデータを文字列に変換して保存（コピーではなく書き込み）
    fs.writeFileSync(kbJsonFilePath, JSON.stringify(jsonData, null, 2));
    console.log(`ファイルを保存しました: ${kbJsonFilePath}`);
    
    // タイトルなどの情報を取得
    const title = jsonData.title || path.basename(filePath, '.json');
    const slideCount = jsonData.steps ? jsonData.steps.length : 0;
    
    return {
      id: fileId,
      filePath: kbJsonFilePath,
      fileName: path.basename(filePath),
      title,
      createdAt: new Date().toISOString(),
      slideCount,
      data: jsonData
    };
  } catch (error) {
    console.error('JSONファイル処理エラー:', error);
    throw error;
  }
}

// ファイルアップロードと処理のエンドポイント
router.post('/process', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'ファイルがアップロードされていません' });
    }
    
    // 自動フロー生成オプションを取得
    const autoGenerateFlow = req.body.autoGenerateFlow === 'true';
    const filePath = req.file.path;
    const fileExtension = path.extname(filePath).toLowerCase();
    
    let result;
    
    // ファイル形式に応じた処理
    if (fileExtension === '.json') {
      log(`JSONファイル処理: ${filePath}`);
      result = await processJsonFile(filePath);
    } else if (['.pptx', '.ppt'].includes(fileExtension)) {
      log(`PowerPointファイル処理: ${filePath}`);
      result = await processPowerPointFile(filePath);
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'サポートされていないファイル形式です。現在の処理はPowerPointとJSONのみサポートしています。' 
      });
    }
    
    // JSONに保存されている画像パスがナレッジベース形式に変換されていることを確認
    if (fileExtension === '.json') {
      // ナレッジベースディレクトリのパスを確保
      const knowledgeBaseDir = path.join('knowledge-base');
      if (!fs.existsSync(knowledgeBaseDir)) {
        fs.mkdirSync(knowledgeBaseDir, { recursive: true });
      }
      
      const knowledgeBaseImagesDir = path.join(knowledgeBaseDir, 'images');
      if (!fs.existsSync(knowledgeBaseImagesDir)) {
        fs.mkdirSync(knowledgeBaseImagesDir, { recursive: true });
      }
    }
    
    // レスポンス用のデータ
    const responseData = {
      success: true,
      message: 'ファイルが正常に処理されました',
      guideId: result.id,
      data: result
    };
    
    // 自動フロー生成が有効な場合は、非同期でフロー生成プロセスを開始
    if (autoGenerateFlow) {
      // まずレスポンスを返してクライアントを待たせない
      res.json(responseData);
      
      try {
        console.log(`自動フロー生成を開始: ${result.id}`);
        // 別プロセスでフロー生成APIを呼び出す（バックグラウンド処理）
        fetch(`http://localhost:${process.env.PORT || 3000}/api/flow-generator/generate-from-guide/${result.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }).then(async response => {
          if (response.ok) {
            const generationResult = await response.json() as { flowData: { id: string } };
            console.log(`フロー生成成功: ${generationResult.flowData.id}`);
          } else {
            console.error('フロー生成エラー:', await response.text());
          }
        }).catch(err => {
          console.error('フロー生成リクエストエラー:', err);
        });
      } catch (error) {
        console.error('自動フロー生成開始エラー:', error);
        // エラーが発生してもクライアントには既にレスポンスを返しているので何もしない
      }
      
      // レスポンスは既に返しているのでここでは何もしない
      return;
    }
    
    // 自動フロー生成が無効な場合は通常のレスポンスを返す
    return res.json(responseData);
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
    console.log('ガイド一覧を取得します...');
    
    // 知識ベースディレクトリからファイルを読み取る
    if (!fs.existsSync(kbJsonDir)) {
      return res.status(404).json({ error: 'ディレクトリが見つかりません' });
    }
    
    // キャッシュバスティングのためにファイル一覧を再スキャン
    const allFiles = fs.readdirSync(kbJsonDir);
    console.log('全ファイル一覧:', allFiles);
    
    // 特定のファイルを除外するためのブラックリスト
    const blacklist = ['guide_1744876404679_metadata.json'];
    
    // メタデータファイルのみをフィルタリング（かつブラックリストを除外）
    const files = allFiles
      .filter(file => file.endsWith('_metadata.json') && !blacklist.includes(file));
    
    console.log('フィルタリング後のメタデータファイル一覧:', files);
    
    const guides = files.map(file => {
      try {
        const filePath = path.join(kbJsonDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        const id = file.split('_')[0] + '_' + file.split('_')[1];
        
        // JSONデータの形式に応じて処理
        // 通常のPowerPoint由来の形式
        if (data.metadata && data.slides) {
          return {
            id,
            filePath,
            fileName: data.metadata.タイトル || `ファイル_${id}`,
            title: data.metadata.タイトル || `ファイル_${id}`,
            createdAt: data.metadata.作成日,
            slideCount: data.slides.length
          };
        } 
        // JSON由来の応急処置フロー形式
        else if (data.title && data.steps) {
          return {
            id,
            filePath,
            fileName: data.title || `フロー_${id}`,
            title: data.title || `フロー_${id}`,
            createdAt: data.createdAt || new Date().toISOString(),
            slideCount: data.steps.length
          };
        } 
        // その他の形式の場合はファイル名をタイトルとして使用
        else {
          return {
            id,
            filePath,
            fileName: `ファイル_${id}`,
            title: `ファイル_${id}`,
            createdAt: new Date().toISOString(),
            slideCount: 0
          };
        }
      } catch (err) {
        console.error(`ファイル処理エラー: ${file}`, err);
        // エラーの場合は最低限の情報を返す
        const id = file.split('_')[0] + '_' + file.split('_')[1];
        return {
          id,
          filePath: path.join(kbJsonDir, file),
          fileName: `エラーファイル_${id}`,
          title: `エラーファイル_${id}`,
          createdAt: new Date().toISOString(),
          slideCount: 0
        };
      }
    });
    
    // リスト取得前の最終状態チェック（完全にファイルシステムと同期するため）
    console.log('応急ガイド一覧をレスポンス送信前に最終検証:');
    console.log('- JSONディレクトリの内容:', fs.readdirSync(kbJsonDir));
    console.log('- 返却するガイド数:', guides.length);
    console.log('- ガイドID一覧:', guides.map(g => g.id).join(', '));
    
    // ヘッダーの追加でキャッシュを無効化
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // レスポンスを返す
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
    const files = fs.readdirSync(kbJsonDir)
      .filter(file => file.startsWith(id) && file.endsWith('_metadata.json'));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'ガイドが見つかりません' });
    }
    
    const filePath = path.join(kbJsonDir, files[0]);
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // アップロードパス(/uploads/)からナレッジベースパス(/knowledge-base/)への変換
    // スライド内の画像パスを更新
    if (data.slides && Array.isArray(data.slides)) {
      data.slides.forEach((slide: any) => {
        if (slide.画像テキスト && Array.isArray(slide.画像テキスト)) {
          slide.画像テキスト.forEach((imgText: any) => {
            if (imgText.画像パス && imgText.画像パス.startsWith('/uploads/')) {
              // パスを/knowledge-baseに置き換え
              imgText.画像パス = imgText.画像パス.replace('/uploads/', '/knowledge-base/');
              console.log(`画像パスを更新: ${imgText.画像パス}`);
            }
          });
        }
      });
    }
    
    // JSONファイル内のデータが修正されたらファイルも更新（オプション）
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
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
    
    const files = fs.readdirSync(kbJsonDir)
      .filter(file => file.startsWith(id) && file.endsWith('_metadata.json'));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'ガイドが見つかりません' });
    }
    
    const filePath = path.join(kbJsonDir, files[0]);
    
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

// ガイドデータを削除するエンドポイント
router.delete('/delete/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`応急処置ガイド削除リクエスト: ID=${id}`);
    
    // 知識ベースJson（メタデータ）ディレクトリから直接ファイルを検索
    if (!fs.existsSync(kbJsonDir)) {
      return res.status(404).json({ error: 'JSONディレクトリが見つかりません' });
    }
    
    // すべてのJSONファイルを検索し、マッチするものを選択
    const jsonFiles = fs.readdirSync(kbJsonDir);
    console.log(`削除処理: ID=${id}, ファイル一覧:`, jsonFiles);
    
    // IDによる検索方法を選択
    const matchingFiles: string[] = [];
    
    if (id.startsWith('mc_')) {
      // mc_形式のIDの場合は厳密なID検索 (数値部分で照合)
      const idPrefix = id.split('_')[1]; // mc_123456 -> 123456
      console.log(`mc_タイプのID検索: プレフィックス=${idPrefix}`);
      
      jsonFiles.forEach(file => {
        if (file.includes(idPrefix)) {
          matchingFiles.push(file);
        }
      });
    } else {
      // guide_形式のIDは前方一致で検索
      jsonFiles.forEach(file => {
        if (file.startsWith(id)) {
          matchingFiles.push(file);
        }
      });
    }
    
    console.log(`マッチするファイル (${matchingFiles.length}件):`, matchingFiles);
    
    if (matchingFiles.length === 0) {
      return res.status(404).json({ error: `指定されたガイド (ID: ${id}) が見つかりません` });
    }
    
    // 最初のファイルからタイトル情報などを取得
    const mainFilePath = path.join(kbJsonDir, matchingFiles[0]);
    let title = `ファイル_${id}`;
    
    // JSONファイルの内容を読み取り、タイトルなどを取得
    try {
      const content = fs.readFileSync(mainFilePath, 'utf8');
      const data = JSON.parse(content);
      
      if (data.metadata && data.metadata.タイトル) {
        title = data.metadata.タイトル;
      } else if (data.title) {
        title = data.title;
      }
    } catch (readError) {
      console.warn(`削除前のファイル内容読み取りに失敗: ${mainFilePath}`, readError);
    }
    
    // すべてのマッチするファイルを削除
    let deletedCount = 0;
    for (const file of matchingFiles) {
      const filePath = path.join(kbJsonDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`JSONファイルを削除しました: ${filePath}`);
        deletedCount++;
      }
    }
    
    console.log(`削除されたJSONファイル数: ${deletedCount}件`);
    
    // index.jsonから該当エントリを削除（存在する場合）
    const indexPath = path.join(knowledgeBaseDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        const indexData = JSON.parse(indexContent);
        
        // IDに基づいてエントリを削除
        if (Array.isArray(indexData.guides)) {
          const beforeCount = indexData.guides.length;
          indexData.guides = indexData.guides.filter((guide: any) => guide.id !== id);
          const afterCount = indexData.guides.length;
          
          if (beforeCount !== afterCount) {
            fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
            console.log(`インデックスから削除しました: ${beforeCount - afterCount}エントリ`);
          }
        }
      } catch (indexError) {
        console.warn('インデックスの更新に失敗しました:', indexError);
      }
    }
    
    // 関連する画像ファイルを削除
    try {
      if (fs.existsSync(kbImageDir)) {
        const imageFiles = fs.readdirSync(kbImageDir);
        const relatedImages = imageFiles.filter(img => img.startsWith(id));
        
        for (const imgFile of relatedImages) {
          const imgPath = path.join(kbImageDir, imgFile);
          fs.unlinkSync(imgPath);
          console.log(`関連画像を削除しました: ${imgPath}`);
        }
      }
    } catch (imgError) {
      console.warn('関連画像の削除中にエラーが発生しました:', imgError);
    }
    
    console.log(`応急処置ガイドを削除しました: ID=${id}, タイトル=${title}`);
    
    // 削除後の最終確認（ファイルシステムを再チェック）
    const remainingFiles = fs.readdirSync(kbJsonDir);
    console.log('----------- 削除後の状態 -----------');
    console.log('削除したID:', id);
    console.log('削除後のディレクトリ内容:', remainingFiles);
    console.log('削除したファイル:', matchingFiles);
    
    // 削除が不完全な場合は強制再試行（最大3回）
    for (let attempt = 0; attempt < 3; attempt++) {
      let allDeleted = true;
      
      for (const file of matchingFiles) {
        const filePath = path.join(kbJsonDir, file);
        if (fs.existsSync(filePath)) {
          allDeleted = false;
          console.log(`削除が不完全なため強制再試行 (${attempt + 1}/3): ${filePath}`);
          try {
            // ファイルを強制的に削除
            fs.unlinkSync(filePath);
            console.log(`  → 削除成功: ${filePath}`);
          } catch (e) {
            console.error(`  → 削除失敗: ${e}`);
            
            // 100ms待機してから再試行
            await new Promise(resolve => setTimeout(resolve, 100));
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`  → 2回目の削除が成功: ${filePath}`);
              }
            } catch (e2) {
              console.error(`  → 2回目の削除も失敗: ${e2}`);
            }
          }
        }
      }
      
      if (allDeleted) {
        console.log(`すべてのファイルが正常に削除されました (試行: ${attempt + 1}回目で完了)`);
        break;
      }
      
      // 次の試行前に少し待機
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // 最終チェック（すべての試行が終わった後）
    // 非同期で削除タスクをキューに入れる
    setTimeout(() => {
      try {
        for (const file of matchingFiles) {
          const filePath = path.join(kbJsonDir, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`バックグラウンド削除: ${filePath}`);
          }
        }
        
        // 追加のクリーンアップ: トラブルシューティングディレクトリ内の関連ファイルも削除
        const troubleshootingDir = path.join(knowledgeBaseDir, 'troubleshooting');
        if (fs.existsSync(troubleshootingDir)) {
          const tsFiles = fs.readdirSync(troubleshootingDir);
          for (const tsFile of tsFiles) {
            if (tsFile.includes(id.split('_')[1])) {
              const tsFilePath = path.join(troubleshootingDir, tsFile);
              fs.unlinkSync(tsFilePath);
              console.log(`バックグラウンド削除（トラブルシューティング）: ${tsFilePath}`);
            }
          }
        }
      } catch (e) {
        console.error('バックグラウンド削除エラー:', e);
      }
    }, 1000);
    
    // キャッシュバスティングのためのヘッダー設定
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    
    return res.json({
      success: true,
      message: `応急処置ガイド「${title}」を削除しました`,
      deletedFiles: matchingFiles
    });
  } catch (error) {
    console.error('ガイド削除エラー:', error);
    res.status(500).json({ error: 'ガイドの削除に失敗しました' });
  }
});

// チャットに応急処置ガイドを送信するエンドポイント
// 緊急ガイドデータをチャットに直接送信するエンドポイント
router.post('/send', async (req, res) => {
  try {
    const { chatId, guideData } = req.body;
    
    if (!chatId || !guideData) {
      return res.status(400).json({ 
        success: false,
        message: "チャットIDとガイドデータが必要です" 
      });
    }
    
    // ログ出力強化
    console.log('------------------------------------');
    console.log('応急処置ガイドデータをチャットに送信:');
    console.log(`chatId: ${chatId}`);
    console.log(`title: ${guideData.title || "無題"}`);
    console.log(`content: ${guideData.content?.substring(0, 100)}...`);
    console.log(`sessionUserId: ${req?.session?.userId || 'unknown'}`);
    console.log('------------------------------------');
    
    // ユーザーIDの取得（認証済みでない場合のフォールバック）
    const senderId = req.session?.userId || 1; // 認証されていない場合はデフォルトユーザーIDを使用
    
    // ストレージの取得
    const storage = req.app.locals.storage;
    if (!storage) {
      console.error('ストレージが初期化されていません');
      return res.status(500).json({ 
        success: false,
        message: "サーバー内部エラー: ストレージが初期化されていません" 
      });
    }
    
    try {
      // 1. ユーザーのガイド内容メッセージを作成
      const userMessage = await storage.createMessage({
        chatId: Number(chatId),
        content: guideData.content || guideData.title || "応急処置ガイド",
        isAiResponse: false,
        senderId
      });
      
      // 2. AIの応答メッセージを作成（確認応答）
      const aiMessage = await storage.createMessage({
        chatId: Number(chatId),
        content: `応急処置ガイド「${guideData.title || ""}」を受け取りました。手順に従って作業を続けてください。`,
        isAiResponse: true,
        senderId
      });
      
      console.log('チャットメッセージを作成しました:', userMessage.id, aiMessage.id);
      
      return res.json({
        success: true,
        userMessage,
        aiMessage
      });
    } catch (dbError) {
      console.error('メッセージ作成中にデータベースエラーが発生しました:', dbError);
      return res.status(500).json({ 
        success: false,
        message: "メッセージの保存中にエラーが発生しました",
        error: dbError instanceof Error ? dbError.message : "データベースエラー"
      });
    }
  } catch (error) {
    console.error("緊急ガイド送信エラー:", error);
    return res.status(500).json({ 
      success: false,
      message: "緊急ガイドの送信中にエラーが発生しました",
      error: error instanceof Error ? error.message : "不明なエラー"
    });
  }
});

// システムメッセージをチャットに送信するエンドポイント（フォールバック用）
router.post('/system-message', async (req, res) => {
  try {
    const { chatId, content, isUserMessage = false } = req.body;
    
    if (!chatId || !content) {
      return res.status(400).json({ 
        success: false,
        message: "チャットIDとメッセージ内容が必要です" 
      });
    }
    
    // ログ出力
    console.log('------------------------------------');
    console.log('システムメッセージをチャットに送信:');
    console.log(`chatId: ${chatId}`);
    console.log(`content: ${content.substring(0, 100)}...`);
    console.log(`isUserMessage: ${isUserMessage}`);
    console.log(`sessionUserId: ${req?.session?.userId || 'unknown'}`);
    console.log('------------------------------------');
    
    // ユーザーIDの取得（認証済みでない場合のフォールバック）
    const senderId = req.session?.userId || 1;
    
    // DBストレージが直接使用可能か確認
    try {
      const { storage } = require('../storage');
      
      // メッセージを作成
      const message = await storage.createMessage({
        chatId: Number(chatId),
        content,
        senderId: senderId,
        isUserMessage: isUserMessage,
        timestamp: new Date()
      });
      
      console.log('システムメッセージを作成しました:', message.id);
      
      return res.json({
        success: true,
        message
      });
    } catch (storageError) {
      console.error('ストレージエラー:', storageError);
      
      // 代替手段: アプリケーション変数からストレージを取得
      const appStorage = req.app.locals.storage;
      if (appStorage) {
        // メッセージを作成
        const message = await appStorage.createMessage({
          chatId: Number(chatId),
          content,
          senderId: senderId,
          isUserMessage: isUserMessage,
          timestamp: new Date()
        });
        
        console.log('代替ストレージでシステムメッセージを作成しました:', message.id);
        
        return res.json({
          success: true,
          message
        });
      } else {
        throw new Error('有効なストレージが見つかりません');
      }
    }
  } catch (error) {
    console.error("システムメッセージ送信エラー:", error);
    return res.status(500).json({ 
      success: false,
      message: "メッセージの送信中にエラーが発生しました",
      error: error instanceof Error ? error.message : "不明なエラー"
    });
  }
});

// 古い実装 - 特定のガイドをチャットに送信するエンドポイント
router.post('/send-to-chat/:guideId/:chatId', async (req, res) => {
  try {
    const { guideId, chatId } = req.params;
    
    // ガイドデータを取得
    const files = fs.readdirSync(kbJsonDir)
      .filter(file => file.startsWith(guideId) && file.endsWith('_metadata.json'));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'ガイドが見つかりません' });
    }
    
    const filePath = path.join(kbJsonDir, files[0]);
    const content = fs.readFileSync(filePath, 'utf8');
    const guideData = JSON.parse(content);
    
    // JSONデータの形式に応じてメッセージ内容を作成
    let messageContent = '';
    
    // PowerPoint由来の形式の場合
    if (guideData.metadata && guideData.slides) {
      messageContent = `応急処置ガイド「${guideData.metadata.タイトル}」が共有されました。\n\n${guideData.metadata.説明}`;
    } 
    // JSON由来の応急処置フロー形式の場合
    else if (guideData.title && guideData.description) {
      messageContent = `応急処置ガイド「${guideData.title}」が共有されました。\n\n${guideData.description}`;
    }
    // その他の形式の場合
    else {
      messageContent = `応急処置ガイド「${path.basename(filePath, '_metadata.json')}」が共有されました。`;
    }
    
    // チャットにメッセージを送信するAPIを呼び出す
    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/chats/${chatId}/messages/system`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: messageContent,
        isUserMessage: false
      })
    });
    
    if (!response.ok) {
      throw new Error('チャットへのメッセージ送信に失敗しました');
    }
    
    const result = await response.json() as { id: string };
    
    res.json({
      success: true,
      message: 'ガイドがチャットに送信されました',
      messageId: result.id
    });
  } catch (error) {
    console.error('ガイド送信エラー:', error);
    res.status(500).json({ error: '応急処置ガイドのチャットへの送信に失敗しました' });
  }
});

export const emergencyGuideRouter = router;