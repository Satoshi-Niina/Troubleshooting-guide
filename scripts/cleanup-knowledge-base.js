
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
    const processedDirs = new Set();
    
    for (const [prefix, files] of prefixGroups.entries()) {
      console.log(`Processing group ${prefix} with ${files.length} files`);
      
      // すべてのファイルをチェック
      for (let i = 0; i < files.length; i++) {
        if (processedDirs.has(files[i].dir)) continue;
        
        console.log(`Checking file: ${files[i].dir}`);
        const currentContent = files[i].content;
        
        // 他のすべてのファイルと比較
        for (let j = 0; j < files.length; j++) {
          if (i === j || processedDirs.has(files[j].dir)) continue;
          
          const otherContent = files[j].content;
          
          // チャンク内容の類似性を確認
          let matchCount = 0;
          const minChunks = Math.min(currentContent.length, otherContent.length);
          
          for (let k = 0; k < minChunks; k++) {
            const currentChunk = JSON.stringify(currentContent[k]?.text || '');
            const otherChunk = JSON.stringify(otherContent[k]?.text || '');
            if (currentChunk === otherChunk && currentChunk !== '""') {
              matchCount++;
            }
          }
          
          console.log(`Comparing ${files[i].dir} with ${files[j].dir}:`);
          console.log(`- Match count: ${matchCount}/${minChunks} chunks`);
          
          // 50%以上のチャンクが一致する場合、古い方を削除
          if (matchCount >= Math.ceil(minChunks * 0.5)) {
            const [dirToKeep, dirToRemove] = files[i].timestamp > files[j].timestamp 
              ? [files[i].dir, files[j].dir]
              : [files[j].dir, files[i].dir];
              
            console.log(`Found duplicate: ${dirToRemove} will be removed (keeping ${dirToKeep})`);
            
            const pathToRemove = path.join(DOCUMENTS_DIR, dirToRemove);
            if (fs.existsSync(pathToRemove)) {
              fs.rmSync(pathToRemove, { recursive: true, force: true });
              console.log(`Removed duplicate directory: ${dirToRemove}`);
              removedCount++;
              processedDirs.add(dirToRemove);
            }
          }
        }
      }
          const current = files[i];
          console.log(`Checking ${current.dir} (${current.timestamp})`);
          
          // ソースとチャンク内容を確認
          const currentSource = current.content[0]?.metadata?.source;
          const newestSource = newest.content[0]?.metadata?.source;
          
          // チャンクの内容を比較（先頭3チャンクまで）
          const chunksToCompare = Math.min(3, current.content.length, newest.content.length);
          let contentMatches = 0;
          
          for (let i = 0; i < chunksToCompare; i++) {
            const currentChunk = JSON.stringify(current.content[i]?.text || '');
            const newestChunk = JSON.stringify(newest.content[i]?.text || '');
            if (currentChunk === newestChunk && currentChunk !== '""') {
              contentMatches++;
            }
          }
          
          console.log(`Comparing directory ${current.dir}:`);
          console.log(`- Source: ${currentSource} vs ${newestSource}`);
          console.log(`- Content matches: ${contentMatches}/${chunksToCompare} chunks`);
          
          // ソースが一致するか、50%以上のチャンクが一致する場合に削除
          if ((currentSource && newestSource && currentSource === newestSource) ||
              (contentMatches >= Math.ceil(chunksToCompare / 2))) {
            const dirToRemove = path.join(DOCUMENTS_DIR, current.dir);
            try {
              if (fs.existsSync(dirToRemove)) {
                fs.rmSync(dirToRemove, { recursive: true, force: true });
                console.log(`Removed duplicate directory: ${current.dir}`);
                removedCount++;
              } else {
                console.log(`Directory does not exist: ${dirToRemove}`);
              }
            } catch (error) {
              console.error(`Error removing ${dirToRemove}:`, error);
            }
          } else {
            console.log(`Keeping ${current.dir} (different source: ${currentSource})`);
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
