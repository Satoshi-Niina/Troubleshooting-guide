/**
 * PPTXからの画像抽出処理を強化するスクリプト
 * - グループ化された画像要素の統合処理
 * - 意味のある単位での画像抽出
 * - メタデータとキーワードの強化
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const sharp = require('sharp');

// ディレクトリパスの設定
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', 'knowledge-base');
const KNOWLEDGE_IMAGES_DIR = path.join(KNOWLEDGE_BASE_DIR, 'images');
const KNOWLEDGE_JSON_DIR = path.join(KNOWLEDGE_BASE_DIR, 'json');
const IMAGE_SEARCH_DATA_PATH = path.join(KNOWLEDGE_BASE_DIR, 'data', 'image_search_data.json');

// ディレクトリの存在確認と作成
function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`ディレクトリを作成しました: ${dir}`);
  }
}

/**
 * PPTXファイルからグループ化された要素を含む画像を抽出
 * @param {string} pptxFilePath - 処理するPPTXファイルのパス
 * @returns {Promise<Object>} - 抽出結果の情報
 */
async function extractEnhancedImagesFromPptx(pptxFilePath) {
  const fileName = path.basename(pptxFilePath, path.extname(pptxFilePath));
  const timestamp = Date.now();
  const cleanPrefix = fileName.replace(/[^a-zA-Z0-9_]/g, '_');
  const baseOutputName = `${cleanPrefix}_${timestamp}`;
  
  console.log(`処理開始: ${pptxFilePath}`);
  console.log(`出力ファイル名ベース: ${baseOutputName}`);
  
  // 必要なディレクトリの確認
  ensureDirectoryExists(KNOWLEDGE_IMAGES_DIR);
  ensureDirectoryExists(KNOWLEDGE_JSON_DIR);
  ensureDirectoryExists(path.join(KNOWLEDGE_BASE_DIR, 'data'));
  
  // メタデータ構造の初期化
  const metadataInfo = {
    metadata: {
      タイトル: fileName,
      作成者: "保守用車システム",
      作成日: new Date().toISOString(),
      修正日: new Date().toISOString(),
      説明: "保守用車マニュアル情報"
    },
    slides: [],
    embeddedImages: [],
    groupedImages: [], // グループ化画像の情報
    textContent: ''
  };
  
  try {
    // PPTXファイルをZIPとして開く
    const zip = new AdmZip(pptxFilePath);
    const zipEntries = zip.getEntries();
    
    // 画像ファイルの抽出（メディアフォルダ内）
    const mediaEntries = zipEntries.filter(entry => 
      entry.entryName.startsWith('ppt/media/') && 
      /\.(png|jpg|jpeg|gif|svg)$/i.test(entry.entryName)
    );
    
    console.log(`PPTXファイル内の画像数: ${mediaEntries.length}個`);
    
    // グループ検出のためのパターン分析 (ファイル名の類似性などで判断)
    const imageGroups = detectImageGroups(mediaEntries);
    console.log(`検出されたイメージグループ: ${Object.keys(imageGroups).length}グループ`);
    
    // 各グループとそれ以外の個別画像を処理
    const processedImages = [];
    
    // 1. まずグループ化されていない個別画像を処理
    const individualImages = mediaEntries.filter(entry => 
      !Object.values(imageGroups).flat().includes(entry.entryName)
    );
    
    console.log(`個別処理する画像: ${individualImages.length}個`);
    
    // 個別画像の処理
    for (let i = 0; i < individualImages.length; i++) {
      const entry = individualImages[i];
      const imgNumber = (i + 1).toString().padStart(3, '0');
      const imgFileName = `${baseOutputName}_img_${imgNumber}.png`;
      const imgFilePath = path.join(KNOWLEDGE_IMAGES_DIR, imgFileName);
      
      await processAndSaveImage(entry, imgFilePath, zip);
      
      // メタデータに追加
      const imgUrl = `/knowledge-base/images/${imgFileName}`;
      metadataInfo.embeddedImages.push({
        元のファイル名: entry.entryName,
        抽出パス: imgUrl,
        形式: 'PNG',
        グループ: false,
        説明: `個別画像 ${i + 1}`,
        キーワード: generateKeywordsFromFileName(entry.entryName)
      });
      
      processedImages.push({
        path: imgUrl,
        fileName: imgFileName,
        isGrouped: false
      });
    }
    
    // 2. グループ化された画像を統合処理
    let groupCounter = 0;
    
    for (const [groupName, groupEntries] of Object.entries(imageGroups)) {
      groupCounter++;
      const groupImgNumber = groupCounter.toString().padStart(3, '0');
      const groupFileName = `${baseOutputName}_group_${groupImgNumber}.png`;
      const groupFilePath = path.join(KNOWLEDGE_IMAGES_DIR, groupFileName);
      
      // グループ内の画像を統合
      await processGroupedImages(groupEntries, groupFilePath, zip, groupName);
      
      // グループ画像のメタデータを作成
      const groupImgUrl = `/knowledge-base/images/${groupFileName}`;
      const groupKeywords = generateKeywordsForGroup(groupName, groupEntries);
      
      metadataInfo.groupedImages.push({
        グループ名: groupName,
        画像パス: groupImgUrl,
        元画像数: groupEntries.length,
        形式: 'PNG',
        説明: `${groupName} - ${groupEntries.length}個の画像から構成`,
        キーワード: groupKeywords
      });
      
      processedImages.push({
        path: groupImgUrl,
        fileName: groupFileName,
        isGrouped: true,
        groupName: groupName,
        originalCount: groupEntries.length
      });
    }
    
    // 処理された画像情報をメタデータに統合
    metadataInfo.processedImages = processedImages;
    
    // メタデータをJSON形式で保存
    const metadataPath = path.join(KNOWLEDGE_JSON_DIR, `${baseOutputName}_metadata.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadataInfo, null, 2));
    console.log(`メタデータを保存しました: ${metadataPath}`);
    
    // 画像検索データを更新
    await updateImageSearchData(processedImages, baseOutputName, fileName);
    
    return {
      success: true,
      baseOutputName: baseOutputName,
      processedImagesCount: processedImages.length,
      metadataPath: metadataPath
    };
    
  } catch (error) {
    console.error('PPTXファイル処理中にエラーが発生しました:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 画像グループを検出するヘルパー関数 
 * ファイル名の類似性、サイズ、順序パターンなどを基に判断
 */
function detectImageGroups(mediaEntries) {
  const groups = {};
  
  // ファイル名のパターンに基づいてグループ化
  // 例: image1.png, image2.png, image3.png など連番パターン
  const fileNamePatterns = {};
  
  mediaEntries.forEach(entry => {
    const entryName = entry.entryName;
    // 連番パターン検出 (例: name1.png, name2.png)
    const match = entryName.match(/(.+?)(\d+)(\.[^.]+)$/);
    
    if (match) {
      const baseName = match[1];
      const extension = match[3];
      const patternKey = `${baseName}*${extension}`;
      
      if (!fileNamePatterns[patternKey]) {
        fileNamePatterns[patternKey] = [];
      }
      
      fileNamePatterns[patternKey].push(entryName);
    }
  });
  
  // 連番パターンでグループ化
  for (const [pattern, entries] of Object.entries(fileNamePatterns)) {
    // 2つ以上のファイルがある場合のみグループとして認識
    if (entries.length >= 2) {
      const groupName = `グループ_${pattern.replace(/[*.\\/]/g, '_')}`;
      groups[groupName] = entries;
    }
  }
  
  // TODO: 必要に応じて他のグループ化ロジックを追加
  // 例: サイズ、作成時間、画像の類似性など
  
  return groups;
}

/**
 * 個別画像の処理と保存
 */
async function processAndSaveImage(entry, outputPath, zip) {
  try {
    const imgData = entry.getData();
    
    // 画像形式を判断
    const originalExt = path.extname(entry.entryName).toLowerCase();
    
    if (originalExt === '.svg') {
      // SVGファイルはPNGに変換
      const svgBuffer = Buffer.from(imgData);
      await sharp(svgBuffer)
        .png()
        .toFile(outputPath);
      console.log(`SVG画像をPNGに変換: ${outputPath}`);
    } else {
      // その他の画像形式もPNGに統一
      await sharp(imgData)
        .png()
        .toFile(outputPath);
      console.log(`画像をPNG形式に変換: ${outputPath}`);
    }
    
    return true;
  } catch (error) {
    console.error(`画像処理エラー (${entry.entryName}):`, error);
    // エラー時は元のデータをそのまま保存
    fs.writeFileSync(outputPath, entry.getData());
    console.log(`変換エラー - 元の形式で保存: ${outputPath}`);
    return false;
  }
}

/**
 * グループ化された画像の処理と結合
 */
async function processGroupedImages(groupEntries, outputPath, zip, groupName) {
  try {
    // 単純な方法: 最初は画像を縦に並べる
    // 実際の実装では、レイアウトエンジンを使用してより洗練された配置を行う
    
    // 各画像を処理
    const processedImages = [];
    let totalHeight = 0;
    let maxWidth = 0;
    
    for (const entryName of groupEntries) {
      const entry = zip.getEntry(entryName);
      if (!entry) continue;
      
      const imgData = entry.getData();
      
      // 一時ファイル名
      const tempFileName = path.join(
        path.dirname(outputPath),
        `temp_${path.basename(outputPath)}_${processedImages.length}.png`
      );
      
      // 画像をPNGに変換
      await sharp(imgData).png().toFile(tempFileName);
      
      // 画像メタデータを取得
      const metadata = await sharp(tempFileName).metadata();
      processedImages.push({
        path: tempFileName,
        width: metadata.width,
        height: metadata.height
      });
      
      totalHeight += metadata.height;
      maxWidth = Math.max(maxWidth, metadata.width);
    }
    
    // 画像を縦に結合
    // より複雑なレイアウトは将来的に実装
    
    // 結合用の背景を作成
    const padding = 10; // パディング
    const compositeBg = await sharp({
      create: {
        width: maxWidth + padding * 2,
        height: totalHeight + padding * (processedImages.length + 1),
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    }).png().toBuffer();
    
    // 合成処理
    let composite = sharp(compositeBg);
    let currentY = padding;
    
    for (const img of processedImages) {
      composite = composite.composite([{
        input: img.path,
        left: padding + Math.floor((maxWidth - img.width) / 2), // 中央揃え
        top: currentY
      }]);
      
      currentY += img.height + padding;
      
      // 一時ファイルを削除
      fs.unlinkSync(img.path);
    }
    
    // グループタイトルを追加（将来的な拡張）
    // ここではテキスト追加は省略（sharpでのテキスト追加は複雑なため）
    
    // 最終画像を保存
    await composite.toFile(outputPath);
    console.log(`グループ画像を作成しました: ${outputPath}`);
    
    return true;
  } catch (error) {
    console.error(`グループ化画像処理エラー:`, error);
    
    // エラー時は最初の画像だけを使用
    try {
      const firstEntry = zip.getEntry(groupEntries[0]);
      if (firstEntry) {
        await processAndSaveImage(firstEntry, outputPath, zip);
        console.log(`グループ処理エラー - 最初の画像のみを使用: ${outputPath}`);
      }
    } catch (fallbackError) {
      console.error('フォールバック処理にも失敗:', fallbackError);
      // 空の画像を作成
      await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .png()
      .toFile(outputPath);
    }
    
    return false;
  }
}

/**
 * 画像検索データの更新
 */
async function updateImageSearchData(processedImages, baseOutputName, originalFileName) {
  try {
    // 画像検索データの読み込み
    let searchData = [];
    
    if (fs.existsSync(IMAGE_SEARCH_DATA_PATH)) {
      const fileContent = fs.readFileSync(IMAGE_SEARCH_DATA_PATH, 'utf8');
      try {
        searchData = JSON.parse(fileContent);
      } catch (error) {
        console.error('画像検索データJSONパースエラー:', error);
        searchData = [];
      }
    }
    
    // 新しい画像エントリを追加
    for (const img of processedImages) {
      const keywords = [];
      
      // ファイル名からキーワード生成
      keywords.push(...generateKeywordsFromFileName(img.fileName));
      
      // グループ画像の場合、グループ名からもキーワード生成
      if (img.isGrouped && img.groupName) {
        keywords.push(...generateKeywordsForGroup(img.groupName, []));
      }
      
      // 元のPPTXファイル名からもキーワード生成
      keywords.push(...originalFileName.split(/[_\-\s.]+/).filter(Boolean));
      
      // 重複を除去
      const uniqueKeywords = [...new Set(keywords)];
      
      // 検索データに追加
      searchData.push({
        id: `${baseOutputName}_${img.fileName}`,
        file: img.path,
        title: img.isGrouped 
          ? `グループ画像: ${img.groupName || '不明なグループ'}`
          : `個別画像: ${originalFileName}`,
        category: img.isGrouped ? '構成部品グループ' : '部品単体',
        keywords: uniqueKeywords,
        description: img.isGrouped
          ? `${img.originalCount || '複数'}個の関連画像から構成されたグループ画像です。`
          : `保守用車マニュアルからの個別画像です。`,
        searchText: uniqueKeywords.join(' ') + ' ' + originalFileName
      });
    }
    
    // 更新されたデータを保存
    ensureDirectoryExists(path.dirname(IMAGE_SEARCH_DATA_PATH));
    fs.writeFileSync(IMAGE_SEARCH_DATA_PATH, JSON.stringify(searchData, null, 2));
    console.log(`画像検索データを更新しました: ${processedImages.length}件追加`);
    
    return true;
  } catch (error) {
    console.error('画像検索データ更新エラー:', error);
    return false;
  }
}

/**
 * ファイル名からキーワードを生成
 */
function generateKeywordsFromFileName(fileName) {
  // ファイル名から拡張子を除去
  const nameWithoutExt = path.basename(fileName, path.extname(fileName));
  
  // アンダースコア、ハイフン、スペースなどで分割
  const parts = nameWithoutExt.split(/[_\-\s.]+/).filter(Boolean);
  
  // 数字のみの部分は除外
  return parts.filter(part => !/^\d+$/.test(part));
}

/**
 * グループ用のキーワードを生成
 */
function generateKeywordsForGroup(groupName, groupEntries) {
  const keywords = [];
  
  // グループ名からキーワード抽出
  keywords.push(...groupName.split(/[_\-\s.]+/).filter(Boolean));
  
  // グループエントリからキーワード抽出（将来拡張用）
  
  // 技術用語の追加（例）
  keywords.push('構成部品', 'アセンブリ', 'グループ', '機械部品');
  
  return [...new Set(keywords)]; // 重複除去
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('使用方法: node enhance-pptx-extraction.js <PPTXファイルへのパス>');
    return;
  }
  
  const pptxFilePath = path.resolve(args[0]);
  
  if (!fs.existsSync(pptxFilePath)) {
    console.error(`エラー: ファイルが見つかりません: ${pptxFilePath}`);
    return;
  }
  
  if (!pptxFilePath.toLowerCase().endsWith('.pptx')) {
    console.error('エラー: PPTXファイルのみをサポートしています');
    return;
  }
  
  console.log(`PPTXファイルの処理を開始: ${pptxFilePath}`);
  const result = await extractEnhancedImagesFromPptx(pptxFilePath);
  
  if (result.success) {
    console.log('処理が完了しました!');
    console.log(`処理された画像数: ${result.processedImagesCount}`);
    console.log(`メタデータパス: ${result.metadataPath}`);
  } else {
    console.error('処理に失敗しました:', result.error);
  }
}

// スクリプトが直接実行された場合に実行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  extractEnhancedImagesFromPptx,
  detectImageGroups,
  processAndSaveImage,
  processGroupedImages,
  updateImageSearchData
};