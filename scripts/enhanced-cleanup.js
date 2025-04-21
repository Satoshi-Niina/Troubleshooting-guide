/**
 * 拡張版クリーンアップスクリプト
 * public/uploadsとuploadsディレクトリを一時ファイル処理用にクリーンアップ
 * knwoledge-baseに移動したファイルは一時ディレクトリから削除する
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// FSプロミス版
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);
const exists = promisify(fs.exists);

// 定数
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const PUBLIC_UPLOADS_DIR = path.join(__dirname, '../public/uploads');
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../knowledge-base');
const KNOWLEDGE_IMAGES_DIR = path.join(KNOWLEDGE_BASE_DIR, 'images');
const KNOWLEDGE_DATA_DIR = path.join(KNOWLEDGE_BASE_DIR, 'data');
const KNOWLEDGE_JSON_DIR = path.join(KNOWLEDGE_BASE_DIR, 'json');

// 一時ディレクトリの作成と確認
async function ensureDirectoriesExist() {
  const dirs = [
    UPLOADS_DIR,
    PUBLIC_UPLOADS_DIR,
    path.join(PUBLIC_UPLOADS_DIR, 'images'),
    path.join(UPLOADS_DIR, 'images'),
    path.join(UPLOADS_DIR, 'temp')
  ];
  
  for (const dir of dirs) {
    if (!await exists(dir)) {
      console.log(`ディレクトリを作成します: ${dir}`);
      await mkdir(dir, { recursive: true });
    }
  }
}

// 指定したディレクトリのファイルとサブディレクトリを再帰的に削除
async function removeDirectoryContents(dirPath, excludeDirs = []) {
  if (!await exists(dirPath)) {
    console.log(`ディレクトリが存在しません: ${dirPath}`);
    return;
  }

  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    // 除外ディレクトリの場合はスキップ
    if (excludeDirs.includes(entry.name)) {
      console.log(`除外ディレクトリのためスキップします: ${fullPath}`);
      continue;
    }

    if (entry.isDirectory()) {
      // サブディレクトリを再帰的に削除
      await removeDirectoryContents(fullPath);
      
      try {
        // 空になったディレクトリを削除
        await rmdir(fullPath);
        console.log(`ディレクトリを削除しました: ${fullPath}`);
      } catch (error) {
        console.error(`ディレクトリの削除に失敗しました: ${fullPath}`, error.message);
      }
    } else {
      // ファイルを削除
      try {
        await unlink(fullPath);
        console.log(`ファイルを削除しました: ${fullPath}`);
      } catch (error) {
        console.error(`ファイルの削除に失敗しました: ${fullPath}`, error.message);
      }
    }
  }
}

// knowledge-baseに存在するファイルと同名のファイルを一時ディレクトリから削除
async function removeRedundantFiles() {
  // knowledge-base/imagesのファイル一覧を取得
  const knowledgeImages = await readdir(KNOWLEDGE_IMAGES_DIR);
  
  // フォルダを確認
  const dirsToCheck = [
    path.join(PUBLIC_UPLOADS_DIR, 'images'),
    path.join(UPLOADS_DIR, 'images')
  ];
  
  let removedCount = 0;
  
  // 各アップロードディレクトリをチェック
  for (const dir of dirsToCheck) {
    if (!await exists(dir)) continue;
    
    const files = await readdir(dir);
    
    for (const file of files) {
      // knowledge-baseに同名のファイルが存在する場合
      if (knowledgeImages.includes(file)) {
        try {
          await unlink(path.join(dir, file));
          console.log(`重複ファイルを削除しました: ${path.join(dir, file)}`);
          removedCount++;
        } catch (error) {
          console.error(`ファイル削除エラー: ${path.join(dir, file)}`, error.message);
        }
      }
    }
  }
  
  return removedCount;
}

// メイン処理
async function main() {
  console.log('拡張クリーンアップを開始します...');
  
  try {
    // ディレクトリの存在を確認・作成
    await ensureDirectoriesExist();
    
    // knowledge-baseに移動済みのファイルを削除
    const removedCount = await removeRedundantFiles();
    console.log(`重複ファイル削除数: ${removedCount}`);
    
    console.log('クリーンアップが完了しました');
  } catch (error) {
    console.error('クリーンアップ処理中にエラーが発生しました:', error);
  }
}

// スクリプト実行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  ensureDirectoriesExist,
  removeDirectoryContents,
  removeRedundantFiles
};