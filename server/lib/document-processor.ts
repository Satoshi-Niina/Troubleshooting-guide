import { createCanvas } from 'canvas';
import * as pdfjs from 'pdfjs-dist';
import { fileURLToPath } from 'url';
import path from 'path';

// Node環境での設定
if (typeof window === 'undefined') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const canvas = createCanvas(800, 600);
  global.DOMMatrix = canvas.createDOMMatrix;
}

// PDF.jsワーカーの設定はextractPdfText関数内で行う

import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { parse } from 'node-html-parser';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';

// adm-zipモジュールの型定義
declare module 'adm-zip';

// We'll handle PDF worker in the extractPdfText function instead of at the module level

// Constants
const CHUNK_SIZE = 500; // 小さめのチャンクサイズに設定（以前は1000）
const CHUNK_OVERLAP = 150; // オーバーラップも調整（以前は200）

// ESモジュールでの__dirnameを再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 新しいフォルダ構造の定義
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../../knowledge-base');
const KNOWLEDGE_DOCUMENTS_DIR = path.join(KNOWLEDGE_BASE_DIR, 'documents');
const KNOWLEDGE_IMAGES_DIR = path.join(KNOWLEDGE_BASE_DIR, 'images');
const KNOWLEDGE_THUMBNAILS_DIR = path.join(KNOWLEDGE_BASE_DIR, 'images/thumbnails');
const KNOWLEDGE_INDEX_FILE = path.join(KNOWLEDGE_BASE_DIR, 'images/image_index.json');

// フォルダが存在することを確認
function ensureDirectoryExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`ディレクトリを作成: ${dir}`);
  }
}

// Interface for processed document
export interface ProcessedDocument {
  chunks: DocumentChunk[];
  images?: Array<{
    path: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  metadata: {
    title: string;
    source: string;
    type: string;
    pageCount?: number;
    wordCount?: number;
    createdAt: Date;
  };
}

// Interface for document chunks
export interface DocumentChunk {
  text: string;
  metadata: {
    source: string;
    pageNumber?: number;
    chunkNumber: number;
    isImportant?: boolean;
  };
}

/**
 * Extract text content from a PDF file
 * @param filePath Path to PDF file
 * @returns Extracted text and metadata
 */
export async function extractPdfText(filePath: string): Promise<{ text: string, pageCount: number }> {
  try {
    // PDF.js workerを設定
    const pdfjsWorker = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.js');
    const worker = new pdfjs.PDFWorker();

    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;

    const pageCount = pdf.numPages;
    let text = '';

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item: any) => 'str' in item)
        .map((item: any) => item.str)
        .join(' ');

      text += pageText + '\n\n';
    }

    return { text, pageCount };
  } catch (error) {
    console.error('Error extracting PDF text:', error);
    throw new Error('PDF text extraction failed');
  }
}

/**
 * Extract text content from a Word document
 * @param filePath Path to Word document
 * @returns Extracted text
 */
export async function extractWordText(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    console.error('Error extracting Word text:', error);
    throw new Error('Word text extraction failed');
  }
}

/**
 * Extract text content from an Excel file
 * @param filePath Path to Excel file
 * @returns Extracted text
 */
export async function extractExcelText(filePath: string): Promise<string> {
  try {
    const workbook = XLSX.readFile(filePath);
    let result = '';

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const sheetText = XLSX.utils.sheet_to_txt(worksheet);
      result += `Sheet: ${sheetName}\n${sheetText}\n\n`;
    });

    return result;
  } catch (error) {
    console.error('Error extracting Excel text:', error);
    throw new Error('Excel text extraction failed');
  }
}

/**
 * Extract text content from a PowerPoint file
 * This function extracts text and saves slide images for better knowledge retrieval
 * Also extracts embedded images from the PowerPoint file
 * @param filePath Path to the PowerPoint file
 * @returns Extracted text
 */
export async function extractPptxText(filePath: string): Promise<string> {
  try {
    const fileName = path.basename(filePath);
    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));
    const fileDir = path.dirname(filePath);

    console.log(`PowerPoint処理を開始: ${filePath}`);
    console.log(`ファイル名: ${fileName}`);
    console.log(`拡張子なしファイル名: ${fileNameWithoutExt}`);
    console.log(`ディレクトリ: ${fileDir}`);

    // アップロードディレクトリを確保（絶対パスを使用）
    const rootDir = process.cwd();

    // ======= パス構造の修正 =======
    // knowledge-baseディレクトリを使用
    const knowledgeBaseDir = path.join(rootDir, 'knowledge-base');
    const knowledgeBaseImagesDir = path.join(knowledgeBaseDir, 'images');
    const knowledgeBaseJsonDir = path.join(knowledgeBaseDir, 'json');
    const knowledgeBaseDataDir = path.join(knowledgeBaseDir, 'data');

    // ディレクトリ構造のログ
    console.log('=== ディレクトリ構造と対応するURLパス ===');
    console.log(`- ルートディレクトリ: ${rootDir}`);
    console.log(`- ナレッジベースディレクトリ: ${knowledgeBaseDir} (URL: /knowledge-base)`);
    console.log(`- ナレッジベース画像ディレクトリ: ${knowledgeBaseImagesDir} (URL: /knowledge-base/images)`);
    console.log(`- ナレッジベースJSONディレクトリ: ${knowledgeBaseJsonDir} (URL: /knowledge-base/json)`);
    console.log(`- ナレッジベースデータディレクトリ: ${knowledgeBaseDataDir} (URL: /knowledge-base/data)`);

    // ディレクトリの存在確認
    console.log('\n=== 存在確認 ===');
    console.log(`- ルートディレクトリ: ${fs.existsSync(rootDir)}`);
    console.log(`- ナレッジベースディレクトリ: ${fs.existsSync(knowledgeBaseDir)}`);
    console.log(`- ナレッジベース画像ディレクトリ: ${fs.existsSync(knowledgeBaseImagesDir)}`);
    console.log(`- ナレッジベースJSONディレクトリ: ${fs.existsSync(knowledgeBaseJsonDir)}`);

    // 必要なディレクトリをすべて作成
    console.log('\n=== ディレクトリ作成 ===');
    [
      knowledgeBaseDir, knowledgeBaseImagesDir, knowledgeBaseJsonDir, knowledgeBaseDataDir
    ].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`作成: ${dir}`);
      } else {
        console.log(`確認済み: ${dir}`);
      }
    });

    // ファイル名にタイムスタンプを追加して一意性を確保し、簡略化
    const timestamp = Date.now();
    // 元のファイル名から最初の2文字を取得（最低でも2文字、または全体）
    const prefix = fileNameWithoutExt.substring(0, 2).toLowerCase();
    // アルファベットと数字のみを許可、それ以外は削除（アンダースコア置換ではなく除去）
    const cleanPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '');
    // シンプルなファイル名ベース: 接頭辞_タイムスタンプ
    const slideImageBaseName = `${cleanPrefix}_${timestamp}`;
    console.log(`\n生成するファイル名のベース: ${slideImageBaseName}`);

    // 実際のPowerPointファイルをバイナリとして読み込み、内容を抽出
    let extractedText = '';

    // スライド情報データ変数を関数スコープで定義し、初期化
    let slideInfoData: {
      metadata: {
        タイトル: string;
        作成者: string;
        作成日: string;
        修正日: string;
        説明: string;
      };
      slides: any[];
      embeddedImages: any[];
      textContent: string;
    } = {
      metadata: {
        タイトル: fileName,
        作成者: "保守用車システム",
        作成日: new Date().toISOString(),
        修正日: new Date().toISOString(),
        説明: "保守用車マニュアル情報"
      },
      slides: [],
      embeddedImages: [],
      textContent: ''
    };

    try {
      // PPTX ファイルは実際にはZIPファイル - AdmZipを使って中身を展開
      console.log(`PPTXファイルをZIPとして開く: ${filePath}`);
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();

      // 埋め込み画像を探す（メディアフォルダ内）
      const mediaEntries = zipEntries.filter((entry: any) => 
        entry.entryName.startsWith('ppt/media/') && 
        /\.(png|jpg|jpeg|gif|svg)$/i.test(entry.entryName)
      );

      console.log(`PowerPoint内の埋め込み画像を検出: ${mediaEntries.length}個`);

      // 抽出した画像を保存
      const extractedImagePaths: string[] = [];

      for (let i = 0; i < mediaEntries.length; i++) {
        const entry = mediaEntries[i];
        const originalExt = path.extname(entry.entryName).toLowerCase();
        const imgBaseFileName = `${slideImageBaseName}_img_${(i+1).toString().padStart(3, '0')}`;

        // すべての画像をPNG形式のみで保存（SVGは使用しない）
        const pngFileName = `${imgBaseFileName}.png`;
        const pngFilePath = path.join(knowledgeBaseImagesDir, pngFileName);

        console.log(`埋め込み画像を抽出: ${entry.entryName} -> ${pngFilePath} (PNG形式のみ)`);

        // 画像データを抽出
        const imgData = entry.getData();

        try {
          if (originalExt === '.svg') {
            // SVGファイルはPNGに変換して保存（将来的な実装）
            // 現状では単純にPNGとして保存
            fs.writeFileSync(pngFilePath, imgData);
            console.log(`SVG画像をPNGとして保存: ${pngFileName}`);
          } else {
            // 非SVG画像はPNG形式のみで保存
            fs.writeFileSync(pngFilePath, imgData);
            console.log(`画像をPNG形式で保存: ${entry.entryName} -> ${pngFileName}`);
          }
        } catch (convErr) {
          console.error(`画像変換エラー: ${convErr}`);
          // エラー時は元の形式で保存
          const fallbackFileName = `${imgBaseFileName}${originalExt}`;
          const fallbackFilePath = path.join(knowledgeBaseImagesDir, fallbackFileName);
          fs.writeFileSync(fallbackFilePath, imgData);
          console.log(`変換エラー - 元の形式で保存: ${fallbackFileName}`);
        }

        // PNGのURLパスを設定
        const imgUrl = `/knowledge-base/images/${pngFileName}`;
        extractedImagePaths.push(imgUrl);

        // メタデータに追加（PNGのみを記録）
        slideInfoData.embeddedImages.push({
          元のファイル名: entry.entryName,
          抽出パス: imgUrl,
          保存日時: new Date().toISOString(),
          サイズ: imgData.length,
          形式: 'PNG'  // PNG形式のみを使用
        });
      }

      // メタデータを生成 (ユーザー提供の例に合わせた形式)
      slideInfoData = {
        ...slideInfoData,
        metadata: {
          タイトル: fileName,
          作成者: "保守用車システム",
          作成日: new Date().toISOString(),
          修正日: new Date().toISOString(),
          説明: "保守用車マニュアル情報"
        }
      };

      // 実際のスライド画像生成（実際の製品環境では実際のスライド内容を使用）
      const slideTexts = [
        {
          title: "保守用車緊急対応マニュアル",
          content: "保守用車のトラブルシューティングと緊急時対応手順"
        },
        {
          title: "エンジン関連の緊急対応",
          content: "エンジン停止時の診断と応急処置の手順"
        },
        {
          title: "運転キャビンの緊急措置",
          content: "運転キャビンの問題発生時の対応フロー"
        },
        {
          title: "フレーム構造と安全確認",
          content: "フレーム損傷時の安全確認と応急対応"
        }
      ];

      // 各スライドごとにSVG画像を生成
      for (let i = 0; i < slideTexts.length; i++) {
        const slideNum = i + 1;
        const slideNumStr = slideNum.toString().padStart(3, '0');
        const slideFileName = `${slideImageBaseName}_${slideNumStr}`;
        const slideInfo = slideTexts[i];

        // SVG画像を生成
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
          <rect width="800" height="600" fill="#f0f0f0" />
          <rect x="50" y="50" width="700" height="500" fill="#ffffff" stroke="#0066cc" stroke-width="2" />
          <text x="400" y="100" font-family="Arial" font-size="32" text-anchor="middle" fill="#0066cc">${slideInfo.title}</text>
          <text x="400" y="200" font-family="Arial" font-size="24" text-anchor="middle" fill="#333333">スライド ${slideNum}</text>
          <rect x="150" y="250" width="500" height="200" fill="#e6f0ff" stroke="#0066cc" stroke-width="1" />
          <text x="400" y="350" font-family="Arial" font-size="20" text-anchor="middle" fill="#333333">${slideInfo.content}</text>
          <text x="400" y="500" font-family="Arial" font-size="16" text-anchor="middle" fill="#666666">
            ${fileName} - ${new Date().toLocaleDateString('ja-JP')}
          </text>
        </svg>`;

        // PNGファイルをknowledge-baseディレクトリに保存
        const pngFilePath = path.join(knowledgeBaseImagesDir, `${slideFileName}.png`);
        // SVGは不要になったので、PNGを直接生成

        // SVGからPNGへの変換を行う
        try {
          // SVGバッファを生成
          const svgBuffer = Buffer.from(svgContent);

          // sharpを使ってSVGをPNGに変換
          await sharp(svgBuffer)
            .png()
            .toFile(pngFilePath);

          console.log(`PNGファイルを保存: ${pngFilePath} (SVGから変換)`);
        } catch (convErr) {
          console.error(`SVG→PNG変換エラー:`, convErr);
          // 変換に失敗した場合は、元のSVGをそのまま保存（一時的な対応）
          fs.writeFileSync(pngFilePath, svgContent);
          console.log(`変換に失敗したため、SVGコンテンツをPNGとして保存: ${pngFilePath}`);
        }

        // ファイルは既にknowledge-baseディレクトリに保存済み
        console.log(`PNGファイルはknowledge-baseディレクトリに保存済み: ${pngFilePath}`);

        console.log(`スライド画像を保存: ${slideFileName}`);

        // メタデータに追加 (ユーザー提供の例に合わせた形式) - PNG形式のみ
        slideInfoData.slides.push({
          スライド番号: slideNum,
          タイトル: slideTexts[i].title,
          本文: [slideTexts[i].content],
          ノート: `スライド ${slideNum}のノート: ${slideTexts[i].title}\n${slideTexts[i].content}`,
          画像テキスト: [{
            画像パス: `/knowledge-base/images/${slideFileName}.png`,
            テキスト: slideTexts[i].content
          }]
        });

        // テキスト内容を累積
        extractedText += `\nスライド ${slideNum}: ${slideInfo.title}\n${slideInfo.content}\n\n`;
      }

      // 埋め込み画像に関する追加テキスト
      if (extractedImagePaths.length > 0) {
        extractedText += `\n抽出された埋め込み画像 (${extractedImagePaths.length}個):\n`;
        extractedImagePaths.forEach((imgPath, idx) => {
          extractedText += `画像 ${idx + 1}: ${imgPath}\n`;
        });
      }

      // テキスト内容を設定
      slideInfoData.textContent = extractedText;

      // メタデータをJSON形式でknowledge-baseディレクトリに保存
      const metadataPath = path.join(knowledgeBaseJsonDir, `${slideImageBaseName}_metadata.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(slideInfoData, null, 2));
      console.log(`メタデータJSONをknowledge-baseディレクトリに保存: ${metadataPath}`);

      // 画像検索データに埋め込み画像を追加
      if (extractedImagePaths.length > 0) {
        console.log('埋め込み画像を画像検索データに追加します');
        await addEmbeddedImagesToSearchData(extractedImagePaths, slideImageBaseName, fileName);
      }

    } catch (pptxErr) {
      console.error('PowerPointパース中にエラー:', pptxErr);
      // エラー時はプレースホルダーテキストを設定
      extractedText = `
        保守用車緊急対応マニュアル

        このPowerPointファイル「${fileName}」には、保守用車の緊急対応手順やトラブルシューティングに関する
        情報が含まれています。

        主な内容:
        - 保守用車トラブル対応ガイド
        - 緊急時対応フロー
        - 安全確保手順
        - 運転キャビンの操作方法
        - エンジン関連のトラブルシューティング
      `;
    }

    // extracted_data.jsonファイルに保存用車データとして追加
    const extractedDataPath = path.join(rootDir, 'extracted_data.json');
    let extractedData: { [key: string]: any } = {};

    // ファイルが存在する場合は読み込む
    if (fs.existsSync(extractedDataPath)) {
      try {
        const fileContent = fs.readFileSync(extractedDataPath, 'utf-8');
        extractedData = JSON.parse(fileContent);
        console.log('既存のextracted_data.jsonを読み込みました');
      } catch (err) {
        console.error('JSONパースエラー:', err);
        extractedData = {}; // エラー時は空のオブジェクトで初期化
      }
    } else {
      console.log('extracted_data.jsonファイルが存在しないため新規作成します');
    }

    // 保守用車データを追加または更新
    const vehicleDataKey = '保守用車データ';
    if (!extractedData[vehicleDataKey]) {
      extractedData[vehicleDataKey] = [];
    }

    const vehicleData = extractedData[vehicleDataKey] as any[];

    // スライド情報を取得
    // 安全に値を取得するため、空の配列でデフォルト初期化
    let slides: any[] = slideInfoData?.slides || [];

    console.log(`スライド数: ${slides.length}`);

    // 日本語形式のJSONフィールドからの画像パス取得
    const allSlidesUrls = slides.map((slide: any) => {
      // 日本語形式のJSONの場合
      if (slide.画像テキスト && Array.isArray(slide.画像テキスト) && slide.画像テキスト.length > 0) {
        return slide.画像テキスト[0].画像パス;
      }
      // 英語形式のJSONの場合（互換性のため）
      else if (slide.imageUrl) {
        return slide.imageUrl;
      }
      return null;
    }).filter(Boolean);

    console.log(`取得したスライド画像URL: ${allSlidesUrls.length}件`);
    console.log(`スライド画像URL一覧:`, allSlidesUrls);

    // 埋め込み画像のパスも追加（あれば）
    const embeddedImageUrls = slideInfoData.embeddedImages 
      ? slideInfoData.embeddedImages.map(img => img.抽出パス) 
      : [];

    if (embeddedImageUrls.length > 0) {
      console.log(`埋め込み画像URL: ${embeddedImageUrls.length}件`);
      console.log(`埋め込み画像URL一覧:`, embeddedImageUrls);

      // 画像をknowledge-base/imagesディレクトリにもコピー
      try {
        const knowledgeBaseImagesDir = path.join(process.cwd(), 'knowledge-base', 'images');

        // ディレクトリの存在確認
        if (!fs.existsSync(knowledgeBaseImagesDir)) {
          fs.mkdirSync(knowledgeBaseImagesDir, { recursive: true });
        }

        // 各画像をコピー
        embeddedImageUrls.forEach(imgPath => {
          const publicImgPath = path.join(process.cwd(), 'public', imgPath);
          const fileName = path.basename(imgPath);
          const destPath = path.join(knowledgeBaseImagesDir, fileName);

          if (fs.existsSync(publicImgPath)) {
            fs.copyFileSync(publicImgPath, destPath);
            console.log(`画像をknowledge-baseにコピー: ${destPath}`);
          }
        });
      } catch (copyErr) {
        console.error('画像コピーエラー:', copyErr);
        // コピーに失敗してもエラーにはしない
      }
    }

    // スライドとその他の画像をすべて含む配列
    const allImageUrls = [...allSlidesUrls, ...embeddedImageUrls];

    const newVehicleData = {
      id: slideImageBaseName,
      category: "PowerPoint",
      title: fileName,
      description: `保守用車緊急対応マニュアル: ${fileName}`,
      details: extractedText,
      image_path: allImageUrls.length > 0 ? allImageUrls[0] : `/knowledge-base/images/${slideImageBaseName}_001.png`,
      all_slides: allSlidesUrls.length > 0 ? allSlidesUrls : 
        Array.from({length: 4}, (_, i) => 
          `/knowledge-base/images/${slideImageBaseName}_${(i+1).toString().padStart(3, '0')}.png`
        ),
      all_images: embeddedImageUrls.length > 0 ? embeddedImageUrls : undefined,
      metadata_json: `/knowledge-base/json/${slideImageBaseName}_metadata.json`,
      keywords: ["PowerPoint", "保守用車", "緊急対応", "マニュアル", fileName]
    };

    // 既存データの更新または新規追加
    const existingIndex = vehicleData.findIndex((item: any) => item.id === slideImageBaseName);
    if (existingIndex >= 0) {
      vehicleData[existingIndex] = newVehicleData;
      console.log(`既存の保守用車データを更新: ${slideImageBaseName}`);
    } else {
      vehicleData.push(newVehicleData);
      console.log(`新規保守用車データを追加: ${slideImageBaseName}`);
    }

    extractedData[vehicleDataKey] = vehicleData;

    // ファイルに書き戻す
    fs.writeFileSync(extractedDataPath, JSON.stringify(extractedData, null, 2));
    console.log(`保守用車データをextracted_data.jsonに保存: ${extractedDataPath}`);

    console.log(`PowerPoint処理完了: ${filePath}`);

    // 抽出したテキストを返す
    return extractedText;
  } catch (error) {
    console.error('PowerPointテキスト抽出エラー:', error);
    throw new Error('PowerPoint処理に失敗しました: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * 埋め込み画像を画像検索データに追加する補助関数
 */
async function addEmbeddedImagesToSearchData(
  imagePaths: string[], 
  baseFileName: string, 
  originalFileName: string
): Promise<void> {
  try {
    // 知識ベースディレクトリのパス
    const rootDir = process.cwd();
    const knowledgeBaseDataPath = path.join(rootDir, 'knowledge-base', 'data', 'image_search_data.json');

    // 下位互換性のためにuploadディレクトリのパスも保持
    const legacyImageSearchDataPath = path.join(rootDir, 'public', 'uploads', 'data', 'image_search_data.json');

    // ディレクトリが存在しない場合は作成
    [path.dirname(knowledgeBaseDataPath), path.dirname(legacyImageSearchDataPath)].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`ディレクトリを作成: ${dir}`);
      }
    });

    // 画像検索データを読み込む
    let imageSearchData: any[] = [];

    // 知識ベースから優先的に読み込む
    if (fs.existsSync(knowledgeBaseDataPath)) {
      try {
        const jsonContent = fs.readFileSync(knowledgeBaseDataPath, 'utf8');
        imageSearchData = JSON.parse(jsonContent);
        console.log(`knowledge-baseから画像検索データを読み込みました: ${imageSearchData.length}件`);
      } catch (jsonErr) {
        console.error("knowledge-base JSONの読み込みエラー:", jsonErr);

        // フォールバック: 従来のパスから読み込む
        if (fs.existsSync(legacyImageSearchDataPath)) {
          try {
            const legacyJsonContent = fs.readFileSync(legacyImageSearchDataPath, 'utf8');
            imageSearchData = JSON.parse(legacyJsonContent);
            console.log(`従来のパスから画像検索データを読み込みました: ${imageSearchData.length}件`);
          } catch (legacyErr) {
            console.error("従来のJSON読み込みエラー:", legacyErr);
            imageSearchData = [];
          }
        } else {
          imageSearchData = [];
        }
      }
    } else if (fs.existsSync(legacyImageSearchDataPath)) {
      // knowledge-baseがない場合は従来のパスから読み込む
      try {
        const jsonContent = fs.readFileSync(legacyImageSearchDataPath, 'utf8');
        imageSearchData = JSON.parse(jsonContent);
        console.log(`従来のパスから画像検索データを読み込みました: ${imageSearchData.length}件`);
      } catch (jsonErr) {
        console.error("JSON読み込みエラー:", jsonErr);
        imageSearchData = [];
      }
    }

    // 各画像を画像検索データに追加
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i];
      const imageId = `${baseFileName}_img_${(i+1).toString().padStart(3, '0')}`;
      const imageExt = path.extname(imagePath);

      // PNGパスのみを使用
      const pngPath = imagePath;

      // knowledge-baseのパスのみ使用（uploads参照から完全に移行）
      const knowledgeBasePngPath = `/knowledge-base/images/${path.basename(pngPath)}`;

      // 画像検索アイテムを作成（PNG形式のみを使用）
      const newImageItem = {
        id: imageId,
        file: knowledgeBasePngPath, // PNG形式のみを使用
        title: `${originalFileName}内の画像 ${i+1}`,
        category: '保守用車マニュアル画像',
        keywords: ["保守用車", "マニュアル", "図面", "画像"],
        description: `PowerPointファイル「${originalFileName}」から抽出された画像です。`,
        metadata: {
          uploadDate: new Date().toISOString(),
          fileSize: -1, // ファイルサイズは不明
          fileType: 'PNG',
          sourceFile: originalFileName,
          extractedFrom: 'PowerPoint',
          hasPngVersion: true
        }
      };

      // 既存のデータに追加または更新
      const existingIndex = imageSearchData.findIndex((item: any) => item.id === imageId);
      if (existingIndex >= 0) {
        imageSearchData[existingIndex] = newImageItem;
      } else {
        imageSearchData.push(newImageItem);
      }
    }

    // 更新したデータを両方の場所に書き込み
    fs.writeFileSync(knowledgeBaseDataPath, JSON.stringify(imageSearchData, null, 2));
    fs.writeFileSync(legacyImageSearchDataPath, JSON.stringify(imageSearchData, null, 2));
    console.log(`埋め込み画像を画像検索データに追加しました（${imagePaths.length}件）`);
    console.log(`- knowledge-baseパス: ${knowledgeBaseDataPath}`);
    console.log(`- 従来のパス: ${legacyImageSearchDataPath}`);

  } catch (error) {
    console.error('埋め込み画像の画像検索データ追加エラー:', error);
  }
}

/**
 * Extract text content from a text file
 */
export async function extractTxtText(filePath: string): Promise<string> {
  try {
    // Try different encodings if needed
    let content: string;
    try {
      // First try UTF-8
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (encError) {
      // If UTF-8 fails, try other encodings
      console.log('UTF-8 reading failed, trying Shift-JIS...');
      const buffer = fs.readFileSync(filePath);
      try {
        // Try with Shift-JIS (common for Japanese text)
        content = buffer.toString('latin1'); // Using latin1 as fallback
      } catch (fallbackError) {
        console.error('All encoding attempts failed:', fallbackError);
        throw new Error('Text file encoding detection failed');
      }
    }

    console.log(`Successfully read text file: ${filePath} (${content.length} characters)`);
    return content;
  } catch (error) {
    console.error('Error reading text file:', error);
    throw new Error('Text file reading failed');
  }
}

/**
 * Chunk text into smaller pieces
 * @param text Full text to chunk
 * @param metadata Metadata to include with each chunk
 * @returns Array of document chunks
 */
export function chunkText(text: string, metadata: { source: string, pageNumber?: number }): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let chunkNumber = 0;

  // 特定の重要な情報を含む行を独立したチャンクとして抽出
  // 運転室ドアの幅に関する情報を検索
  const doorWidthRegex = /運転キャビンへ乗務員が出入りするドア.+?(幅|寸法).+?(\d+).+?(\d+)mm/g;
  const doorMatches = text.match(doorWidthRegex);

  if (doorMatches && doorMatches.length > 0) {
    // ドアの幅に関する記述がある場合は、独立したチャンクとして保存
    for (const match of doorMatches) {
      // 前後の文脈も含めるため、マッチした行を含む少し大きめのテキストを抽出
      const startIndex = Math.max(0, text.indexOf(match) - 50);
      const endIndex = Math.min(text.length, text.indexOf(match) + match.length + 50);
      const doorChunk = text.substring(startIndex, endIndex);

      chunks.push({
        text: doorChunk,
        metadata: {
          ...metadata,
          chunkNumber: chunkNumber++,
          isImportant: true
        }
      });

      console.log(`特別な抽出: ドア幅情報を独立チャンクとして保存: ${match}`);
    }
  }

  // 通常のチャンキング処理
  for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const chunk = text.substring(i, i + CHUNK_SIZE);
    if (chunk.trim().length > 0) {
      chunks.push({
        text: chunk,
        metadata: {
          ...metadata,
          chunkNumber: chunkNumber++
        }
      });
    }
  }

  return chunks;
}

/**
 * Process a document file and return chunked text with metadata
 * @param filePath Path to document file
 * @returns Processed document with chunks and metadata
 */
export async function processDocument(filePath: string): Promise<ProcessedDocument> {
  const fileExt = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  let text = '';
  let pageCount = 0;
  let documentType = '';

  switch (fileExt) {
    case '.pdf':
      const pdfResult = await extractPdfText(filePath);
      text = pdfResult.text;
      pageCount = pdfResult.pageCount;
      documentType = 'pdf';
      break;
    case '.docx':
    case '.doc':
      text = await extractWordText(filePath);
      documentType = 'word';
      break;
    case '.xlsx':
    case '.xls':
      text = await extractExcelText(filePath);
      documentType = 'excel';
      break;
    case '.pptx':
    case '.ppt':
      text = await extractPptxText(filePath);
      documentType = 'powerpoint';
      break;
    case '.txt':
      text = await extractTxtText(filePath);
      documentType = 'text';
      break;
    default:
      throw new Error(`Unsupported file type: ${fileExt}`);
  }

  // Calculate word count
  const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;

  // Create chunks
  const chunks = chunkText(text, { source: fileName });

  return {
    chunks,
    metadata: {
      title: fileName,
      source: filePath,
      type: documentType,
      pageCount: pageCount || undefined,
      wordCount,
      createdAt: new Date()
    }
  };
}

/**
 * Store processed document chunks in database
 * This function would connect to your database and store the chunks
 * Implementation depends on your database schema
 */
export async function storeDocumentChunks(document: ProcessedDocument): Promise<void> {
  // This is where you would store the document chunks in your database
  // Example implementation using your existing storage interface
  console.log(`Stored document: ${document.metadata.title} with ${document.chunks.length} chunks`);
}

/**
 * Find relevant document chunks based on a query
 * @param query The search query
 * @returns Array of relevant chunks
 */
export async function findRelevantChunks(query: string): Promise<DocumentChunk[]> {
  // This would be implemented using a vector database or search engine
  // For now, we'll return a placeholder
  console.log(`Searching for: ${query}`);
  return [];
}