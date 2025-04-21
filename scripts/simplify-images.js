/**
 * 画像ファイル構造をシンプル化するスクリプト
 * SVGとPNGの両方が存在する場合、PNGのみを保持しimage_search_data.jsonを更新します
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
const tempBackupPath = path.join(knowledgeBaseDir, 'data', 'image_search_data.json.bak');

// 現在の日時をフォーマットした文字列を返す
function getFormattedDateTime() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-');
}

// 画像検索データを簡素化する
async function simplifyImageData() {
  console.log('画像形式をシンプル化（PNGのみに統一）します...');
  
  // 必要なディレクトリが存在することを確認
  if (!fs.existsSync(knowledgeBaseDataPath)) {
    console.error(`画像検索データが見つかりません: ${knowledgeBaseDataPath}`);
    return;
  }
  
  try {
    // 画像検索データを読み込む
    const jsonData = JSON.parse(fs.readFileSync(knowledgeBaseDataPath, 'utf8'));
    console.log(`画像検索データを読み込みました: ${jsonData.length}件`);
    
    // バックアップを作成
    fs.copyFileSync(knowledgeBaseDataPath, tempBackupPath);
    console.log(`バックアップを作成しました: ${tempBackupPath}`);
    
    // JSON構造を変更（PNGフォーマットのみを参照するように）
    let modifiedCount = 0;
    let removedSvgCount = 0;
    
    for (const imageData of jsonData) {
      if (imageData.file && imageData.pngFallback) {
        // SVGファイルのパスを取得
        const svgFilePath = imageData.file.startsWith('/') 
          ? path.join(rootDir, imageData.file.substring(1)) 
          : path.join(knowledgeBaseImagesDir, path.basename(imageData.file));
        
        // PNGファイルのパスを取得
        const pngFilePath = imageData.pngFallback.startsWith('/') 
          ? path.join(rootDir, imageData.pngFallback.substring(1)) 
          : path.join(knowledgeBaseImagesDir, path.basename(imageData.pngFallback));
        
        // fileフィールドをPNGを参照するように更新
        const oldFile = imageData.file;
        imageData.file = imageData.pngFallback;
        
        // svgPathフィールドを削除（あれば）
        if (imageData.svgPath) {
          delete imageData.svgPath;
        }
        
        // metadata.hasSvgVersionを更新
        if (imageData.metadata && imageData.metadata.hasSvgVersion !== undefined) {
          imageData.metadata.hasSvgVersion = false;
        }

        // fileTypeを更新
        if (imageData.metadata && imageData.metadata.fileType) {
          imageData.metadata.fileType = 'PNG';
        }
        
        console.log(`更新: ${oldFile} -> ${imageData.file}`);
        modifiedCount++;
        
        // SVGファイルが存在する場合は削除
        if (fs.existsSync(svgFilePath)) {
          try {
            fs.unlinkSync(svgFilePath);
            console.log(`SVGファイルを削除: ${svgFilePath}`);
            removedSvgCount++;
          } catch (removeErr) {
            console.error(`SVGファイル削除エラー: ${svgFilePath}`, removeErr);
          }
        }
      }
    }
    
    // 更新したJSONデータを保存
    fs.writeFileSync(knowledgeBaseDataPath, JSON.stringify(jsonData, null, 2));
    console.log(`処理完了: ${modifiedCount}件のエントリを更新し、${removedSvgCount}件のSVGファイルを削除しました`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    
    // エラーが起きた場合はバックアップから復元
    if (fs.existsSync(tempBackupPath)) {
      fs.copyFileSync(tempBackupPath, knowledgeBaseDataPath);
      console.log('エラーが発生したため、バックアップから復元しました');
    }
  } finally {
    // 処理が終了したらバックアップファイルを削除
    if (fs.existsSync(tempBackupPath)) {
      fs.unlinkSync(tempBackupPath);
    }
  }
}

// スクリプトの実行
simplifyImageData().catch(console.error);