
import { scheduleJob } from 'node-cron';
import { cleanupKnowledgeBase } from './cleanup-knowledge-base.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, '../logs/cleanup.log');

// ログディレクトリが存在しない場合は作成
const logDir = dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ログ出力関数
function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}\n`;
  fs.appendFileSync(LOG_FILE, logMessage);
  console.log(logMessage.trim());
}

// クリーンアップ実行関数
async function runCleanup() {
  try {
    logToFile('定期クリーンアップを開始します');
    const result = await cleanupKnowledgeBase();
    logToFile(`クリーンアップ完了: ${result.removedCount}件の重複を削除しました`);
    return result;
  } catch (error) {
    logToFile(`クリーンアップエラー: ${error.message}`);
    throw error;
  }
}

// cronスケジュールの設定 (毎週月曜の午前3時に実行)
scheduleJob('0 3 * * 1', runCleanup);

logToFile('定期クリーンアップスケジューラーを開始しました');

// 初回実行のためのエントリーポイント
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCleanup();
}

export { runCleanup };
