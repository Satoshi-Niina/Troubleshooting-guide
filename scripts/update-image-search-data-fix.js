/**
 * 画像検索データを修正するスクリプト
 * 実際に存在する画像ファイルを使用して画像検索データを更新します
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 現在のディレクトリ設定を取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ディレクトリのパス設定
const knowledgeBaseDir = path.join(path.resolve(__dirname, '..'), 'knowledge-base');
const knowledgeBaseImagesDir = path.join(knowledgeBaseDir, 'images');
const imageSearchDataPath = path.join(knowledgeBaseDir, 'data', 'image_search_data.json');

// カテゴリマッピング
const categoryMap = {
  'engine': 'エンジン',
  'cooling': '冷却系統',
  'brake': 'ブレーキ系統',
  'wheel': '車輪部品',
  'frame': '車体構造',
  'cabin': '運転室',
  'control': '制御系統',
  'electrical': '電気系統',
  'maintenance': '保守点検',
  'safety': '安全装置'
};

// キーワードマッピング
const keywordMap = {
  'engine': ['エンジン', 'モーター', '動力系', '駆動部'],
  'cooling': ['冷却', 'ラジエーター', '水冷', 'オーバーヒート'],
  'brake': ['ブレーキ', '制動装置', '制動系'],
  'wheel': ['ホイール', '車輪', 'タイヤ', '足回り'],
  'frame': ['フレーム', 'シャーシ', '車体', '構造'],
  'cabin': ['キャビン', '運転室', '操作パネル', '計器盤'],
  'control': ['制御', 'コントローラー', '操作系統'],
  'electrical': ['電気', '配線', 'バッテリー', '電源'],
  'maintenance': ['保守', '点検', 'メンテナンス'],
  'safety': ['安全', '防護', '警告装置']
};

async function updateImageSearchData() {
  try {
    console.log('画像検索データ更新プロセスを開始します...');
    
    // 既存のデータを読み込む（あれば）
    let existingData = [];
    try {
      if (fs.existsSync(imageSearchDataPath)) {
        const existingContent = fs.readFileSync(imageSearchDataPath, 'utf8');
        existingData = JSON.parse(existingContent);
        console.log(`既存の画像検索データを読み込みました: ${existingData.length}件`);
      }
    } catch (readError) {
      console.error('既存データ読み込みエラー:', readError);
      existingData = [];
    }
    
    // 画像ディレクトリをスキャンして実際に存在する画像ファイルを取得
    const imageFiles = fs.readdirSync(knowledgeBaseImagesDir)
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.svg'].includes(ext) && file !== 'image_index.json';
      });
    
    console.log(`知識ベースディレクトリから ${imageFiles.length} 件の画像ファイルを検出しました`);
    
    // 新しい画像検索データを作成
    const newSearchData = imageFiles.map((file, index) => {
      const fileBaseName = path.basename(file, path.extname(file));
      const filePath = `/knowledge-base/images/${file}`;
      
      // メタデータ生成
      let category = '保守用車マニュアル';
      let title = `保守用車画像 ${index + 1}`;
      let keywords = ['保守用車', 'マニュアル', '整備'];
      
      // ファイル名に基づいてカテゴリとキーワードを決定
      Object.keys(categoryMap).forEach(key => {
        if (fileBaseName.toLowerCase().includes(key)) {
          category = categoryMap[key];
          if (keywordMap[key]) {
            keywords = [...keywords, ...keywordMap[key]];
          }
        }
      });
      
      // スライド番号または画像番号を抽出
      const numMatch = fileBaseName.match(/_(\d+)$/);
      if (numMatch && numMatch[1]) {
        title = `${category} 図解 ${parseInt(numMatch[1])}`;
      }
      
      return {
        id: fileBaseName,
        file: filePath,
        title: title,
        category: category,
        keywords: keywords,
        description: `${category}に関する保守用車マニュアルの図解です。`,
        pngFallback: filePath
      };
    });
    
    console.log(`新しい画像検索データを生成しました: ${newSearchData.length}件`);
    
    // 新しいデータをファイルに書き込む
    if (!fs.existsSync(path.dirname(imageSearchDataPath))) {
      fs.mkdirSync(path.dirname(imageSearchDataPath), { recursive: true });
    }
    
    fs.writeFileSync(imageSearchDataPath, JSON.stringify(newSearchData, null, 2), 'utf8');
    console.log(`画像検索データをファイルに保存しました: ${imageSearchDataPath}`);
    
    return {
      success: true,
      count: newSearchData.length,
      message: '画像検索データを更新しました'
    };
  } catch (error) {
    console.error('画像検索データ更新エラー:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// スクリプトを実行
updateImageSearchData()
  .then(result => console.log('結果:', result))
  .catch(error => console.error('エラー:', error));