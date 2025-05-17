
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const KNOWLEDGE_BASE_DIR = path.join(process.cwd(), 'knowledge-base');
const DOCUMENTS_DIR = path.join(KNOWLEDGE_BASE_DIR, 'documents');

async function calculateHash(content) {
  return crypto.createHash('md5').update(JSON.stringify(content)).digest('hex');
}

export async function cleanupKnowledgeBase() {
  try {
    // ドキュメントディレクトリ内のすべてのサブディレクトリを取得
    const docDirs = fs.readdirSync(DOCUMENTS_DIR)
      .filter(dir => fs.statSync(path.join(DOCUMENTS_DIR, dir)).isDirectory());

    // ハッシュでグループ化
    const contentHashes = new Map();
    
    for (const dir of docDirs) {
      const chunksPath = path.join(DOCUMENTS_DIR, dir, 'chunks.json');
      if (!fs.existsSync(chunksPath)) continue;

      try {
        const content = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
        const hash = await calculateHash(content);
        
        if (!contentHashes.has(hash)) {
          contentHashes.set(hash, []);
        }
        contentHashes.get(hash).push({
          dir,
          timestamp: parseInt(dir.split('_')[2] || '0'),
          path: chunksPath
        });
      } catch (error) {
        console.error(`Error processing ${dir}:`, error);
      }
    }

    let removedCount = 0;
    
    // 重複を処理
    for (const [hash, files] of contentHashes.entries()) {
      if (files.length > 1) {
        // タイムスタンプで並べ替え（新しい順）
        files.sort((a, b) => b.timestamp - a.timestamp);
        
        // 最新以外を削除
        for (let i = 1; i < files.length; i++) {
          const dirToRemove = path.join(DOCUMENTS_DIR, files[i].dir);
          try {
            fs.rmSync(dirToRemove, { recursive: true, force: true });
            console.log(`Removed duplicate directory: ${files[i].dir}`);
            removedCount++;
          } catch (error) {
            console.error(`Error removing ${dirToRemove}:`, error);
          }
        }
      }
    }

    console.log(`Cleanup completed. Removed ${removedCount} duplicate directories.`);
    return { removedCount };
  } catch (error) {
    console.error('Cleanup failed:', error);
    throw error;
  }
}

// スクリプトが直接実行された場合
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cleanupKnowledgeBase()
    .then(result => console.log(`Cleanup finished. Removed ${result.removedCount} duplicates.`))
    .catch(console.error);
}
