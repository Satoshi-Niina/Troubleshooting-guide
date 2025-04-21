/**
 * SVG参照をPNG参照に変更してimage_search_data.jsonを更新するスクリプト
 * 全てのイメージデータをPNG形式に統一する
 */

const fs = require('fs');
const path = require('path');

// 設定
const IMAGE_SEARCH_DATA_PATH = path.join(__dirname, '../knowledge-base/data/image_search_data.json');
const IMAGES_DIR = path.join(__dirname, '../knowledge-base/images');

// 画像検索データを読み込む
async function updateImageSearchData() {
  console.log('画像検索データを更新中...');
  
  try {
    // JSONファイルが存在するか確認
    if (!fs.existsSync(IMAGE_SEARCH_DATA_PATH)) {
      console.error(`画像検索データファイルが見つかりません: ${IMAGE_SEARCH_DATA_PATH}`);
      return;
    }
    
    // データを読み込む
    let imageData = JSON.parse(fs.readFileSync(IMAGE_SEARCH_DATA_PATH, 'utf8'));
    console.log(`画像検索データを読み込みました: ${imageData.length}件`);
    
    // 実際に存在する画像ファイルを確認
    const existingFiles = fs.readdirSync(IMAGES_DIR)
      .filter(file => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'));
    
    console.log(`知識ベースの画像ディレクトリ内のファイル数: ${existingFiles.length}件`);
    
    // SVG参照をPNGに変換し、存在しないファイル参照を削除
    const updatedData = imageData.map(item => {
      // fileフィールドのSVG参照をPNGに変換
      if (item.file && item.file.endsWith('.svg')) {
        item.file = item.file.replace('.svg', '.png');
      }
      
      // 絶対パスに変換してファイル名だけ取得
      const filename = path.basename(item.file);
      
      // ファイルが存在するか確認
      const fileExists = existingFiles.some(file => file === filename);
      
      // 存在しない場合はフラグを設定（後で削除判断に使用）
      if (!fileExists) {
        item._fileNotExists = true;
      }
      
      // pngFallbackがあれば、それをfileに設定し、pngFallbackは削除
      if (item.pngFallback) {
        // SVG参照がある場合はPNG参照に変更
        if (!item._fileNotExists) {
          // pngFallbackのファイルが実際に存在する場合のみ
          const pngFilename = path.basename(item.pngFallback);
          if (existingFiles.some(file => file === pngFilename)) {
            item.file = item.pngFallback;
          }
        }
        // いずれにしてもpngFallbackは不要なので削除
        delete item.pngFallback;
      }
      
      return item;
    });
    
    // 存在しないファイル参照を持つアイテムを除外
    const filteredData = updatedData.filter(item => !item._fileNotExists);
    
    // 除外したアイテムの数
    const removedCount = updatedData.length - filteredData.length;
    console.log(`存在しないファイル参照を持つアイテムを除外: ${removedCount}件`);
    
    // _fileNotExistsフラグを削除
    filteredData.forEach(item => {
      if (item._fileNotExists) delete item._fileNotExists;
    });
    
    // 更新したデータを保存
    fs.writeFileSync(IMAGE_SEARCH_DATA_PATH, JSON.stringify(filteredData, null, 2), 'utf8');
    console.log(`画像検索データを更新しました: ${filteredData.length}件`);
    
    return filteredData.length;
  } catch (error) {
    console.error('画像検索データの更新中にエラーが発生しました:', error);
    return 0;
  }
}

// スクリプト実行
updateImageSearchData().then(count => {
  console.log(`処理完了: ${count}件のデータを更新しました`);
}).catch(err => {
  console.error('更新処理中にエラーが発生しました:', err);
  process.exit(1);
});