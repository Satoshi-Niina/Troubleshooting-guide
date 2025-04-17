import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JSONファイルのパス
const jsonFilePath = path.join(process.cwd(), 'knowledge-base', 'data', 'image_search_data.json');
const imagesDir = path.join(process.cwd(), 'knowledge-base', 'images');

// JSONファイルを読み込む
const imageSearchData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

// 更新されたアイテムのカウント
let updatedItems = 0;
let missingFiles = 0;

// SVGファイルが存在しない場合はPNGファイルを使用するように修正
imageSearchData.forEach(item => {
  if (item.file && item.file.toLowerCase().endsWith('.svg')) {
    // ファイル名を取得
    const fileName = item.file.split('/').pop();
    const filePath = path.join(imagesDir, fileName);
    
    // SVGファイルが存在しない場合、PNGファイルにパスを変更
    if (!fs.existsSync(filePath)) {
      missingFiles++;
      
      // PNGファイルのパスを構築
      const pngFileName = fileName.replace('.svg', '.png');
      const pngFilePath = path.join(imagesDir, pngFileName);
      
      if (fs.existsSync(pngFilePath)) {
        // PNGファイルが存在する場合、ファイルパスをPNGに更新
        item.file = item.file.replace('.svg', '.png');
        updatedItems++;
        console.log(`Updated: ${fileName} -> ${pngFileName}`);
      } else {
        console.log(`Warning: Neither SVG nor PNG exists for ${fileName}`);
      }
    }
  }
});

// 更新したJSONを書き戻す
fs.writeFileSync(jsonFilePath, JSON.stringify(imageSearchData, null, 2));
console.log(`Processed ${imageSearchData.length} items.`);
console.log(`Found ${missingFiles} missing SVG files.`);
console.log(`Updated ${updatedItems} items to use PNG files.`);

// アップロードディレクトリのJSONも更新
const publicJsonFilePath = path.join(process.cwd(), 'public', 'uploads', 'data', 'image_search_data.json');
if (fs.existsSync(path.dirname(publicJsonFilePath))) {
  fs.writeFileSync(publicJsonFilePath, JSON.stringify(imageSearchData, null, 2));
  console.log(`Also updated public uploads JSON file.`);
}