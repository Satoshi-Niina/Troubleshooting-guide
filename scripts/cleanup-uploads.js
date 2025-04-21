/**
 * 不要なuploadsディレクトリを削除するスクリプト
 * knowledge-base構造への一元化に伴い、重複した構造を整理
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirnameの代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 削除対象ディレクトリの定義
const DIRS_TO_REMOVE = [
  // ルートuploadsディレクトリを削除（データは既にknowledge-baseに移行済み）
  path.join(process.cwd(), 'uploads'),
  // public/uploadsのサブディレクトリ（/public/uploadsは残すが内部フォルダを整理）
  path.join(process.cwd(), 'public', 'uploads', 'data'),
  path.join(process.cwd(), 'public', 'uploads', 'json')
];

/**
 * ディレクトリを再帰的に削除する関数
 * @param {string} dirPath 削除するディレクトリのパス
 */
function removeDirectoryRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // 再帰的にディレクトリを削除
        removeDirectoryRecursive(curPath);
      } else {
        // ファイルを削除
        try {
          fs.unlinkSync(curPath);
          console.log(`ファイルを削除しました: ${curPath}`);
        } catch (err) {
          console.error(`ファイル削除エラー: ${curPath}`, err);
        }
      }
    });
    
    // 空になったディレクトリを削除
    try {
      fs.rmdirSync(dirPath);
      console.log(`ディレクトリを削除しました: ${dirPath}`);
    } catch (err) {
      console.error(`ディレクトリ削除エラー: ${dirPath}`, err);
    }
  } else {
    console.log(`ディレクトリが存在しません: ${dirPath}`);
  }
}

// スクリプト実行
(async function() {
  console.log('不要なディレクトリの削除を開始します...');
  
  // knowledge-baseにデータがあることを確認
  const knowledgeBaseDataDir = path.join(process.cwd(), 'knowledge-base', 'data');
  const knowledgeBaseImagesDir = path.join(process.cwd(), 'knowledge-base', 'images');
  const knowledgeBaseJsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
  
  // 重要なファイルの存在チェック
  const imageSearchDataPath = path.join(knowledgeBaseDataDir, 'image_search_data.json');
  
  if (!fs.existsSync(imageSearchDataPath)) {
    console.error('重要なファイル image_search_data.json がknowledge-baseに存在しません。');
    console.error('uploads構造を削除する前に、データを移行してください。');
    process.exit(1);
  }
  
  console.log('knowledge-baseにデータが存在することを確認しました。');
  
  // 削除処理を実行
  for (const dir of DIRS_TO_REMOVE) {
    console.log(`削除対象: ${dir}`);
    if (fs.existsSync(dir)) {
      try {
        removeDirectoryRecursive(dir);
      } catch (err) {
        console.error(`ディレクトリ削除中にエラーが発生しました: ${dir}`, err);
      }
    } else {
      console.log(`既に削除済み: ${dir}`);
    }
  }
  
  console.log('不要なディレクトリの削除が完了しました。');
})();