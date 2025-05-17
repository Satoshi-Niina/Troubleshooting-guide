
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

    // ファイルプレフィックスでグループ化
    const prefixGroups = new Map();
    
    for (const dir of docDirs) {
      // mc_1234567 または doc_1234567 形式のプレフィックスを抽出
      const prefix = dir.split('_').slice(0, 2).join('_');
      if (!prefix) continue;

      const chunksPath = path.join(DOCUMENTS_DIR, dir, 'chunks.json');
      if (!fs.existsSync(chunksPath)) continue;

      try {
        const content = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
        const timestamp = parseInt(dir.split('_')[2] || '0');
        
        if (!prefixGroups.has(prefix)) {
          prefixGroups.set(prefix, []);
        }
        prefixGroups.get(prefix).push({
          dir,
          timestamp,
          path: chunksPath,
          content
        });
      } catch (error) {
        console.error(`Error processing ${dir}:`, error);
      }
    }

    let removedCount = 0;
    
    // プレフィックスグループ内の重複を処理
    for (const [prefix, files] of prefixGroups.entries()) {
      if (files.length > 1) {
        console.log(`Processing group ${prefix} with ${files.length} files`);
        
        // タイムスタンプで並べ替え（新しい順）
        files.sort((a, b) => b.timestamp - a.timestamp);
        
        // 最新のファイルを基準にする
        const newest = files[0];
        console.log(`Newest file: ${newest.dir} (${newest.timestamp})`);
        
        // 最新以外のファイルをチェック
        for (let i = 1; i < files.length; i++) {
          const current = files[i];
          console.log(`Checking ${current.dir} (${current.timestamp})`);
          
          // ソースが同じ場合のみ削除
          if (current.content.metadata?.source === newest.content.metadata?.source) {
            const dirToRemove = path.join(DOCUMENTS_DIR, current.dir);
            try {
              fs.rmSync(dirToRemove, { recursive: true, force: true });
              console.log(`Removed duplicate directory: ${current.dir}`);
              removedCount++;
            } catch (error) {
              console.error(`Error removing ${dirToRemove}:`, error);
            }
          } else {
            console.log(`Keeping ${current.dir} (different source)`);
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
