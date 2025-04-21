import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { processDocument, extractPdfText, extractWordText, extractExcelText, extractPptxText } from '../lib/document-processor';
import { addDocumentToKnowledgeBase } from '../lib/knowledge-base';

// ディレクトリ作成用ヘルパー関数
function ensureDirectoryExists(directory: string) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

// ファイルクリーンアップユーティリティ
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
    
    console.log(`ディレクトリをクリーンアップしました: ${dirPath}`);
  } catch (error) {
    console.error(`ディレクトリのクリーンアップに失敗しました: ${dirPath}`, error);
    // クリーンアップに失敗しても処理は続行
  }
}

// 一時ディレクトリのクリーンアップ（知識ベースディレクトリとuploadsディレクトリ）
async function cleanupTempDirectories(): Promise<void> {
  // 知識ベースディレクトリ
  const rootDir = process.cwd();
  const knowledgeBaseDir = path.join(rootDir, 'knowledge-base');
  
  // 一時ファイル配置用ディレクトリ
  const publicImagesDir = path.join(rootDir, 'public/images');
  const publicUploadsDir = path.join(rootDir, 'public/uploads');
  const uploadsDir = path.join(rootDir, 'uploads');
  
  // クリーンアップ対象の一時ディレクトリリスト
  const tempDirs = [
    path.join(knowledgeBaseDir, 'temp'),
    path.join(uploadsDir, 'temp'),
    path.join(publicUploadsDir, 'temp')
  ];
  
  // 一時ディレクトリの処理
  for (const dirPath of tempDirs) {
    if (!fs.existsSync(dirPath)) continue;
    
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // ディレクトリの場合は再帰的に処理
          await verifyAndCleanupDirectory(filePath);
        } else {
          // ファイルの場合は検証して削除
          await verifyAndCleanupFile(filePath, path.basename(dirPath));
        }
      }
      
      console.log(`一時ディレクトリをクリーンアップしました: ${dirPath}`);
    } catch (error) {
      console.error(`一時ディレクトリのクリーンアップ中にエラーが発生しました: ${dirPath}`, error);
    }
  }
  
  // knowledge-baseに移動済みのファイルをuploadsとpublic/uploadsから削除
  try {
    await cleanupRedundantFiles();
  } catch (error) {
    console.error('重複ファイルのクリーンアップ中にエラーが発生しました:', error);
  }
}

// 画像ファイルのハッシュ値を計算する関数（内容の一致を検出するため）
async function calculateImageHash(filePath: string): Promise<string> {
  try {
    const fileContent = fs.readFileSync(filePath);
    // 単純なハッシュ値を計算（実際の実装ではより堅牢なハッシュアルゴリズムを使用することも可能）
    const hash = require('crypto').createHash('md5').update(fileContent).digest('hex');
    return hash;
  } catch (error) {
    console.error(`ファイルのハッシュ計算に失敗: ${filePath}`, error);
    return '';
  }
}

// 知識ベース内の画像ファイルの重複を検出して削除する
async function detectAndRemoveDuplicateImages(): Promise<{removed: number, errors: number}> {
  const knowledgeImagesDir = path.join(process.cwd(), 'knowledge-base/images');
  let removedCount = 0;
  let errorCount = 0;
  
  if (!fs.existsSync(knowledgeImagesDir)) {
    console.log(`画像ディレクトリが存在しません: ${knowledgeImagesDir}`);
    return { removed: 0, errors: 0 };
  }
  
  try {
    // 画像ファイル一覧を取得
    const imageFiles = fs.readdirSync(knowledgeImagesDir)
      .filter(file => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'));
    
    console.log(`knowledge-base/imagesディレクトリ内の画像ファイル数: ${imageFiles.length}件`);
    if (imageFiles.length <= 1) return { removed: 0, errors: 0 };
    
    // ファイル名のプレフィックスでグループ化する正規表現パターン
    // mc_1745233987873_img_001 -> mc_1745233987873
    const prefixPattern = /^(mc_\d+)_/;
    
    // ハッシュ値とファイルパスのマップ
    const fileHashes = new Map<string, string[]>();
    // ファイル名のプレフィックスでグループ化
    const prefixGroups = new Map<string, string[]>();
    
    // まずファイル名のプレフィックスでグループ化（タイムスタンプ違いの可能性がある同名ファイルを見つける）
    for (const file of imageFiles) {
      const match = file.match(prefixPattern);
      if (match) {
        const prefix = match[1]; // 例: mc_1745233987873
        if (!prefixGroups.has(prefix)) {
          prefixGroups.set(prefix, []);
        }
        prefixGroups.get(prefix)!.push(file);
      }
    }
    
    // 重複の可能性があるグループのみを検査（パフォーマンス改善のため）
    for (const entry of Array.from(prefixGroups.entries())) {
      const [prefix, files] = entry;
      if (files.length > 1) {
        console.log(`プレフィックス "${prefix}" で ${files.length}件の潜在的な重複ファイルを検出`);
        
        // 各ファイルのハッシュを計算して重複を検出
        for (const file of files) {
          const filePath = path.join(knowledgeImagesDir, file);
          const hash = await calculateImageHash(filePath);
          
          if (hash) {
            if (!fileHashes.has(hash)) {
              fileHashes.set(hash, []);
            }
            fileHashes.get(hash)!.push(filePath);
          }
        }
      }
    }
    
    // 重複ファイルを削除（最も新しいタイムスタンプのファイル以外）
    for (const entry of Array.from(fileHashes.entries())) {
      const [hash, filePaths] = entry;
      if (filePaths.length > 1) {
        console.log(`ハッシュ値 ${hash} で ${filePaths.length}件の重複ファイルを検出`);
        
        // ファイル名からタイムスタンプを抽出して最新のファイルを特定
        const timestamps = filePaths.map((filePath: string) => {
          const fileName = path.basename(filePath);
          const match = fileName.match(/mc_(\d+)/);
          return match ? parseInt(match[1]) : 0;
        });
        
        // 最大のタイムスタンプを持つファイルのインデックス
        const latestFileIndex = timestamps.indexOf(Math.max(...timestamps));
        
        // 最新以外のファイルを削除
        for (let i = 0; i < filePaths.length; i++) {
          if (i !== latestFileIndex) {
            try {
              fs.unlinkSync(filePaths[i]);
              console.log(`重複ファイルを削除しました: ${filePaths[i]}`);
              removedCount++;
            } catch (error) {
              console.error(`重複ファイル削除エラー: ${filePaths[i]}`, error);
              errorCount++;
            }
          }
        }
      }
    }
    
    return { removed: removedCount, errors: errorCount };
  } catch (error) {
    console.error('重複画像検出処理でエラーが発生しました:', error);
    return { removed: removedCount, errors: errorCount + 1 };
  }
}

// knowledge-baseに存在するファイルと重複するファイルを一時ディレクトリから削除
async function cleanupRedundantFiles(): Promise<{removed: number, errors: number}> {
  const rootDir = process.cwd();
  const knowledgeImagesDir = path.join(rootDir, 'knowledge-base/images');
  const uploadsDirs = [
    path.join(rootDir, 'uploads/images'),
    path.join(rootDir, 'public/uploads/images'),
    path.join(rootDir, 'public/images')
  ];
  
  let removedCount = 0;
  let errorCount = 0;
  
  try {
    // knowledge-base/imagesのファイル一覧を取得
    if (!fs.existsSync(knowledgeImagesDir)) {
      console.log(`ディレクトリが存在しません: ${knowledgeImagesDir}`);
      return { removed: 0, errors: 0 };
    }
    
    const knowledgeImages = fs.readdirSync(knowledgeImagesDir);
    console.log(`知識ベースディレクトリ内のファイル数: ${knowledgeImages.length}件`);
    
    // 各アップロードディレクトリをチェック
    for (const dir of uploadsDirs) {
      if (!fs.existsSync(dir)) {
        console.log(`ディレクトリが存在しません: ${dir}`);
        // ディレクトリが存在しない場合は作成する（一時ファイル用）
        fs.mkdirSync(dir, { recursive: true });
        console.log(`ディレクトリを作成しました: ${dir}`);
        continue;
      }
      
      const uploadedFiles = fs.readdirSync(dir);
      console.log(`ディレクトリ内のファイル数: ${dir} - ${uploadedFiles.length}件`);
      
      for (const file of uploadedFiles) {
        // knowledge-baseに同名のファイルが存在する場合は削除
        if (knowledgeImages.includes(file)) {
          try {
            fs.unlinkSync(path.join(dir, file));
            console.log(`重複ファイルを削除しました: ${path.join(dir, file)}`);
            removedCount++;
          } catch (error) {
            console.error(`ファイル削除エラー: ${path.join(dir, file)}`, error);
            errorCount++;
          }
        }
      }
    }
    
    console.log(`重複ファイル削除結果: 成功=${removedCount}件, 失敗=${errorCount}件`);
    return { removed: removedCount, errors: errorCount };
  } catch (error) {
    console.error('重複ファイル削除処理でエラーが発生しました:', error);
    return { removed: removedCount, errors: errorCount + 1 };
  }
}

// ファイルがknowledge-baseに存在するか確認してから削除
async function verifyAndCleanupFile(filePath: string, subDir: string): Promise<void> {
  try {
    const fileName = path.basename(filePath);
    const fileExt = path.extname(fileName);
    const baseNameWithoutExt = path.basename(fileName, fileExt);
    
    // knowledge-baseの対応するディレクトリパス
    let kbTargetDir = '';
    if (subDir === 'images') {
      kbTargetDir = path.join(process.cwd(), 'knowledge-base', 'images');
    } else if (subDir === 'json') {
      kbTargetDir = path.join(process.cwd(), 'knowledge-base', 'json');
    } else if (subDir === 'data') {
      kbTargetDir = path.join(process.cwd(), 'knowledge-base', 'data');
    } else {
      // pptやtempなどはknowledge-baseに対応しないので直接削除
      fs.unlinkSync(filePath);
      console.log(`一時ファイルを削除しました: ${filePath}`);
      return;
    }
    
    // knowledge-baseに対応するファイルが存在するか確認
    const kbTargetPath = path.join(kbTargetDir, fileName);
    if (fs.existsSync(kbTargetPath)) {
      // knowledge-baseに存在する場合は安全に削除
      fs.unlinkSync(filePath);
      console.log(`uploads内のファイルを削除しました (knowledge-baseに存在確認済み): ${filePath}`);
    } else {
      console.log(`警告: knowledge-baseに対応するファイルが見つからないため、削除をスキップします: ${filePath}`);
    }
    
  } catch (error) {
    console.error(`ファイルの検証・クリーンアップに失敗しました: ${filePath}`, error);
  }
}

// ディレクトリを再帰的に検証して削除
async function verifyAndCleanupDirectory(dirPath: string): Promise<void> {
  if (!fs.existsSync(dirPath)) return;
  
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        await verifyAndCleanupDirectory(filePath);
      } else {
        // サブディレクトリ名を取得（例: uploads/images/subdir/file.png → images）
        const relPath = path.relative(path.join(process.cwd(), 'uploads'), dirPath);
        const topDir = relPath.split(path.sep)[0];
        await verifyAndCleanupFile(filePath, topDir);
      }
    }
    
    // ディレクトリが空になったら削除
    const remainingFiles = fs.readdirSync(dirPath);
    if (remainingFiles.length === 0) {
      fs.rmdirSync(dirPath);
      console.log(`空のディレクトリを削除しました: ${dirPath}`);
    }
  } catch (error) {
    console.error(`ディレクトリの検証・クリーンアップに失敗しました: ${dirPath}`, error);
  }
}

// ディレクトリ構造の整理：知識ベース用、画像検索用、一時アップロード用に分離
const knowledgeBaseDir = path.join(process.cwd(), 'knowledge-base');
const knowledgeBaseDataDir = path.join(knowledgeBaseDir, 'data');
const knowledgeBaseImagesDir = path.join(knowledgeBaseDir, 'images');

// knowledge-base/imagesディレクトリを画像用に使用 (一元化)
const publicImagesDir = path.join(process.cwd(), 'knowledge-base', 'images');

// 知識ベース一時ディレクトリのパス
const knowledgeBaseTempDir = path.join(knowledgeBaseDir, 'temp');

// ディレクトリが存在することを確認
ensureDirectoryExists(knowledgeBaseDir);
ensureDirectoryExists(knowledgeBaseDataDir);
ensureDirectoryExists(knowledgeBaseImagesDir);
ensureDirectoryExists(knowledgeBaseTempDir);
ensureDirectoryExists(publicImagesDir);

// Multerストレージ設定
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 処理タイプによって保存先を変更
    const processingType = req.body.processingType || 'document';
    
    if (file.mimetype.includes('svg') || file.mimetype.includes('image')) {
      // 画像ファイルはすべてknowledge-baseのimagesディレクトリに直接保存
      cb(null, knowledgeBaseImagesDir);
    } else {
      // 文書ファイルはknowledge-baseの一時保存用tempディレクトリに保存
      const knowledgeBaseTempDir = path.join(knowledgeBaseDir, 'temp');
      ensureDirectoryExists(knowledgeBaseTempDir);
      cb(null, knowledgeBaseTempDir);
    }
  },
  filename: function (req, file, cb) {
    // 一意のファイル名を生成
    const uniqueId = Date.now().toString();
    const extname = path.extname(file.originalname);
    // バッファからUTF-8でファイル名をデコードし、日本語ファイル名に対応
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    // ファイル名に使用できない文字を除去し、スペースをアンダースコアに変換
    const sanitizedName = originalName.split('.')[0]
      .replace(/[\/\\:*?"<>|]/g, '')
      .replace(/\s+/g, '_');
    
    // MC + 日本語部分を含む名前を保持しつつ、一意性を確保
    cb(null, `${sanitizedName}_${uniqueId}${extname}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    // 許可する拡張子
    const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.svg', '.png', '.jpg', '.jpeg', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`サポートされていないファイル形式です。サポート形式: ${allowedExtensions.join(', ')}`));
    }
  }
});

const router = express.Router();

/**
 * キャッシュをクリアするエンドポイント
 * 削除操作後にクライアントがこれを呼び出すことで、最新情報を確実に取得
 */
router.post('/clear-cache', (req, res) => {
  try {
    console.log('サーバーキャッシュクリア要求を受信しました');
    
    // 知識ベースJSONディレクトリの再検証
    const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
    if (fs.existsSync(jsonDir)) {
      try {
        // 実際のファイル一覧を取得
        const files = fs.readdirSync(jsonDir);
        console.log(`検証: knowledge-base/jsonディレクトリに${files.length}個のファイルが存在`);
        
        // キャッシュからファイルの実在性を再チェック
        for (const file of files) {
          const fullPath = path.join(jsonDir, file);
          try {
            // ファイルの存在を確認し、アクセス可能かチェック
            fs.accessSync(fullPath, fs.constants.F_OK | fs.constants.R_OK);
          } catch (err) {
            // アクセスできない場合は警告を出す
            console.warn(`警告: ファイルにアクセスできません: ${fullPath}`, err);
          }
        }
      } catch (readErr) {
        console.error('ディレクトリ読み取りエラー:', readErr);
      }
    }
    
    // index.json ファイルの再構築（トラッキングファイル）
    const indexJsonPath = path.join(process.cwd(), 'knowledge-base', 'index.json');
    
    try {
      // 実際のファイルリストを取得
      const jsonFiles = fs.existsSync(jsonDir) ? fs.readdirSync(jsonDir) : [];
      
      // 現在のメタデータファイルから最新インデックスを再構築
      const indexData = {
        lastUpdated: new Date().toISOString(),
        guides: [] as any[],
        fileCount: jsonFiles.length
      };
      
      // ブラックリストファイル（無視するファイル）
      const blacklistFiles = ['guide_1744876404679_metadata.json', 'guide_metadata.json'];
      
      // 有効なメタデータファイルのみを追加
      const validFiles = jsonFiles.filter(file => 
        file.endsWith('_metadata.json') && 
        !blacklistFiles.includes(file)
      );
      
      console.log('有効なJSONファイル:', validFiles);
      
      // インデックスに追加
      for (const file of validFiles) {
        try {
          const content = fs.readFileSync(path.join(jsonDir, file), 'utf8');
          const data = JSON.parse(content);
          const id = file.replace('_metadata.json', '');
          
          let title = id;
          if (data.metadata && data.metadata.タイトル) {
            title = data.metadata.タイトル;
          } else if (data.title) {
            title = data.title;
          }
          
          indexData.guides.push({
            id,
            title,
            filePath: path.join(jsonDir, file),
            fileName: file
          });
        } catch (parseErr) {
          console.error(`ファイルの解析エラー ${file}:`, parseErr);
        }
      }
      
      // インデックスを保存
      fs.writeFileSync(indexJsonPath, JSON.stringify(indexData, null, 2), 'utf8');
      console.log('index.jsonファイルを更新しました');
    } catch (indexErr) {
      console.error('index.json更新エラー:', indexErr);
    }
    
    return res.json({
      success: true,
      message: 'サーバーキャッシュをクリアしました',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('キャッシュクリアエラー:', error);
    return res.status(500).json({
      error: 'キャッシュクリアに失敗しました',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * JSON ファイル一覧を取得するエンドポイント
 * 最新のJSONファイルを優先的に取得
 */
router.get('/list-json-files', (req, res) => {
  try {
    console.log('JSONファイル一覧取得リクエストを受信...');
    
    // ファイルは知識ベースディレクトリに一元化
    const jsonDirs = [
      path.join(process.cwd(), 'knowledge-base', 'json')  // メインの場所
    ];
    
    let allJsonFiles: string[] = [];
    
    // 問題が発生しているファイルのブラックリスト
    const blacklistedFiles = [
      'guide_1744876404679_metadata.json', // 問題が発生しているファイル
      'guide_metadata.json'  // 別の問題が報告されているファイル
    ];
    console.log(`ブラックリストファイル: ${blacklistedFiles.join(', ')}`);
    
    // 各ディレクトリからメタデータJSONファイルを収集
    for (const jsonDir of jsonDirs) {
      if (fs.existsSync(jsonDir)) {
        // ディレクトリの内容を確認し、すべてのファイルをログ出力
        const allFiles = fs.readdirSync(jsonDir);
        console.log(`${jsonDir}内のすべてのファイル:`, allFiles);
        
        // 実在するJSONファイルのみフィルタリング
        const files = allFiles
          .filter(file => file.endsWith('_metadata.json'))
          .filter(file => {
            // ブラックリストにあるファイルを除外
            if (blacklistedFiles.includes(file)) {
              console.log(`ブラックリストのため除外: ${file}`);
              return false;
            }
            
            // 実際にファイルが存在するか確認
            const filePath = path.join(jsonDir, file);
            const exists = fs.existsSync(filePath);
            if (!exists) {
              console.log(`ファイルが実際には存在しないため除外: ${filePath}`);
              return false;
            }
            
            return true;
          });
        
        console.log(`${jsonDir}内の有効なメタデータファイル: ${files.length}件`);
        allJsonFiles = [...allJsonFiles, ...files];
      } else {
        // ディレクトリが存在しない場合は作成
        fs.mkdirSync(jsonDir, { recursive: true });
        console.log(`ディレクトリを作成しました: ${jsonDir}`);
      }
    }
    
    // 重複を排除して一意のファイル名リストにする
    const uniqueJsonFiles = Array.from(new Set(allJsonFiles));
    console.log(`重複除外後のファイル数: ${uniqueJsonFiles.length}件`);
    
    // タイムスタンプでソート（新しい順）
    const sortedFiles = uniqueJsonFiles.sort((a, b) => {
      // ファイル名からタイムスタンプを抽出: mc_1744105287121_metadata.json -> 1744105287121
      const timestampA = a.split('_')[1] || '0';
      const timestampB = b.split('_')[1] || '0';
      return parseInt(timestampB) - parseInt(timestampA);
    });
    
    // 応答ヘッダーを設定して、キャッシュを無効化
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    
    // ファイル一覧をJSONで返す
    return res.json(sortedFiles);
  } catch (error) {
    console.error('JSONファイル一覧取得エラー:', error);
    return res.status(500).json({
      error: 'JSONファイル一覧の取得に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 技術サポート文書のアップロードと処理を行うエンドポイント
 */
// 画像検索データの初期化用エンドポイント
router.post('/init-image-search-data', async (req, res) => {
  try {
    console.log('画像検索データの初期化を実行します');
    
    // 画像検索データJSONファイルのパス
    // knowledge-baseのデータディレクトリを作成
    const knowledgeBaseDataDir = path.join(process.cwd(), 'knowledge-base', 'data');
    if (!fs.existsSync(knowledgeBaseDataDir)) {
      fs.mkdirSync(knowledgeBaseDataDir, { recursive: true });
    }
    
    // 画像検索データJSONファイルのパス（knowledge-baseに一元化）
    const imageSearchDataPath = path.join(knowledgeBaseDataDir, 'image_search_data.json');
    
    // 画像ディレクトリの参照 - 一元化するためにknowledge-baseだけを使用
    const imagesDir = path.join(process.cwd(), 'knowledge-base', 'images');
    
    // ディレクトリが存在するか確認し、なければ作成
    ensureDirectoryExists(imagesDir);
    
    // 初期データを作成（PNG形式のみに統一）
    const initialData = [
      {
        id: "engine_001",
        file: "/knowledge-base/images/engine_001.png",
        title: "エンジン基本構造図",
        category: "エンジン",
        keywords: ["エンジン", "モーター", "動力系", "駆動部"],
        description: "保守用車のディーゼルエンジン基本構造図。主要部品とその配置を示す。"
      },
      {
        id: "cooling_001",
        file: "/knowledge-base/images/cooling_001.png",
        title: "冷却システム概略図",
        category: "冷却系統",
        keywords: ["冷却", "ラジエーター", "水漏れ", "オーバーヒート"],
        description: "保守用車の冷却システム概略図。冷却水の流れと主要コンポーネントを表示。"
      },
      {
        id: "frame_001",
        file: "/knowledge-base/images/frame_001.png",
        title: "車体フレーム構造",
        category: "車体",
        keywords: ["フレーム", "シャーシ", "車体", "構造", "強度部材"],
        description: "保守用車の車体フレーム構造図。サイドメンバーとクロスメンバーの配置を表示。"
      },
      {
        id: "cabin_001",
        file: "/knowledge-base/images/cabin_001.png",
        title: "運転キャビン配置図",
        category: "運転室",
        keywords: ["キャビン", "運転室", "操作パネル", "計器盤"],
        description: "保守用車の運転キャビン内部配置図。操作機器と計器類の位置を表示。"
      }
    ];
    
    // 既存のimagesディレクトリから検出されたPNGファイルを追加
    try {
      // imagesディレクトリ内のすべてのPNGファイルを取得
      const pngFiles = fs.readdirSync(imagesDir)
        .filter(file => file.toLowerCase().endsWith('.png'));
      
      for (const pngFile of pngFiles) {
        const pngId = pngFile.replace('.png', '');
        // 既に初期データとして含まれていない場合のみ追加
        const exists = initialData.some(item => item.id === pngId);
        
        if (!exists) {
          // 新しいアイテム作成
          initialData.push({
            id: pngId,
            file: `/knowledge-base/images/${pngFile}`,
            title: `${pngId.replace(/_/g, ' ')}`,
            category: 'アップロード済み画像',
            keywords: [`${pngId}`, 'PNG', '図面'],
            description: `ファイル ${pngFile}`
          });
        }
      }
    } catch (dirErr) {
      console.error('PNGファイル検出中にエラー:', dirErr);
    }
    
    // 既存データがある場合は読み込んで上書き更新する
    let existingData: any[] = [];
    let updatedData: any[] = [];
    
    if (fs.existsSync(imageSearchDataPath)) {
      try {
        const jsonContent = fs.readFileSync(imageSearchDataPath, 'utf8');
        existingData = JSON.parse(jsonContent);
        console.log(`既存の画像検索データを読み込みました: ${existingData.length}件`);
        
        // 既存データのIDマップを作成
        const existingItemsMap = new Map<string, any>();
        existingData.forEach((item: any) => {
          existingItemsMap.set(item.id, item);
        });
        
        // 初期データを既存データで上書き更新
        updatedData = initialData.map(item => {
          return existingItemsMap.has(item.id) 
            ? { ...item, ...existingItemsMap.get(item.id) } // 既存データで上書き
            : item; // 新規データはそのまま
        });
        
        // 既存データで初期データに含まれていないものを追加
        existingData.forEach((item: any) => {
          if (!updatedData.some(updatedItem => updatedItem.id === item.id)) {
            updatedData.push(item);
          }
        });
        
        console.log(`データを統合しました: ${updatedData.length}件（新規: ${updatedData.length - existingData.length}件）`);
      } catch (jsonErr) {
        console.error("JSON読み込みエラー:", jsonErr);
        updatedData = initialData; // エラー時は初期データのみ使用
      }
    } else {
      updatedData = initialData;
    }
    
    // JSONファイルに保存 - knowledge-baseに一元化
    fs.writeFileSync(imageSearchDataPath, JSON.stringify(updatedData, null, 2));
    
    console.log(`データをknowledge-base/dataに保存しました`);
    console.log(`画像検索データを初期化しました: ${updatedData.length}件`);
    
    return res.json({
      success: true,
      count: updatedData.length,
      message: '画像検索データを初期化しました'
    });
  } catch (error) {
    console.error('画像検索データ初期化エラー:', error);
    return res.status(500).json({
      error: '画像検索データの初期化に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 技術文書アップロードエンドポイント
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "ファイルがアップロードされていません" });

    console.log(`ファイルアップロード処理開始: ${file.originalname}`);
    
    // 元ファイルを保存するかどうかのフラグを取得（デフォルトではfalse）
    const keepOriginalFile = req.body.keepOriginalFile === 'true';
    console.log(`元ファイル保存: ${keepOriginalFile ? '有効' : '無効（デフォルト）'}`);
    
    // アップロード開始時に一時ディレクトリのクリーンアップを実行
    try {
      // 知識ベース一時ディレクトリをクリーンアップ
      cleanupTempDirectory(knowledgeBaseTempDir);
      console.log('一時ディレクトリをクリーンアップしました');
    } catch (cleanupError) {
      console.error('一時ディレクトリのクリーンアップに失敗しました:', cleanupError);
      // クリーンアップの失敗は無視して処理を続行
    }
    
    // 一時的にバッファを保存（元ファイル保存オプションがオフの場合、後で削除）
    const filePath = file.path;
    const fileExt = path.extname(file.originalname).toLowerCase();
    const fileBaseName = path.basename(file.path);
    const filesDir = path.dirname(file.path);
    const processingType = req.body.processingType || 'document';
    
    console.log(`処理タイプ: ${processingType}`);
    console.log(`ファイルパス: ${filePath}`);
    console.log(`ファイル拡張子: ${fileExt}`);
    
    // 画像検索用データ処理の場合
    if (processingType === 'image_search' && ['.svg', '.png', '.jpg', '.jpeg', '.gif'].includes(fileExt)) {
      try {
        console.log("画像検索用データ処理を開始します");
        
        // ファイル名から一意のIDを生成
        const fileId = path.basename(filePath, fileExt).toLowerCase().replace(/\s+/g, '_');
        
        // 全ての形式をPNGに統一するため、SVG/JPG/GIFなどからPNGへの変換を実行
        let pngFilePath = '';
        let originalFilePath = filePath;
        let updatedFilePath = filePath;
        let updatedFileExt = fileExt;
        
        if (fileExt !== '.png') {
          try {
            // 元のファイルパスを保持
            const origFilePath = filePath;
            
            // PNGファイルパスを生成
            pngFilePath = path.join(
              publicImagesDir, 
              `${path.basename(filePath, fileExt)}.png`
            );
            
            console.log(`${fileExt}形式からPNG形式に変換: ${pngFilePath}`);
            
            if (fileExt === '.svg') {
              // SVGの場合は特別な処理
              const svgContent = fs.readFileSync(origFilePath, 'utf8');
              const svgBuffer = Buffer.from(svgContent);
              
              await sharp(svgBuffer)
                .png()
                .toFile(pngFilePath);
            } else {
              // その他の画像形式はそのままsharpで変換
              await sharp(origFilePath)
                .png()
                .toFile(pngFilePath);
            }
            
            console.log(`PNG形式に変換完了: ${pngFilePath}`);
            
            // 以降の処理では変換したPNGファイルを使用
            originalFilePath = origFilePath; // 元のパスを記録
            updatedFilePath = pngFilePath; // 処理中のファイルパスを更新
            updatedFileExt = '.png'; // 拡張子を更新
          } catch (convErr) {
            console.error(`${fileExt}からPNGへの変換エラー:`, convErr);
            // 変換に失敗した場合は元のファイルパスを使用
            pngFilePath = '';
          }
        }
        
        // 画像検索データJSONを読み込むか新規作成
        const knowledgeBaseDataDir = path.join(process.cwd(), 'knowledge-base', 'data');
        if (!fs.existsSync(knowledgeBaseDataDir)) {
          fs.mkdirSync(knowledgeBaseDataDir, { recursive: true });
        }
        
        // データの保存先は knowledge-base/data のみに一元化
        const imageSearchDataPath = path.join(knowledgeBaseDataDir, 'image_search_data.json');
        
        // 画像検索データの初期化
        let imageSearchData = [];
        
        if (fs.existsSync(imageSearchDataPath)) {
          try {
            const jsonContent = fs.readFileSync(imageSearchDataPath, 'utf8');
            imageSearchData = JSON.parse(jsonContent);
            console.log(`既存の画像検索データを読み込みました: ${imageSearchData.length}件`);
          } catch (jsonErr) {
            console.error("JSON読み込みエラー:", jsonErr);
            // 読み込みエラーの場合は新規作成
            imageSearchData = [];
          }
        }
        
        // タイトルと説明を生成（ファイル名から推測）
        const fileName = path.basename(file.originalname, fileExt);
        const title = fileName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        // カテゴリの推測
        let category = '';
        let keywords = [];
        
        if (fileName.includes('engine') || fileName.includes('motor')) {
          category = 'エンジン';
          keywords = ["エンジン", "モーター", "動力系"];
        } else if (fileName.includes('cooling') || fileName.includes('radiator')) {
          category = '冷却系統';
          keywords = ["冷却", "ラジエーター", "水漏れ"];
        } else if (fileName.includes('frame') || fileName.includes('chassis')) {
          category = '車体';
          keywords = ["フレーム", "シャーシ", "車体"];
        } else if (fileName.includes('cabin') || fileName.includes('cockpit')) {
          category = '運転室';
          keywords = ["キャビン", "運転室", "操作パネル"];
        } else {
          category = '保守用車パーツ';
          keywords = ["保守", "部品", "修理"];
        }
        
        // ファイル名から追加のキーワードを抽出（数字や特殊文字を除去して単語分割）
        const additionalKeywords = fileName
          .replace(/[0-9_\-\.]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 1)
          .map(word => word.toLowerCase());
        
        // 重複を除去して既存のキーワードと結合
        const uniqueKeywords = Array.from(new Set([...keywords, ...additionalKeywords]));
        
        // 詳細情報を充実させるための処理内容
        const details = [
          `保守用車の${category}に関する技術図面`,
          `${title}の詳細図`,
          `整備・点検・修理に使用`,
          `技術マニュアル参照資料`
        ];
        
        // 新しい画像検索アイテムを作成（より詳細な情報を含む）
        const newImageItem = {
          id: fileId,
          file: `/knowledge-base/images/${path.basename(updatedFilePath || filePath)}`,
          // 全てPNG形式に統一するため、pngFallbackは不要になりました
          pngFallback: '',
          title: title,
          category: category,
          keywords: uniqueKeywords,
          description: `保守用車の${category}に関する図面または写真です。${title}の詳細を示しています。`,
          details: details.join('. '),
          searchText: `${title} ${category} ${uniqueKeywords.join(' ')} 保守用車 技術図面 整備 点検 修理`,
          metadata: {
            uploadDate: new Date().toISOString(),
            fileSize: file.size,
            fileType: 'PNG', // 全てPNG形式に統一
            originalFileType: fileExt !== '.png' ? fileExt.substring(1).toUpperCase() : 'PNG',
            sourcePath: updatedFilePath || filePath,
            originalPath: originalFilePath !== updatedFilePath ? originalFilePath : '',
            documentId: fileId.split('_')[0] // ドキュメントIDの関連付け
          }
        };
        
        // 既存のデータに新しいアイテムを追加または更新
        const existingIndex = imageSearchData.findIndex((item: any) => item.id === fileId);
        if (existingIndex >= 0) {
          imageSearchData[existingIndex] = newImageItem;
        } else {
          imageSearchData.push(newImageItem);
        }
        
        // 更新したデータを知識ベースに書き込み
        fs.writeFileSync(imageSearchDataPath, JSON.stringify(imageSearchData, null, 2));
        
        console.log(`画像検索データを知識ベースに更新しました: ${imageSearchData.length}件`);
        
        // 元ファイルを保存するオプションがオフの場合、元ファイルを削除
        if (!keepOriginalFile) {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`元ファイルを削除しました: ${filePath}`);
            }
          } catch (deleteErr) {
            console.error(`元ファイル削除エラー: ${deleteErr}`);
            // ファイル削除に失敗しても処理は続行
          }
        }
        
        // 結果を返す
        return res.json({
          success: true,
          message: "画像検索用データが正常に処理されました",
          file: {
            id: fileId,
            name: file.originalname,
            path: `/knowledge-base/images/${path.basename(updatedFilePath || filePath)}`,
            // pngFallbackPathは不要になりました（全てPNG形式に統一）
            pngFallbackPath: '',
            size: file.size,
          },
          imageSearchData: {
            totalItems: imageSearchData.length,
            newItem: newImageItem
          }
        });
      } catch (imgError) {
        console.error("画像検索データ処理エラー:", imgError);
        return res.status(500).json({
          error: "画像検索データの処理中にエラーが発生しました",
          details: imgError instanceof Error ? imgError.message : String(imgError)
        });
      }
    }
    
    // 通常の文書処理（従来のコード）
    let extractedText = "";
    let pageCount = 0;
    let metadata: any = {};
    
    try {
      switch (fileExt) {
        case '.pdf':
          const pdfResult = await extractPdfText(filePath);
          extractedText = pdfResult.text;
          pageCount = pdfResult.pageCount;
          metadata = { pageCount, type: 'pdf' };
          break;
        
        case '.docx':
          extractedText = await extractWordText(filePath);
          metadata = { type: 'docx' };
          break;
          
        case '.xlsx':
          extractedText = await extractExcelText(filePath);
          metadata = { type: 'xlsx' };
          break;
          
        case '.pptx':
          extractedText = await extractPptxText(filePath);
          // PPTXの場合は画像も抽出済み
          metadata = { 
            type: 'pptx',
            // スライド画像へのパスをメタデータに追加（knowledge-baseディレクトリに一元化）
            slideImages: Array.from({length: 4}, (_, i) => 
              `/knowledge-base/images/${path.basename(filePath, path.extname(filePath))}_${(i+1).toString().padStart(3, '0')}.png`
            )
          };
          break;
      }
      
      // extracted_data.jsonへのデータ追加
      const knowledgeBaseDataDir = path.join(process.cwd(), 'knowledge-base', 'data');
      if (!fs.existsSync(knowledgeBaseDataDir)) {
        fs.mkdirSync(knowledgeBaseDataDir, { recursive: true });
      }
      
      const extractedDataPath = path.join(knowledgeBaseDataDir, 'extracted_data.json');
      
      // ファイルが存在するか確認し、存在しない場合は空のJSONを作成
      if (!fs.existsSync(extractedDataPath)) {
        fs.writeFileSync(extractedDataPath, JSON.stringify({ vehicleData: [] }, null, 2));
      }
      
      // 既存データの読み込み
      const extractedData = JSON.parse(fs.readFileSync(extractedDataPath, 'utf-8'));
      
      // 車両データキーが存在するか確認
      const vehicleDataKey = 'vehicleData';
      if (!extractedData[vehicleDataKey]) {
        extractedData[vehicleDataKey] = [];
      }
      
      const vehicleData = extractedData[vehicleDataKey];
      
      // 新規データの追加
      // メタデータJSONファイル関連の処理
      // 1. タイムスタンプとファイル名生成
      const timestamp = Date.now();
      const prefix = path.basename(filePath, path.extname(filePath)).substring(0, 2).toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      const metadataFileName = `${prefix}_${timestamp}_metadata.json`;
      
      // 2. knowledge-baseディレクトリ内のJSONフォルダ確保
      const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
      if (!fs.existsSync(jsonDir)) {
        fs.mkdirSync(jsonDir, { recursive: true });
      }
      
      // 3. メタデータファイルパス生成
      const metadataFilePath = path.join(jsonDir, metadataFileName);
      
      // 4. 車両データオブジェクト生成（メタデータJSONの参照パスを含む）
      const newData = {
        id: path.basename(filePath, path.extname(filePath)),
        category: fileExt.substring(1).toUpperCase(),
        title: file.originalname,
        description: `技術サポート文書: ${file.originalname}`,
        details: extractedText.substring(0, 200) + "...", // 概要のみ格納
        image_path: metadata.type === 'pptx' ? metadata.slideImages[0] : null,
        all_slides: metadata.type === 'pptx' ? metadata.slideImages : null,
        metadata_json: `/knowledge-base/json/${metadataFileName}`,
        keywords: [fileExt.substring(1).toUpperCase(), "技術文書", "サポート", file.originalname]
      };
      
      // 5. メタデータJSONの内容を準備
      const metadataContent = {
        filename: file.originalname,
        filePath: filePath,
        uploadDate: new Date().toISOString(),
        fileSize: file.size,
        mimeType: file.mimetype,
        extractedText: extractedText,
        ...metadata
      };
      
      fs.writeFileSync(metadataFilePath, JSON.stringify(metadataContent, null, 2));
      console.log(`メタデータJSONを保存: ${metadataFilePath}`);
      
      // 後方互換性のために元の場所にも保存
      fs.writeFileSync(`${filePath}_metadata.json`, JSON.stringify(metadataContent, null, 2));
      
      // 車両データに追加
      const existingIndex = vehicleData.findIndex((item: any) => item.id === newData.id);
      if (existingIndex >= 0) {
        vehicleData[existingIndex] = newData;
      } else {
        vehicleData.push(newData);
      }
      
      // 更新したデータを書き込み
      fs.writeFileSync(extractedDataPath, JSON.stringify(extractedData, null, 2));
      
      // ナレッジベースへの追加を試みる
      try {
        await addDocumentToKnowledgeBase(filePath);
      } catch (kbError) {
        console.error("ナレッジベースへの追加エラー:", kbError);
        // ナレッジベースへの追加に失敗しても処理は続行
      }
      
      // 元ファイルを保存するオプションがオフの場合、元ファイルを削除
      if (!keepOriginalFile) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`元ファイルを削除しました: ${filePath}`);
          }
        } catch (deleteErr) {
          console.error(`元ファイル削除エラー: ${deleteErr}`);
          // ファイル削除に失敗しても処理は続行
        }
      }
      
      return res.json({
        success: true,
        file: {
          id: newData.id,
          name: file.originalname,
          path: filePath,
          size: file.size,
        },
        extractedTextPreview: extractedText.substring(0, 200) + "...",
        metadata: metadata
      });
      
    } catch (processingError) {
      console.error("ファイル処理エラー:", processingError);
      return res.status(500).json({ 
        error: "ファイル処理中にエラーが発生しました", 
        details: processingError instanceof Error ? processingError.message : String(processingError)
      });
    }
    
  } catch (error) {
    console.error("アップロードエラー:", error);
    return res.status(500).json({ 
      error: "ファイルのアップロードに失敗しました", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * uploads内のファイルをクリーンアップするエンドポイント
 * knowledge-baseに存在しないファイルは削除されない
 */
router.post('/cleanup-uploads', async (req, res) => {
  try {
    // クリーンアップ処理を実行
    await cleanupTempDirectories();
    
    return res.json({
      success: true,
      message: 'uploadsディレクトリのクリーンアップを実行しました'
    });
  } catch (error) {
    console.error('クリーンアップエラー:', error);
    return res.status(500).json({
      error: 'クリーンアップ処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * knowledge-baseとuploadsのデータを双方向に同期するエンドポイント
 */
router.post('/sync-knowledge-base', async (req, res) => {
  try {
    // 前方互換性のため、APIは残しておくが実際の同期処理は行わない
    // すべてのファイルはknowledge-baseに一元化されるので、同期は不要
    
    // knowledge-baseのディレクトリパス（参照のみ）
    const knowledgeBaseDirs: Record<string, string> = {
      images: path.join(process.cwd(), 'knowledge-base', 'images'),
      json: path.join(process.cwd(), 'knowledge-base', 'json'),
      data: path.join(process.cwd(), 'knowledge-base', 'data')
    };
    
    // ディレクトリが存在することだけ確認
    for (const [dirType, kbDir] of Object.entries(knowledgeBaseDirs)) {
      // ディレクトリが存在しない場合は作成
      ensureDirectoryExists(kbDir);
    }
    
    // 実際の同期は行わず、空の結果を返す
    const syncResults: Record<string, any> = {
      images: {
        from: '/home/runner/workspace/knowledge-base/images',
        to: knowledgeBaseDirs.images,
        fileCount: 0,
        copiedCount: 0
      },
      json: {
        from: '/home/runner/workspace/knowledge-base/json',
        to: knowledgeBaseDirs.json,
        fileCount: 0,
        copiedCount: 0
      },
      data: {
        from: '/home/runner/workspace/knowledge-base/data',
        to: knowledgeBaseDirs.data,
        fileCount: 0,
        copiedCount: 0
      }
    };
    
    // 方向パラメータは使わないが、互換性のためにコメントに残す
    // const direction = req.query.direction || 'kb-to-uploads';
    
    return res.json({
      success: true,
      message: 'データを同期しました (knowledge-base)',
      results: syncResults
    });
  } catch (error) {
    console.error('同期エラー:', error);
    return res.status(500).json({
      error: 'データ同期中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * uploads内のファイルをクリーンアップするエンドポイント
 * knowledge-baseに存在しないファイルは削除されない
 */
router.post('/cleanup-uploads', async (req, res) => {
  try {
    console.log('アップロードファイルのクリーンアップリクエストを受信...');
    
    // 一時ディレクトリのクリーンアップ
    await cleanupTempDirectories();
    
    // knowledge-baseに移動済みのファイルを一時ディレクトリから削除
    const result = await cleanupRedundantFiles();
    
    // 重複した画像ファイルのクリーンアップはオプション（重たい処理なのでデフォルトは実行しない）
    const detectDuplicates = req.query.detectDuplicates === 'true' || req.body.detectDuplicates === true;
    let duplicateResult = { removed: 0, errors: 0 };
    
    if (detectDuplicates) {
      console.log('knowledge-base内の重複画像検出と削除を実行...');
      duplicateResult = await detectAndRemoveDuplicateImages();
    }
    
    return res.json({
      success: true,
      message: 'アップロードディレクトリのクリーンアップが完了しました',
      details: {
        removedFiles: result.removed,
        errors: result.errors,
        duplicatesRemoved: duplicateResult.removed,
        duplicateErrors: duplicateResult.errors
      }
    });
  } catch (error) {
    console.error('アップロードファイルのクリーンアップエラー:', error);
    return res.status(500).json({
      error: 'クリーンアップ処理に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 重複画像ファイルを検出して削除するエンドポイント
 * knowledge-base/images内の重複画像を削除（同一ハッシュの画像で最新タイムスタンプのもののみ残す）
 */
router.post('/detect-duplicate-images', async (req, res) => {
  try {
    console.log('重複画像検出リクエストを受信...');
    
    const result = await detectAndRemoveDuplicateImages();
    
    return res.json({
      success: true,
      message: '重複画像の検出と削除が完了しました',
      details: {
        removedFiles: result.removed,
        errors: result.errors
      }
    });
  } catch (error) {
    console.error('重複画像検出エラー:', error);
    return res.status(500).json({
      error: '重複画像の検出と削除に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * knowledge-baseとuploadsのデータを双方向に同期するエンドポイント
 */
router.post('/sync-directories', async (req, res) => {
  try {
    console.log('ディレクトリ同期リクエストを受信...');
    
    const rootDir = process.cwd();
    const knowledgeBaseImagesDir = path.join(rootDir, 'knowledge-base/images');
    const tempImageDirs = [
      path.join(rootDir, 'uploads/images'),
      path.join(rootDir, 'public/uploads/images'),
      path.join(rootDir, 'public/images')
    ];
    
    // 各ディレクトリが存在することを確認
    ensureDirectoryExists(knowledgeBaseImagesDir);
    for (const dir of tempImageDirs) {
      ensureDirectoryExists(dir);
    }
    
    let syncResults = {
      toKnowledgeBase: 0,
      fromKnowledgeBase: 0,
      errors: 0
    };
    
    // knowledge-baseにファイルをコピー（アップロードディレクトリから）
    for (const sourceDir of tempImageDirs) {
      if (!fs.existsSync(sourceDir)) continue;
      
      const files = fs.readdirSync(sourceDir);
      for (const file of files) {
        const sourcePath = path.join(sourceDir, file);
        const targetPath = path.join(knowledgeBaseImagesDir, file);
        
        // knowledge-baseに存在しない場合のみコピー
        if (!fs.existsSync(targetPath)) {
          try {
            // ファイルをコピー
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`ファイルをknowledge-baseにコピーしました: ${sourcePath} -> ${targetPath}`);
            syncResults.toKnowledgeBase++;
          } catch (error) {
            console.error(`ファイルコピーエラー: ${sourcePath}`, error);
            syncResults.errors++;
          }
        }
      }
    }
    
    // knowledge-baseから一時ディレクトリにファイルをコピー（必要に応じて）
    const kbFiles = fs.readdirSync(knowledgeBaseImagesDir);
    for (const file of kbFiles) {
      const sourcePath = path.join(knowledgeBaseImagesDir, file);
      
      for (const targetDir of tempImageDirs) {
        const targetPath = path.join(targetDir, file);
        
        // 一時ディレクトリに存在しない場合のみコピー
        if (!fs.existsSync(targetPath)) {
          try {
            // ファイルをコピー
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`ファイルを一時ディレクトリにコピーしました: ${sourcePath} -> ${targetPath}`);
            syncResults.fromKnowledgeBase++;
          } catch (error) {
            console.error(`ファイルコピーエラー: ${targetPath}`, error);
            syncResults.errors++;
          }
        }
      }
    }
    
    // クリーンアップ（重複ファイルの削除）
    await cleanupRedundantFiles();
    
    return res.json({
      success: true,
      message: 'ディレクトリ同期が完了しました',
      details: syncResults
    });
  } catch (error) {
    console.error('ディレクトリ同期エラー:', error);
    return res.status(500).json({
      error: 'ディレクトリ同期に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * knowledge-base内の全てのファイル一覧を取得するエンドポイント
 */
router.get('/knowledge-base-files', async (req, res) => {
  try {
    const knowledgeBaseDirs: Record<string, string> = {
      images: path.join(process.cwd(), 'knowledge-base', 'images'),
      json: path.join(process.cwd(), 'knowledge-base', 'json'),
      data: path.join(process.cwd(), 'knowledge-base', 'data')
    };
    
    const files: Record<string, string[]> = {};
    
    for (const [dirType, dir] of Object.entries(knowledgeBaseDirs)) {
      if (fs.existsSync(dir)) {
        files[dirType] = fs.readdirSync(dir).filter(file => {
          const filePath = path.join(dir, file);
          return fs.statSync(filePath).isFile();
        });
      } else {
        files[dirType] = [];
      }
    }
    
    return res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error('ファイル一覧取得エラー:', error);
    return res.status(500).json({
      error: 'ファイル一覧の取得中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * 削除されたドキュメントに関連する孤立JSONファイルを検出して削除する関数
 * ドキュメント削除後に実行することで、残存しているJSONデータを完全に削除する
 */
async function cleanupOrphanedJsonFiles(): Promise<{removed: number, errors: number}> {
  const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
  let removedCount = 0;
  let errorCount = 0;
  
  try {
    if (!fs.existsSync(jsonDir)) {
      console.log(`JSONディレクトリが存在しません: ${jsonDir}`);
      return { removed: 0, errors: 0 };
    }
    
    // 特定のファイルをブラックリスト化（特殊な用途のファイルなど）
    const blacklistFiles = ['guide_1744876404679_metadata.json', 'guide_metadata.json'];
    
    // メタデータJSONファイル一覧を取得
    const allFiles = fs.readdirSync(jsonDir);
    const metadataFiles = allFiles.filter(file => 
      file.endsWith('_metadata.json') && 
      !blacklistFiles.includes(file)
    );
    
    console.log(`JSONディレクトリ内のメタデータファイル: ${metadataFiles.length}件`);
    
    // knowledge-base内のドキュメントディレクトリ一覧を取得
    const knowledgeBaseDir = path.join(process.cwd(), 'knowledge-base');
    const docDirs = fs.readdirSync(knowledgeBaseDir)
      .filter(dir => dir.startsWith('doc_'))
      .map(dir => {
        // doc_1745233987839_645 からプレフィックスを抽出: mc_1745233987839
        const match = dir.match(/doc_(\d+)_/);
        return match ? `mc_${match[1]}` : '';
      })
      .filter(Boolean);  // 空文字列を除外
    
    // 新しいドキュメント構造も考慮
    const documentsDir = path.join(knowledgeBaseDir, 'documents');
    if (fs.existsSync(documentsDir)) {
      const moreDocs = fs.readdirSync(documentsDir)
        .filter(dir => dir.startsWith('doc_'))
        .map(dir => {
          const match = dir.match(/doc_(\d+)_/);
          return match ? `mc_${match[1]}` : '';
        })
        .filter(Boolean);
        
      // 配列を結合
      docDirs.push(...moreDocs);
    }
    
    console.log(`知識ベース内のドキュメントプレフィックス: ${docDirs.length}件`);
    
    // 各メタデータファイルをチェック
    for (const file of metadataFiles) {
      // ファイル名のプレフィックスを抽出（例: mc_1744105287766_metadata.jsonからmc_1744105287766）
      const prefix = file.split('_metadata.json')[0];
      
      // 対応するドキュメントが存在するかチェック
      const hasMatchingDocument = docDirs.some(docPrefix => docPrefix === prefix);
      
      if (!hasMatchingDocument) {
        // 対応するドキュメントが存在しない場合は孤立したJSONファイルと判断して削除
        try {
          const filePath = path.join(jsonDir, file);
          fs.unlinkSync(filePath);
          console.log(`孤立したJSONファイルを削除しました: ${file}`);
          removedCount++;
        } catch (error) {
          console.error(`JSONファイル削除エラー: ${file}`, error);
          errorCount++;
        }
      }
    }
    
    console.log(`孤立したJSONファイル削除結果: 成功=${removedCount}件, 失敗=${errorCount}件`);
    return { removed: removedCount, errors: errorCount };
  } catch (error) {
    console.error('孤立したJSONファイルのクリーンアップ中にエラーが発生しました:', error);
    return { removed: removedCount, errors: errorCount + 1 };
  }
}

/**
 * 孤立したJSONファイルを削除するエンドポイント
 * 管理機能として実装し、明示的に呼び出すことでメンテナンスを実行
 */
router.post('/cleanup-json', async (req, res) => {
  try {
    console.log('孤立JSONファイルクリーンアップリクエスト受信');
    const result = await cleanupOrphanedJsonFiles();
    
    return res.json({
      success: true,
      removed: result.removed,
      errors: result.errors,
      message: `${result.removed}件の孤立JSONファイルを削除しました`
    });
  } catch (error) {
    console.error('孤立JSONファイルクリーンアップエラー:', error);
    return res.status(500).json({
      success: false,
      error: '孤立JSONファイルのクリーンアップ中にエラーが発生しました'
    });
  }
});

// キャッシュクリア時に孤立JSONファイルも自動的にクリーンアップする
router.post('/clear-cache', async (req, res) => {
  try {
    console.log('サーバーキャッシュクリア要求を受信しました');
    
    // 知識ベースJSONディレクトリの再検証
    const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
    if (fs.existsSync(jsonDir)) {
      try {
        // 実際のファイル一覧を取得
        const files = fs.readdirSync(jsonDir);
        console.log(`検証: knowledge-base/jsonディレクトリに${files.length}個のファイルが存在`);
        
        // キャッシュからファイルの実在性を再チェック
        for (const file of files) {
          const fullPath = path.join(jsonDir, file);
          try {
            // ファイルの存在を確認し、アクセス可能かチェック
            fs.accessSync(fullPath, fs.constants.F_OK | fs.constants.R_OK);
          } catch (err) {
            // アクセスできない場合は警告を出す
            console.warn(`警告: ファイルにアクセスできません: ${fullPath}`, err);
          }
        }
      } catch (readErr) {
        console.error('ディレクトリ読み取りエラー:', readErr);
      }
    }
    
    // index.json ファイルの再構築（トラッキングファイル）
    const indexJsonPath = path.join(process.cwd(), 'knowledge-base', 'index.json');
    
    try {
      // 実際のファイルリストを取得
      const jsonFiles = fs.existsSync(jsonDir) ? fs.readdirSync(jsonDir) : [];
      
      // 現在のメタデータファイルから最新インデックスを再構築
      const indexData = {
        lastUpdated: new Date().toISOString(),
        guides: [] as any[],
        fileCount: jsonFiles.length
      };
      
      // インデックスファイルに書き込み
      fs.writeFileSync(indexJsonPath, JSON.stringify(indexData, null, 2));
      console.log(`インデックスファイルを更新しました: ${indexJsonPath}`);
    } catch (indexErr) {
      console.error('インデックスファイル更新エラー:', indexErr);
    }
    
    // image_search_data.jsonの再読み込み
    try {
      const imageSearchDataPath = path.join(process.cwd(), 'knowledge-base', 'data', 'image_search_data.json');
      
      // ファイルが存在する場合、キャッシュデータを再読み込み
      if (fs.existsSync(imageSearchDataPath)) {
        fs.readFileSync(imageSearchDataPath, 'utf8');
        console.log('画像検索データを再読み込みしました');
      } else {
        console.log('画像検索データファイルが見つかりません');
      }
    } catch (imageDataErr) {
      console.error('画像検索データ読み込みエラー:', imageDataErr);
    }
    
    // 孤立したJSONファイルのクリーンアップを実行
    try {
      // 孤立JSONファイルの検出と削除を実行
      const cleanupResult = await cleanupOrphanedJsonFiles();
      console.log(`孤立JSONファイルクリーンアップ: ${cleanupResult.removed}件削除, ${cleanupResult.errors}件エラー`);
      
      if (cleanupResult.removed > 0) {
        console.log('孤立JSONファイルが検出・削除されました。メタデータを更新します');
      }
    } catch (cleanupErr) {
      console.error('孤立JSONファイルクリーンアップエラー:', cleanupErr);
    }
    
    // カスタムイベントエミッタでキャッシュクリアをクライアントに通知
    return res.json({ 
      success: true, 
      message: 'サーバーキャッシュをクリアしました' 
    });
  } catch (err) {
    console.error('キャッシュクリアエラー:', err);
    return res.status(500).json({ 
      error: 'キャッシュクリア中にエラーが発生しました' 
    });
  }
});

export default router;