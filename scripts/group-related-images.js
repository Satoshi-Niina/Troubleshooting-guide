/**
 * 関連画像をグループ化して統合するスクリプト
 * 既存のknowledge-base/imagesディレクトリ内の画像を分析し、関連する画像を
 * 一つの統合画像として再構成します。
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ディレクトリパスの設定
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '..', 'knowledge-base');
const KNOWLEDGE_IMAGES_DIR = path.join(KNOWLEDGE_BASE_DIR, 'images');
const KNOWLEDGE_GROUPS_DIR = path.join(KNOWLEDGE_IMAGES_DIR, 'groups');
const IMAGE_SEARCH_DATA_PATH = path.join(KNOWLEDGE_BASE_DIR, 'data', 'image_search_data.json');

// ディレクトリの存在確認と作成
function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`ディレクトリを作成しました: ${dir}`);
  }
}

/**
 * 画像ファイル名パターンに基づいて関連画像をグループ化
 */
async function groupRelatedImages() {
  console.log('関連画像のグループ化を開始します...');
  
  // ディレクトリの存在確認
  ensureDirectoryExists(KNOWLEDGE_GROUPS_DIR);
  
  try {
    // knowledge-base/imagesディレクトリ内の画像ファイルを取得
    const imageFiles = fs.readdirSync(KNOWLEDGE_IMAGES_DIR)
      .filter(filename => 
        /\.(png|jpg|jpeg)$/i.test(filename) && 
        !filename.includes('group_')  // 既にグループ化された画像は除外
      );
    
    console.log(`分析対象の画像ファイル数: ${imageFiles.length}`);
    
    // ファイル名パターンに基づいたグループ化
    const groups = findImageGroups(imageFiles);
    console.log(`検出されたグループ数: ${Object.keys(groups).length}`);
    
    // 検出されたグループの処理
    await processImageGroups(groups);
    
    // 画像検索データの更新
    await updateImageSearchData();
    
    console.log('関連画像のグループ化が完了しました');
    return true;
  } catch (error) {
    console.error('関連画像のグループ化中にエラーが発生しました:', error);
    return false;
  }
}

/**
 * ファイル名パターンに基づいて画像グループを検出
 */
function findImageGroups(imageFiles) {
  const groups = {};
  
  // ファイル名のパターンに基づいてグループ化
  // 1. 連番パターン (例: image1.png, image2.png, image3.png)
  const sequentialGroups = findSequentialGroups(imageFiles);
  Object.assign(groups, sequentialGroups);
  
  // 2. プレフィックスパターン (例: engine_part1.png, engine_valve.png)
  const prefixGroups = findPrefixGroups(imageFiles);
  Object.assign(groups, prefixGroups);
  
  // 3. タイムスタンプパターン (例: file_1234567890_001.png, file_1234567890_002.png)
  const timestampGroups = findTimestampGroups(imageFiles);
  Object.assign(groups, timestampGroups);
  
  return groups;
}

/**
 * 連番パターンのグループを検出
 */
function findSequentialGroups(imageFiles) {
  const groups = {};
  const patterns = {};
  
  imageFiles.forEach(filename => {
    // 連番パターン検出 (例: name1.png, name2.png)
    const match = filename.match(/(.+?)(\d+)(\.[^.]+)$/);
    
    if (match) {
      const baseName = match[1];
      const extension = match[3];
      const patternKey = `sequential_${baseName}${extension}`;
      
      if (!patterns[patternKey]) {
        patterns[patternKey] = [];
      }
      
      patterns[patternKey].push(filename);
    }
  });
  
  // 2つ以上のファイルがある場合のみグループとして認識
  for (const [pattern, files] of Object.entries(patterns)) {
    if (files.length >= 2) {
      // 数字順にソート
      files.sort((a, b) => {
        const numA = parseInt(a.match(/(\d+)(\.[^.]+)$/)[1]);
        const numB = parseInt(b.match(/(\d+)(\.[^.]+)$/)[1]);
        return numA - numB;
      });
      
      groups[pattern] = files;
    }
  }
  
  return groups;
}

/**
 * 共通プレフィックスに基づくグループを検出
 */
function findPrefixGroups(imageFiles) {
  const groups = {};
  const prefixMap = {};
  
  // プレフィックスの抽出
  imageFiles.forEach(filename => {
    // アンダースコアやハイフンで区切られたプレフィックスを抽出
    const prefixMatch = filename.match(/^([a-zA-Z0-9]+)[_\-]/);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      if (!prefixMap[prefix]) {
        prefixMap[prefix] = [];
      }
      prefixMap[prefix].push(filename);
    }
  });
  
  // 3つ以上のファイルがある場合のみグループとして認識
  for (const [prefix, files] of Object.entries(prefixMap)) {
    if (files.length >= 3) {
      const groupKey = `prefix_${prefix}`;
      groups[groupKey] = files;
    }
  }
  
  return groups;
}

/**
 * タイムスタンプパターンのグループを検出
 */
function findTimestampGroups(imageFiles) {
  const groups = {};
  const timestampMap = {};
  
  // タイムスタンプの抽出
  imageFiles.forEach(filename => {
    // タイムスタンプパターン (例: name_1234567890_001.png)
    const timestampMatch = filename.match(/[_\-](\d{10,})_/);
    if (timestampMatch) {
      const timestamp = timestampMatch[1];
      if (!timestampMap[timestamp]) {
        timestampMap[timestamp] = [];
      }
      timestampMap[timestamp].push(filename);
    }
  });
  
  // 2つ以上のファイルがある場合のみグループとして認識
  for (const [timestamp, files] of Object.entries(timestampMap)) {
    if (files.length >= 2) {
      const groupKey = `timestamp_${timestamp}`;
      groups[groupKey] = files;
    }
  }
  
  return groups;
}

/**
 * 検出された画像グループを処理して統合画像を作成
 */
async function processImageGroups(groups) {
  console.log('画像グループの処理を開始します...');
  
  const timestamp = Date.now();
  let processedCount = 0;
  
  for (const [groupName, files] of Object.entries(groups)) {
    const groupNumber = (processedCount + 1).toString().padStart(3, '0');
    const groupFileName = `group_${groupNumber}_${timestamp}.png`;
    const groupOutputPath = path.join(KNOWLEDGE_GROUPS_DIR, groupFileName);
    
    console.log(`グループ処理中: ${groupName} (${files.length}個のファイル)`);
    
    try {
      // 画像ファイルの読み込みとメタデータ取得
      const imageInfo = await Promise.all(files.map(async filename => {
        const filePath = path.join(KNOWLEDGE_IMAGES_DIR, filename);
        try {
          const metadata = await sharp(filePath).metadata();
          return {
            path: filePath,
            width: metadata.width,
            height: metadata.height,
            filename: filename
          };
        } catch (error) {
          console.error(`画像メタデータ読み込みエラー (${filename}):`, error);
          return null;
        }
      }));
      
      // エラーがあった場合はnullをフィルタリング
      const validImages = imageInfo.filter(img => img !== null);
      
      if (validImages.length === 0) {
        console.log(`グループ "${groupName}" に有効な画像がありません。スキップします。`);
        continue;
      }
      
      // 関連画像の統合処理
      await createCompositeImage(validImages, groupOutputPath, groupName);
      
      // 統合が成功したらカウント増加
      processedCount++;
      
    } catch (error) {
      console.error(`グループ "${groupName}" の処理中にエラーが発生しました:`, error);
    }
  }
  
  console.log(`${processedCount}個のグループを処理しました`);
}

/**
 * 関連画像から統合画像を作成
 */
async function createCompositeImage(images, outputPath, groupName) {
  try {
    // 単純なレイアウト方法：縦または横に配置
    // 画像の合計サイズに基づいてレイアウト方向を決定
    
    let totalWidth = 0;
    let totalHeight = 0;
    let maxWidth = 0;
    let maxHeight = 0;
    
    images.forEach(img => {
      totalWidth += img.width;
      totalHeight += img.height;
      maxWidth = Math.max(maxWidth, img.width);
      maxHeight = Math.max(maxHeight, img.height);
    });
    
    // 縦並びと横並びのどちらが良いかを判断
    const padding = 10;
    const isHorizontal = totalWidth / maxWidth < totalHeight / maxHeight;
    
    let compositeBg;
    let composite;
    
    if (isHorizontal) {
      // 横向きレイアウト
      const width = totalWidth + padding * (images.length + 1);
      const height = maxHeight + padding * 2 + 40; // タイトル用に追加余白
      
      compositeBg = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      }).png().toBuffer();
      
      composite = sharp(compositeBg);
      let currentX = padding;
      
      // 各画像を横に配置
      for (const img of images) {
        composite = composite.composite([{
          input: img.path,
          left: currentX,
          top: padding + 40 // タイトル用に下げる
        }]);
        
        currentX += img.width + padding;
      }
      
    } else {
      // 縦向きレイアウト
      const width = maxWidth + padding * 2;
      const height = totalHeight + padding * (images.length + 1) + 40; // タイトル用に追加余白
      
      compositeBg = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      }).png().toBuffer();
      
      composite = sharp(compositeBg);
      let currentY = padding + 40; // タイトル用に下げる
      
      // 各画像を縦に配置
      for (const img of images) {
        composite = composite.composite([{
          input: img.path,
          left: padding + Math.floor((maxWidth - img.width) / 2), // 中央揃え
          top: currentY
        }]);
        
        currentY += img.height + padding;
      }
    }
    
    // グループ情報テキストを追加（sharpでは直接テキスト追加できないため、
    // 実際の実装ではCanvasなどを使用する必要がある）
    
    // 出力
    await composite.toFile(outputPath);
    console.log(`統合画像を作成: ${outputPath}`);
    
    return true;
  } catch (error) {
    console.error('統合画像作成エラー:', error);
    return false;
  }
}

/**
 * 画像検索データを更新
 */
async function updateImageSearchData() {
  try {
    if (!fs.existsSync(IMAGE_SEARCH_DATA_PATH)) {
      console.log('画像検索データファイルが見つかりません。更新をスキップします。');
      return false;
    }
    
    console.log('画像検索データの更新を開始します...');
    
    // 現在の検索データを読み込み
    const fileContent = fs.readFileSync(IMAGE_SEARCH_DATA_PATH, 'utf8');
    let searchData = [];
    
    try {
      searchData = JSON.parse(fileContent);
    } catch (error) {
      console.error('画像検索データJSONパースエラー:', error);
      return false;
    }
    
    // グループ化された画像を取得
    const groupedImages = fs.readdirSync(KNOWLEDGE_GROUPS_DIR)
      .filter(filename => /\.(png|jpg|jpeg)$/i.test(filename));
    
    console.log(`検出されたグループ画像: ${groupedImages.length}個`);
    
    // 新しいグループ画像エントリを作成
    for (const groupFile of groupedImages) {
      const match = groupFile.match(/group_(\d+)_(\d+)/);
      if (!match) continue;
      
      const groupNumber = match[1];
      const timestamp = match[2];
      const groupId = `group_${groupNumber}_${timestamp}`;
      
      // 既に登録されているか確認
      const existingEntry = searchData.find(entry => entry.id === groupId);
      if (existingEntry) {
        console.log(`グループ画像 ${groupId} は既に登録されています。スキップします。`);
        continue;
      }
      
      // 基本的なキーワードセット
      const keywords = ['グループ画像', '関連部品', '複合図', 'アセンブリ'];
      
      // ファイル名からキーワード生成
      const nameComponents = groupFile.split(/[_\-\.]/);
      keywords.push(...nameComponents.filter(comp => comp.length > 2 && !/^\d+$/.test(comp)));
      
      // 重複を削除
      const uniqueKeywords = [...new Set(keywords)];
      
      // 新しいエントリを追加
      searchData.push({
        id: groupId,
        file: `/knowledge-base/images/groups/${groupFile}`,
        title: `グループ画像 ${groupNumber}`,
        category: '関連部品グループ',
        keywords: uniqueKeywords,
        description: '関連する複数の部品画像をまとめたグループ画像です。',
        searchText: uniqueKeywords.join(' ') + ' アセンブリ 保守用車 部品図'
      });
      
      console.log(`検索データに追加: ${groupId}`);
    }
    
    // 更新データを保存
    fs.writeFileSync(IMAGE_SEARCH_DATA_PATH, JSON.stringify(searchData, null, 2));
    console.log(`画像検索データを更新しました: ${groupedImages.length}件の新規エントリ`);
    
    return true;
  } catch (error) {
    console.error('画像検索データ更新エラー:', error);
    return false;
  }
}

// メイン処理
async function main() {
  console.log('関連画像グループ化スクリプトを開始します...');
  
  // 必要なディレクトリの確認
  ensureDirectoryExists(KNOWLEDGE_IMAGES_DIR);
  ensureDirectoryExists(KNOWLEDGE_GROUPS_DIR);
  ensureDirectoryExists(path.dirname(IMAGE_SEARCH_DATA_PATH));
  
  // 画像グループ化処理
  const result = await groupRelatedImages();
  
  if (result) {
    console.log('関連画像グループ化が正常に完了しました');
  } else {
    console.error('関連画像グループ化処理中にエラーが発生しました');
  }
}

// スクリプトが直接実行された場合に実行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  groupRelatedImages,
  findImageGroups,
  processImageGroups,
  createCompositeImage,
  updateImageSearchData
};