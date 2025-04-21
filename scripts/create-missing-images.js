/**
 * 存在しないイメージファイルのためのプレースホルダーを作成するスクリプト
 * image_search_data.jsonで参照されているが実際には存在しないファイルに対処します
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESモジュールでの__dirnameの代替手段
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ディレクトリパスの設定
const rootDir = process.cwd();
const knowledgeBaseDir = path.join(rootDir, 'knowledge-base');
const knowledgeBaseImagesDir = path.join(knowledgeBaseDir, 'images');
const knowledgeBaseDataPath = path.join(knowledgeBaseDir, 'data', 'image_search_data.json');

// プレースホルダー画像（最初の生成済み画像を使用）
const placeholderSvgPath = path.join(knowledgeBaseImagesDir, 'mc_1745226157492_img_001.svg');
const placeholderPngPath = path.join(knowledgeBaseImagesDir, 'mc_1745226157492_img_001.png');

// 画像検索データを読み込む
async function createMissingImages() {
  console.log('存在しない画像ファイルのプレースホルダーを作成します...');
  
  // 必要なディレクトリが存在することを確認
  if (!fs.existsSync(knowledgeBaseDataPath)) {
    console.error(`画像検索データが見つかりません: ${knowledgeBaseDataPath}`);
    return;
  }
  
  // プレースホルダー画像が存在することを確認
  if (!fs.existsSync(placeholderSvgPath) || !fs.existsSync(placeholderPngPath)) {
    console.error('プレースホルダー画像が見つかりません');
    console.log(`SVGパス: ${placeholderSvgPath}`);
    console.log(`PNGパス: ${placeholderPngPath}`);
    return;
  }
  
  try {
    // 画像検索データを読み込む
    const jsonData = JSON.parse(fs.readFileSync(knowledgeBaseDataPath, 'utf8'));
    console.log(`画像検索データを読み込みました: ${jsonData.length}件`);
    
    // SVGプレースホルダーとPNGプレースホルダーを読み込む
    const svgPlaceholder = fs.readFileSync(placeholderSvgPath);
    const pngPlaceholder = fs.readFileSync(placeholderPngPath);
    
    // 作成したファイルのカウント
    let createdSvgCount = 0;
    let createdPngCount = 0;
    
    // 各画像エントリを処理
    for (const imageData of jsonData) {
      // SVGファイルパスを処理
      if (imageData.file && imageData.file.startsWith('/knowledge-base/images/')) {
        const fileName = path.basename(imageData.file);
        const localFilePath = path.join(knowledgeBaseImagesDir, fileName);
        
        // ファイルが存在しない場合はプレースホルダーを作成
        if (!fs.existsSync(localFilePath)) {
          fs.writeFileSync(localFilePath, svgPlaceholder);
          console.log(`SVGプレースホルダーを作成: ${localFilePath}`);
          createdSvgCount++;
        }
      }
      
      // PNGフォールバックパスを処理
      if (imageData.pngFallback && imageData.pngFallback.startsWith('/knowledge-base/images/')) {
        const fileName = path.basename(imageData.pngFallback);
        const localFilePath = path.join(knowledgeBaseImagesDir, fileName);
        
        // ファイルが存在しない場合はプレースホルダーを作成
        if (!fs.existsSync(localFilePath)) {
          fs.writeFileSync(localFilePath, pngPlaceholder);
          console.log(`PNGプレースホルダーを作成: ${localFilePath}`);
          createdPngCount++;
        }
      }
    }
    
    console.log(`処理完了: ${createdSvgCount}件のSVGと${createdPngCount}件のPNGプレースホルダーを作成しました`);
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

// スクリプトの実行
createMissingImages().catch(console.error);