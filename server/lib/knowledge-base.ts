import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  processDocument, 
  ProcessedDocument, 
  DocumentChunk,
  chunkText
} from './document-processor';
import { storage } from '../storage';
import AdmZip from 'adm-zip';

// ESM環境で__dirnameを再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 知識ベースのフォルダ構造定義
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../../knowledge-base');
const KNOWLEDGE_DOCUMENTS_DIR = path.join(KNOWLEDGE_BASE_DIR, 'documents');
const KNOWLEDGE_IMAGES_DIR = path.join(KNOWLEDGE_BASE_DIR, 'images');
const KNOWLEDGE_THUMBNAILS_DIR = path.join(KNOWLEDGE_BASE_DIR, 'images/thumbnails');

// インデックスファイル
const KNOWLEDGE_INDEX_FILE = path.join(KNOWLEDGE_BASE_DIR, 'index.json');
const KNOWLEDGE_IMAGE_INDEX_FILE = path.join(KNOWLEDGE_IMAGES_DIR, 'image_index.json');

// ディレクトリ確認関数
function ensureDirectoryExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

// 知識ベースのインデックス構造
interface KnowledgeBaseIndex {
  documents: {
    id: string;
    title: string;
    path: string;
    type: string;
    chunkCount: number;
    addedAt: string;
  }[];
}

/**
 * 知識ベースディレクトリを初期化する
 */
export function initializeKnowledgeBase(): void {
  // 必要なすべてのディレクトリを作成
  ensureDirectoryExists(KNOWLEDGE_BASE_DIR);
  ensureDirectoryExists(KNOWLEDGE_DOCUMENTS_DIR);
  ensureDirectoryExists(KNOWLEDGE_IMAGES_DIR);
  ensureDirectoryExists(KNOWLEDGE_THUMBNAILS_DIR);
  
  console.log(`Knowledge base directories initialized`);

  // メインインデックスファイルが存在しない場合は作成
  if (!fs.existsSync(KNOWLEDGE_INDEX_FILE)) {
    const emptyIndex: KnowledgeBaseIndex = { documents: [] };
    fs.writeFileSync(KNOWLEDGE_INDEX_FILE, JSON.stringify(emptyIndex, null, 2));
    console.log(`Created knowledge base index at ${KNOWLEDGE_INDEX_FILE}`);
  }
  
  // 画像インデックスファイルが存在しない場合は作成
  if (!fs.existsSync(KNOWLEDGE_IMAGE_INDEX_FILE)) {
    const emptyImageIndex = { images: [] };
    fs.writeFileSync(KNOWLEDGE_IMAGE_INDEX_FILE, JSON.stringify(emptyImageIndex, null, 2));
    console.log(`Created image index at ${KNOWLEDGE_IMAGE_INDEX_FILE}`);
  }
}

/**
 * 知識ベースインデックスを読み込む
 */
export function loadKnowledgeBaseIndex(): KnowledgeBaseIndex {
  try {
    if (fs.existsSync(KNOWLEDGE_INDEX_FILE)) {
      const indexData = fs.readFileSync(KNOWLEDGE_INDEX_FILE, 'utf8');
      const parsedData = JSON.parse(indexData);
      
      // documents配列が存在することを確認
      if (!parsedData.documents) {
        parsedData.documents = [];
      }
      
      return parsedData;
    }
    return { documents: [] };
  } catch (err) {
    console.error('Error loading knowledge base index:', err);
    return { documents: [] };
  }
}

/**
 * 知識ベースインデックスを保存する
 */
export function saveKnowledgeBaseIndex(index: KnowledgeBaseIndex): void {
  try {
    fs.writeFileSync(KNOWLEDGE_INDEX_FILE, JSON.stringify(index, null, 2));
  } catch (err) {
    console.error('Error saving knowledge base index:', err);
  }
}

/**
 * ドキュメントを知識ベースに追加する
 * @param filePath 追加するファイルのパス
 */
export async function addDocumentToKnowledgeBase(filePath: string): Promise<string> {
  try {
    console.log(`知識ベースにドキュメント追加開始: ${filePath}`);
    
    // 知識ベースを初期化
    initializeKnowledgeBase();
    
    // ファイル名を取得して表示（デコード済みの正しい日本語ファイル名）
    const fileBuffer = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);
    let fileName = path.basename(filePath);
    
    // ファイル名がUTF-8で正しくデコードされているか確認
    // 文字化けしている場合は修正を試みる
    if (/å|æ|ç|ã/.test(fileName)) {
      try {
        // ファイルパスの最後の部分だけをlatin1からUTF-8に再デコード
        fileName = Buffer.from(path.basename(filePath), 'latin1').toString('utf8');
        console.log(`ファイル名をUTF-8にデコード: ${fileName}`);
      } catch (e) {
        console.error(`ファイル名のデコードに失敗: ${e}`);
      }
    }
    
    console.log(`処理対象ファイル名: ${fileName}`);
    
    // ユニークなIDを生成
    const docId = `doc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    console.log(`生成したドキュメントID: ${docId}`);
    
    // ドキュメント用ディレクトリ作成
    const docDir = path.join(KNOWLEDGE_BASE_DIR, docId);
    if (!fs.existsSync(docDir)) {
      fs.mkdirSync(docDir, { recursive: true });
    }
    console.log(`ドキュメントディレクトリ作成: ${docDir}`);
    
    // 元ファイルをドキュメントディレクトリにコピー
    const destPath = path.join(docDir, fileName);
    fs.copyFileSync(filePath, destPath);
    console.log(`ファイルコピー完了: ${destPath}`);
    
    // ドキュメントを処理
    console.log(`ドキュメント処理を開始: ${filePath}`);
    let processedDoc: ProcessedDocument;
    
    try {
      processedDoc = await processDocument(filePath);
      console.log(`ドキュメント処理完了: ${processedDoc.chunks.length}個のチャンクを生成`);
    } catch (procError) {
      console.error('ドキュメント処理中にエラー発生:', procError);
      
      // エラーが発生した場合でも処理を続行するための最小限のデータ構造
      processedDoc = {
        chunks: [{
          text: `${fileName}の内容`,
          metadata: {
            source: fileName,
            chunkNumber: 0
          }
        }],
        metadata: {
          title: fileName,
          source: filePath,
          type: path.extname(filePath).toLowerCase().substring(1),
          wordCount: 0,
          createdAt: new Date()
        }
      };
      console.log('エラー後の最小限のドキュメント構造を作成しました');
    }
    
    // ドキュメントをDBに保存（あるいはローカルファイルシステムに）
    try {
      await storeProcessedDocument(docId, processedDoc);
      console.log(`処理済みドキュメントを保存完了: ${docId}`);
    } catch (storeError) {
      console.error('ドキュメント保存中にエラー発生:', storeError);
    }
    
    // インデックスを更新
    const index = loadKnowledgeBaseIndex();
    index.documents.push({
      id: docId,
      title: processedDoc.metadata.title,
      path: destPath, // 更新：コピー先のパスを使用
      type: processedDoc.metadata.type,
      chunkCount: processedDoc.chunks.length,
      addedAt: new Date().toISOString()
    });
    saveKnowledgeBaseIndex(index);
    console.log('知識ベースインデックスを更新しました');
    
    // PowerPointファイルの場合は特別なメッセージを表示
    const fileExt = path.extname(filePath).toLowerCase();
    if (fileExt === '.pptx' || fileExt === '.ppt') {
      console.log(`PowerPointファイルが正常に処理されました。画像データも生成されています。`);
    }
    
    console.log(`ドキュメント "${fileName}" が知識ベースに追加されました。ID: ${docId}`);
    
    return docId;
  } catch (err: any) {
    console.error('知識ベースへのドキュメント追加エラー:', err);
    throw new Error(`知識ベースへの追加に失敗しました: ${err.message}`);
  }
}

/**
 * 処理済みドキュメントを保存する
 * @param docId ドキュメントID
 * @param doc 処理済みドキュメント
 */
async function storeProcessedDocument(docId: string, doc: ProcessedDocument): Promise<void> {
  // 新しいフォルダ構造でドキュメントを保存
  const docDir = path.join(KNOWLEDGE_DOCUMENTS_DIR, docId);
  
  // ドキュメントディレクトリを作成
  ensureDirectoryExists(docDir);
  
  // 抽出された画像があれば保存するディレクトリ
  const assetsDir = path.join(docDir, 'assets');
  ensureDirectoryExists(assetsDir);
  
  console.log(`処理済みドキュメントを保存: ${docId}`);
  
  // メタデータファイルを保存
  fs.writeFileSync(
    path.join(docDir, 'metadata.json'), 
    JSON.stringify(doc.metadata, null, 2)
  );
  
  // Q&Aデータ用のディレクトリ
  const qaDir = path.join(docDir, 'qa');
  ensureDirectoryExists(qaDir);
  
  // Q&Aデータを生成して保存
  try {
    const fullText = doc.chunks.map(chunk => chunk.text).join("\n");
    console.log(`Q&A生成用のテキスト: ${fullText.length}文字`);
    
    // OpenAIを使用してQ&Aペアを生成
    // OpenAIモジュールをインポート
    const openaiModule = await import('./openai');
    
    // Q&Aペアを生成（最大10個）
    const qaPairs = await openaiModule.generateQAPairs(fullText, 10);
    console.log(`${qaPairs.length}個のQ&Aペアを生成しました`);
    
    // Q&AペアをJSONファイルとして保存
    fs.writeFileSync(
      path.join(qaDir, 'qa_pairs.json'),
      JSON.stringify(qaPairs, null, 2)
    );
    console.log('Q&Aデータを保存しました');
    
    // チャンク用に1ファイルずつQ&Aも保存
    qaPairs.forEach((qa, index) => {
      const qaFileName = `qa_${index + 1}.json`;
      fs.writeFileSync(
        path.join(qaDir, qaFileName),
        JSON.stringify(qa, null, 2)
      );
    });
  } catch (qaError) {
    console.error('Q&A生成エラー:', qaError);
    // Q&A生成が失敗しても処理は続行
  }
  
  // チャンクをJSONファイルとして保存
  fs.writeFileSync(
    path.join(docDir, 'chunks.json'),
    JSON.stringify(doc.chunks, null, 2)
  );
  
  // ドキュメントから抽出された画像があれば、画像インデックスに登録
  // 複数の可能性のあるソースディレクトリから画像を収集
  const imageSourcePaths = [
    path.join(process.cwd(), 'public', 'uploads', 'images'),
    path.join(process.cwd(), 'uploads', 'images'),
    path.join(process.cwd(), 'public', 'images')
  ];
  
  // ファイル名とソースパスの情報を含む配列の型を定義
  interface ImageFileInfo {
    file: string;
    sourcePath: string;
  }
  
  const allImageFiles: ImageFileInfo[] = [];
  
  // 各ソースディレクトリから画像を収集
  for (const imageContentPath of imageSourcePaths) {
    if (fs.existsSync(imageContentPath)) {
      console.log(`画像ソースディレクトリを確認中: ${imageContentPath}`);
      try {
        const filesInDir = fs.readdirSync(imageContentPath);
        console.log(`ディレクトリ内のファイル数: ${filesInDir.length}`);
        
        // ドキュメントIDまたはタイトルに関連する画像をフィルタリング
        const relevantFiles = filesInDir.filter(file => 
          file.startsWith(docId) || 
          (doc.metadata.title && file.toLowerCase().includes(doc.metadata.title.toLowerCase().substring(0, 5))) ||
          file.includes(doc.metadata.source?.split('.')[0] || '')
        );
        
        console.log(`関連画像ファイル: ${relevantFiles.length}件`);
        
        // 適切な型の配列に変換して追加
        const fileInfos: ImageFileInfo[] = relevantFiles.map(file => ({
          file,
          sourcePath: imageContentPath
        }));
        
        allImageFiles.push(...fileInfos);
      } catch (err) {
        console.error(`ディレクトリ読み取りエラー (${imageContentPath}):`, err);
      }
    }
  }
  
  // 画像ファイルが見つかった場合、それらをナレッジベースディレクトリにコピー
  if (allImageFiles.length > 0) {
    console.log(`ドキュメントから抽出された画像: 合計${allImageFiles.length}件`);
    
    // ナレッジベース画像ディレクトリが存在することを確認
    ensureDirectoryExists(KNOWLEDGE_IMAGES_DIR);
    ensureDirectoryExists(KNOWLEDGE_THUMBNAILS_DIR);
    
    // 重複を避けるためにファイル名のセットを作成
    const processedFiles = new Set<string>();
    const successfullyProcessedFiles: string[] = [];
    
    // 画像をナレッジベース画像ディレクトリにコピー
    for (const { file, sourcePath } of allImageFiles) {
      // 既に処理済みのファイルはスキップ
      if (processedFiles.has(file)) continue;
      processedFiles.add(file);
      
      const srcPath = path.join(sourcePath, file);
      const destPath = path.join(KNOWLEDGE_IMAGES_DIR, file);
      
      try {
        // 元のファイルが存在するか確認
        if (!fs.existsSync(srcPath)) {
          console.warn(`ソース画像ファイルが見つかりません: ${srcPath}`);
          continue;
        }
        
        // コピー先に既にファイルが存在するか確認
        if (fs.existsSync(destPath)) {
          console.log(`画像は既にナレッジベースに存在します: ${file}`);
        } else {
          // 画像をコピー
          fs.copyFileSync(srcPath, destPath);
          console.log(`画像をナレッジベースにコピーしました: ${file}`);
          
          // PNGがコピーできたら対応するSVGも探してコピー（またはその逆）
          if (file.endsWith('.png')) {
            const svgFile = file.replace('.png', '.svg');
            const svgSrcPath = path.join(sourcePath, svgFile);
            const svgDestPath = path.join(KNOWLEDGE_IMAGES_DIR, svgFile);
            
            if (fs.existsSync(svgSrcPath) && !fs.existsSync(svgDestPath)) {
              fs.copyFileSync(svgSrcPath, svgDestPath);
              console.log(`対応するSVG画像もコピーしました: ${svgFile}`);
            }
          } else if (file.endsWith('.svg')) {
            const pngFile = file.replace('.svg', '.png');
            const pngSrcPath = path.join(sourcePath, pngFile);
            const pngDestPath = path.join(KNOWLEDGE_IMAGES_DIR, pngFile);
            
            if (fs.existsSync(pngSrcPath) && !fs.existsSync(pngDestPath)) {
              fs.copyFileSync(pngSrcPath, pngDestPath);
              console.log(`対応するPNG画像もコピーしました: ${pngFile}`);
            }
          }
        }
        
        // 処理成功した画像を記録
        successfullyProcessedFiles.push(file);
      } catch (err) {
        console.error(`画像コピーエラー (${file}):`, err);
      }
    }
    
    // 画像インデックスを更新（正常に処理された画像のみ）
    if (successfullyProcessedFiles.length > 0) {
      updateImageIndex(docId, doc, successfullyProcessedFiles);
    }
  } else {
    console.log(`このドキュメントに関連する画像は見つかりませんでした: ${docId}`);
  }
  
  // 各チャンクをDBに保存（オプション）
  try {
    // documentIdをPostgreSQLのinteger範囲内（2147483647まで）に収める
    // タイムスタンプから適切なサイズのIDを生成
    const timestamp = new Date().getTime();
    const safeId = Math.floor(timestamp % 1000000); // 6桁の数値に制限
    
    console.log(`キーワード保存用のsafeId生成: ${safeId} (元のdocId: ${docId})`);
    
    // 最初の数チャンクだけをキーワードとして保存（多すぎるとパフォーマンス問題を引き起こす）
    const chunkLimit = 5;
    const chunksToSave = doc.chunks.slice(0, chunkLimit);
    
    for (const chunk of chunksToSave) {
      await storage.createKeyword({
        documentId: safeId, // PostgreSQLのinteger範囲内の値を使用
        word: chunk.text.substring(0, 200), // キーワードフィールドの長さ制限に注意
      });
    }
    
    console.log(`${chunksToSave.length}個のキーワードをDBに保存しました`);
  } catch (err) {
    console.error('キーワード保存エラー:', err);
    // キーワード保存エラーは処理を続行
  }
}

/**
 * 画像インデックスを更新する補助関数
 */
function updateImageIndex(docId: string, doc: ProcessedDocument, imageFiles: string[]): void {
  try {
    // 画像インデックスを読み込み
    let imageIndex = { images: [] as any[] };
    
    if (fs.existsSync(KNOWLEDGE_IMAGE_INDEX_FILE)) {
      const indexData = fs.readFileSync(KNOWLEDGE_IMAGE_INDEX_FILE, 'utf8');
      try {
        imageIndex = JSON.parse(indexData);
      } catch (jsonErr) {
        console.error('画像インデックスJSONパースエラー:', jsonErr);
      }
    }
    
    // 各画像をインデックスに追加
    for (const imgFile of imageFiles) {
      const imgPath = path.join(KNOWLEDGE_IMAGES_DIR, imgFile);
      const imgUrl = `/knowledge-base/images/${imgFile}`;
      
      // 既存の画像を確認
      const existingIndex = imageIndex.images.findIndex(img => img.path === imgPath || img.url === imgUrl);
      
      const imgData = {
        id: `img_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        path: imgPath,
        url: imgUrl,
        title: `${doc.metadata.title}の画像`,
        documentId: docId,
        source: doc.metadata.source,
        createdAt: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        // 既存の場合は更新
        imageIndex.images[existingIndex] = {
          ...imageIndex.images[existingIndex],
          ...imgData
        };
      } else {
        // 新規の場合は追加
        imageIndex.images.push(imgData);
      }
    }
    
    // 更新したインデックスを保存
    fs.writeFileSync(KNOWLEDGE_IMAGE_INDEX_FILE, JSON.stringify(imageIndex, null, 2));
    console.log(`画像インデックスを更新: ${imageIndex.images.length}件`);
    
  } catch (err) {
    console.error('画像インデックス更新エラー:', err);
  }
}

/**
 * クエリに関連する知識ベースのチャンクを検索
 * @param query 検索クエリ
 * @returns 関連するチャンク
 */
export async function searchKnowledgeBase(query: string): Promise<DocumentChunk[]> {
  try {
    console.log(`検索クエリ: "${query}"`);
    
    // 知識ベースを初期化
    initializeKnowledgeBase();
    
    // クエリが空や極端に短い場合はデフォルトの緊急処置情報を検索
    if (!query || query.trim().length < 2) {
      query = "保守用車 応急処置";
      console.log(`クエリが短すぎるため、デフォルトクエリに変更: "${query}"`);
    }
    
    // エンジン関連の特別処理
    if (query.toLowerCase().includes('エンジン')) {
      query = "エンジン 構造 保守用車 トラブル";
      console.log(`"エンジン"クエリのため、拡張クエリに変更: "${query}"`);
    }
    
    // インデックスを読み込み
    const index = loadKnowledgeBaseIndex();
    console.log(`インデックス内のドキュメント数: ${index.documents.length}`);
    
    // 検索結果を格納する配列
    const relevantChunks: DocumentChunk[] = [];
    
    // トラブルシューティングデータの読み込み(JSON)を試みる
    try {
      const troubleshootingPath = path.join(KNOWLEDGE_BASE_DIR, 'troubleshooting');
      if (fs.existsSync(troubleshootingPath)) {
        const files = fs.readdirSync(troubleshootingPath).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const filePath = path.join(troubleshootingPath, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(content);
          // トラブルシューティングデータを関連チャンクに変換
          const chunk: DocumentChunk = {
            text: `トラブルシューティング: ${data.title}\n${data.description || ''}\n${JSON.stringify(data.steps)}`,
            metadata: {
              source: file,
              chunkNumber: 0
            }
          };
          relevantChunks.push(chunk);
        }
        console.log(`トラブルシューティングデータを追加: ${files.length}件`);
      }
    } catch (err) {
      console.error('トラブルシューティングデータ読み込みエラー:', err);
    }
    
    // すべてのドキュメントを検索
    for (const docInfo of index.documents) {
      console.log(`ドキュメント検索: ${docInfo.title} (ID: ${docInfo.id})`);
      
      // 新しいフォルダ構造でのドキュメントディレクトリ
      const docDir = path.join(KNOWLEDGE_DOCUMENTS_DIR, docInfo.id);
      
      // 旧パスで検索（互換性のため）
      const oldDocDir = path.join(KNOWLEDGE_BASE_DIR, docInfo.id);
      
      // チャンクファイルが存在する場合は読み込む
      let chunksFile = path.join(docDir, 'chunks.json');
      
      // 新しいパスにファイルがなければ、旧パスを試す
      if (!fs.existsSync(chunksFile) && fs.existsSync(oldDocDir)) {
        chunksFile = path.join(oldDocDir, 'chunks.json');
      }
      
      if (fs.existsSync(chunksFile)) {
        console.log(`チャンクファイル発見: ${chunksFile}`);
        const chunks: DocumentChunk[] = JSON.parse(fs.readFileSync(chunksFile, 'utf8'));
        
        // 単純なキーワードマッチング（本来はベクトル検索やより高度な方法を使用）
        const matchingChunks = chunks.filter(chunk => 
          chunk.text.toLowerCase().includes(query.toLowerCase())
        );
        
        console.log(`マッチしたチャンク数: ${matchingChunks.length}`);
        relevantChunks.push(...matchingChunks);
      } else {
        // チャンクファイルが存在しない場合は、オリジナルのファイルを直接検索
        console.log(`チャンクファイルが見つからないため、オリジナルファイルを検索: ${docInfo.path}`);
        if (fs.existsSync(docInfo.path)) {
          try {
            const fileContent = fs.readFileSync(docInfo.path, 'utf8');
            
            // テキストをチャンクに分割
            const textChunks = chunkText(fileContent, { source: docInfo.title });
            console.log(`作成されたチャンク数: ${textChunks.length}`);
            
            // クエリでフィルタリング（より高度な検索を実装）
            const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
            console.log(`検索キーワード分割: ${queryTerms.join(', ')}`);
            
            // 各チャンクのスコアを計算
            const scoredChunks = textChunks.map((chunk: DocumentChunk) => {
              const chunkText = chunk.text.toLowerCase();
              let score = 0;
              
              // 単一キーワード検索の強化対応
              if (queryTerms.length === 1 && query.length >= 2) {
                // 「エンジン」などの単一キーワード検索の場合は特別な処理
                const singleKeyword = query.toLowerCase();
                
                // 単語の完全一致（「エンジン」と「エンジン」）
                if (chunkText.includes(singleKeyword)) {
                  score += 10; // 単一キーワードの完全一致は最も重要
                  
                  // 重要キーワードの特別ボーナス
                  if (singleKeyword === 'エンジン' || 
                      singleKeyword === 'フレーム' || 
                      singleKeyword === 'キャビン' || 
                      singleKeyword === '運転室' || 
                      singleKeyword === 'ドア' ||
                      singleKeyword === '幅' ||
                      singleKeyword === '扉') {
                    score += 5; // 特に重要なキーワードならさらにボーナススコア
                    
                    // ドアや幅に関する検索をさらに強化
                    if (singleKeyword === 'ドア' || singleKeyword === '扉' || singleKeyword === '幅') {
                      // 特にドアの寸法に関連する数値を含むチャンクを優先
                      if (chunkText.includes('mm') || chunkText.includes('センチ') || 
                          /\d+(\.\d+)?(mm|cm|m)/.test(chunkText)) {
                        score += 8; // 寸法情報を含む場合は大幅ボーナス
                      }
                    }
                  }
                }
                
                // 単語の部分一致（「エンジン」と「メインエンジン」）
                const keywordMatches = (chunkText.match(new RegExp(singleKeyword, 'g')) || []).length;
                if (keywordMatches > 0) {
                  score += keywordMatches * 2;
                }
              } else {
                // 通常の複数キーワード検索の場合
                // 各検索語について、含まれている場合はスコアを加算
                for (const term of queryTerms) {
                  if (chunkText.includes(term)) {
                    // 完全一致の場合は高いスコア
                    score += 3;
                  }
                }
                
                // クエリ全体が含まれている場合は特に高いスコア
                if (chunkText.includes(query.toLowerCase())) {
                  score += 5;
                }
              }
              
              return { chunk, score };
            });
            
            // スコアでソートし、閾値以上のチャンクのみ選択
            const matchingChunks = scoredChunks
              .filter(item => item.score > 0)
              .sort((a, b) => b.score - a.score)
              .map(item => item.chunk);
              
            console.log(`スコアリング後のマッチチャンク数: ${matchingChunks.length}`);
            
            console.log(`マッチしたチャンク数: ${matchingChunks.length}`);
            relevantChunks.push(...matchingChunks);
            
            // チャンクをファイルに保存するためのディレクトリを作成
            if (!fs.existsSync(docDir)) {
              fs.mkdirSync(docDir, { recursive: true });
            }
            
            // チャンクをファイルに保存
            fs.writeFileSync(chunksFile, JSON.stringify(textChunks, null, 2));
            console.log(`チャンクを保存しました: ${chunksFile}`);
          } catch (fileErr) {
            console.error(`ファイル読み込みエラー (${docInfo.path}):`, fileErr);
          }
        } else {
          console.log(`オリジナルファイルも見つかりません: ${docInfo.path}`);
        }
      }
    }
    
    // より少数の高品質なチャンクを選択（上位7件に制限）
    // これにより、本当に関連性の高いチャンクのみを返す
    console.log(`選択前のチャンク数: ${relevantChunks.length}、検索クエリ: "${query}"`);
    const limitedChunks = relevantChunks.slice(0, 7);
    
    // デバッグ用にチャンクの内容を出力
    limitedChunks.forEach((chunk, idx) => {
      console.log(`選択されたチャンク ${idx+1}:`, chunk.text.substring(0, 50) + '...');
    });
    
    return limitedChunks;
  } catch (err) {
    console.error('Error searching knowledge base:', err);
    return [];
  }
}

/**
 * ナレッジベースからシステムプロンプトを生成
 * @param query ユーザーの質問
 */
export async function generateSystemPromptWithKnowledge(query: string): Promise<string> {
  // 関連するチャンクを検索
  const relevantChunks = await searchKnowledgeBase(query);
  
  // 基本的なシステムプロンプト
  let basePrompt = `あなたは保守用車の知識ベースを持つ応急復旧サポートアシスタントです。
あなたはユーザーから質問を受け取り、保守用車（軌道モータカー、重機、道路保守車両、線路保守車両など）のトラブルシューティングと修理を段階的に支援します。

## 厳守事項（最重要）
- 提供された知識ベースの情報のみを使用し、それ以外の一般知識での回答は禁止
- すべての提供された技術情報を統合し、包括的で網羅的な回答を作成すること
- 保守用車に関する既存のドキュメント全体の内容を考慮して応答すること
- 会話は一連のトラブルシューティングのQA対話形式として進行
- ユーザーの質問に対して各ステップごとに1つだけ返答し、先の手順を一度に提示しない
- ユーザーの返答に基づいて次のステップを案内する対話型のトラブルシューティングを実現

## 重要な検索語句のヒント
- 「エンジン」の場合：軌道モータカーのディーゼルエンジン構造、分類（600型、400型、300型、200型）、製造メーカー別の型式（堀川工機、松山重車両など）、機械式と電子噴射式、高トルク、油圧ポンプ、エアーコンプレッサーの情報を含める
- 「フレーム」の場合：軌道モータカーのフレーム構造、H鋼、メーンフレーム、サイドメンバー、クロスメンバー、強度、はしご状構造に関する情報を含める
- 「キャビン」「運転室」の場合：防振ゴム、ガラス、モール、ひねり対策、ワイパー、冷暖房、乗務、労働安全衛生規則に関する情報を含める
- 「ドア」「扉」「幅」の場合：運転室のドア幅（600mm～800mm）、ドアの構造、開閉方式、ドアの寸法、安全基準に関する情報を含める

## 回答方針（厳守）
- 【応急復旧】のタイトルで回答開始
- 「〜です」「〜ます」などの丁寧表現は省略し「〜する」など簡潔な表現を使用
- 命令形で指示を明確に伝える
- 具体的な操作・部品・工具名を明記
- 各ステップは必ず番号付き（1. 2. 3.）で、1行に1つの操作のみを記述
- 一度に1つの手順のみを提示し、次の手順はユーザーからの返答を受けてから案内する

## 会話の流れ（厳守）
1. 最初の質問に対して、最初の手順だけを回答（例：「1. 車両を安全な場所に停止させる」のみ）
2. ユーザーがその手順を実行した後の返答に基づいて、次の1手順だけを案内
3. この一問一答の流れを、問題が解決するか専門的対応が必要と判断されるまで継続する
4. 手順の提示順序は、安全確保→原因特定→修理対応→テストの順に従う
5. ユーザーが「解決した」と答えるか、対応不能と判断されるまで対話を続ける

## 回答フォーマット（厳守）
初回回答：
【応急復旧】
1. [最初の手順のみを簡潔に記述]

以降の回答（ユーザーの返答に基づく）：
2. [次の手順のみを簡潔に記述]

最終回答（解決時）：
作業完了。次の点検に進んでください。

最終回答（解決不能時）：
この問題は専門的な対応が必要です。保守担当者に電話連絡してください。

## 安全注意事項
- 危険性がある場合のみ、先頭に【危険】と記載
- 電気系統：感電危険
- 油圧系統：高圧油危険
- エンジン：火災・熱傷危険`;

  // 関連するチャンクがある場合は追加
  if (relevantChunks.length > 0) {
    basePrompt += `\n\n以下は、あなたの回答に役立つ可能性のある関連情報です：\n\n`;
    
    for (const chunk of relevantChunks) {
      basePrompt += `---\n出典: ${chunk.metadata.source}\n\n${chunk.text}\n---\n\n`;
    }
    
    basePrompt += `\n上記の知識ベースの情報のみを使用して回答してください。以下の例に従って厳密に回答を構成してください：

# 対話例（厳守）：

ユーザー: 鉄トロをけん引して走行中に、ブレーキが利かなくなった。どこを確認したらいい？

アシスタント: 【応急復旧】
1. 車両を安全な場所に停止させる

ユーザー: 停止したが次は

アシスタント: 
2. ブレーキ管からエアー漏れがないか確認する

ユーザー: どこを見ればいい？

アシスタント:
3. エンジン横の入換ブレーキ弁を運転位置にして10～20秒で双針圧力計の黒針が下がるか確認する

ユーザー: 下がらない

アシスタント:
4. ブレーキシリンダーのストロークを確認する

このようにユーザーとの対話を一問一答形式で進め、一度に複数の手順を提示せず、ユーザーの返答に合わせて次のステップを案内してください。`;
  } else {
    // 関連情報が見つからない場合
    // エンジン関連の特別な例を追加
    if (query.toLowerCase().includes('エンジン') && query.toLowerCase().includes('燃料')) {
      const examples = [
        {
          question: "エンジンが急に停止した。燃料はあるが、アクセルを吹かすとゆっくり止まった",
          answer: "【応急復旧】\n1. エンジンの冷却システムを確認してください\n2. 燃料フィルターの詰まりを点検してください\n3. 点火系統（点火プラグ、配線）を確認してください\n4. エアフィルターの状態を確認してください"
        },
        {
          question: "燃料は十分あるのにエンジンがかからない",
          answer: "【応急復旧】\n1. バッテリー電圧を確認してください\n2. 燃料供給系統（ポンプ、インジェクター）を点検してください\n3. イグニッションスイッチとキーの状態を確認してください\n4. エンジン始動インターロックが作動していないか確認してください"
        }
      ];
      
      // 質問に最も近い例を使用
      let bestExample = examples[0];
      let bestScore = 0;
      
      for (const example of examples) {
        // 簡易的な類似度計算
        const exampleWords = example.question.toLowerCase().split(/\s+/);
        const queryWords = query.toLowerCase().split(/\s+/);
        
        let matchCount = 0;
        for (const word of queryWords) {
          if (exampleWords.some(w => w.includes(word) || word.includes(w))) {
            matchCount++;
          }
        }
        
        const score = matchCount / queryWords.length;
        if (score > bestScore) {
          bestScore = score;
          bestExample = example;
        }
      }
      
      basePrompt += `\n\n以下の例に基づいて、ユーザーの質問に回答してください：\n\n---\n質問: ${bestExample.question}\n\n${bestExample.answer}\n---`;
    } else {
      basePrompt += `\n\n質問に関する情報がナレッジベースにありません。以下のように回答してください：

【応急復旧】

ナレッジベースに該当情報がありません。

この問題は専門的な対応が必要です。保守担当者に電話連絡してください。`;
    }
  }
  
  return basePrompt;
}

/**
 * 知識ベース内のすべてのドキュメントを一覧表示
 * ディレクトリをスキャンして実際に存在するファイルからインデックスを更新
 * 画像検索用データファイルも含める
 */
export function listKnowledgeBaseDocuments(): { id: string, title: string, type: string, addedAt: string }[] {
  try {
    // まず知識ベースを初期化
    initializeKnowledgeBase();
    
    console.log('ナレッジベースディレクトリ確認:', KNOWLEDGE_BASE_DIR);
    console.log('ファイル存在確認:', fs.existsSync(path.join(KNOWLEDGE_BASE_DIR, '保守用車ナレッジ.txt')));
    
    // インデックスを読み込み、documents配列が必ず存在することを確認
    const index = loadKnowledgeBaseIndex();
    if (!index.documents) {
      index.documents = [];
    }
    console.log('既存インデックス:', index);
    
    // 画像検索用データファイルも追加
    try {
      // JSONファイル一覧を取得
      const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
      if (fs.existsSync(jsonDir)) {
        const jsonFiles = fs.readdirSync(jsonDir)
          .filter(file => file.endsWith('_metadata.json'))
          .filter(file => {
            // guide_1744876404679_metadata.json などを除外
            return !file.includes('guide_1744876404679') && file !== 'guide_metadata.json';
          });
        
        console.log(`JSONディレクトリから${jsonFiles.length}件のメタデータファイルを発見`);
        
        // 各JSONファイルをドキュメントとしてインデックスに追加
        for (const jsonFile of jsonFiles) {
          // すでに同じファイルがインデックスに存在するかチェック
          const jsonFilePath = path.join(jsonDir, jsonFile);
          const existingDoc = index.documents.find(doc => doc.path === jsonFilePath);
          
          if (!existingDoc) {
            // ファイル情報を取得
            const fileStats = fs.statSync(jsonFilePath);
            const addedAt = fileStats.mtime.toISOString();
            
            // ファイル名からIDとタイトルを抽出
            // 例: mc_1745232652990_metadata.json => mc_1745232652990
            const fileId = jsonFile.replace('_metadata.json', '');
            let fileTitle = fileId;
            
            // JSONファイルの内容からタイトル情報を取得（可能であれば）
            try {
              const jsonContent = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
              if (jsonContent && jsonContent.metadata && jsonContent.metadata.タイトル) {
                fileTitle = jsonContent.metadata.タイトル;
              } else if (jsonContent && jsonContent.title) {
                fileTitle = jsonContent.title;
              }
            } catch (e) {
              console.error(`JSONファイル解析エラー ${jsonFile}:`, e);
            }
            
            // インデックスに追加
            index.documents.push({
              id: fileId,
              title: fileTitle,
              path: jsonFilePath,
              type: 'image_search_data',
              chunkCount: 1,
              addedAt
            });
            
            console.log(`画像検索データファイルをインデックスに追加: ${fileTitle}`);
          }
        }
      }
    } catch (jsonError) {
      console.error('画像検索データファイル処理エラー:', jsonError);
      // エラーが発生しても処理を続行
    }
    
    // 実際にファイルシステムをスキャンして、ファイルが存在するかチェック
    // ルートディレクトリにある保守用車ナレッジ.txtなどのファイルも検出
    const rootFiles = fs.readdirSync(KNOWLEDGE_BASE_DIR)
      .filter(item => !item.startsWith('.') && item !== 'index.json')
      .filter(item => {
        const itemPath = path.join(KNOWLEDGE_BASE_DIR, item);
        // ファイルかどうかをチェック
        const isFile = fs.statSync(itemPath).isFile();
        const isValidExt = item.endsWith('.txt') || 
             item.endsWith('.pdf') || 
             item.endsWith('.docx') || 
             item.endsWith('.xlsx') || 
             item.endsWith('.pptx');
        console.log(`ファイル検出: ${item}, isFile: ${isFile}, isValidExt: ${isValidExt}`);
        return isFile && isValidExt;
      });
    
    console.log('ルートディレクトリファイル検出結果:', rootFiles);
    
    // インデックスに未追加のファイルを追加
    for (const file of rootFiles) {
      // ファイル名のデコード処理
      let decodedFileName = file;
      if (/å|æ|ç|ã/.test(file)) {
        try {
          decodedFileName = Buffer.from(file, 'latin1').toString('utf8');
          console.log(`ファイル名をUTF-8にデコード: ${decodedFileName}`);
        } catch (e) {
          console.error(`ファイル名のデコードに失敗: ${e}`);
        }
      }
      
      const filePath = path.join(KNOWLEDGE_BASE_DIR, file);
      
      // インデックスにファイルが存在するかチェック
      const existingDoc = index.documents.find(doc => doc.path === filePath);
      
      if (!existingDoc) {
        // ファイル拡張子を基にタイプを判定
        let type = 'text';
        if (file.endsWith('.pdf')) type = 'pdf';
        else if (file.endsWith('.docx')) type = 'word';
        else if (file.endsWith('.xlsx')) type = 'excel';
        else if (file.endsWith('.pptx')) type = 'powerpoint';
        
        // 新しいID生成（重複を避けるために現在時刻とランダム値を組み合わせる）
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        const newId = `doc_${timestamp}_${random}`;
        
        console.log(`新規ファイル追加: ${decodedFileName}, ID: ${newId}`);
        
        // インデックスに追加 (デコードされたファイル名を使用)
        index.documents.push({
          id: newId,
          title: decodedFileName,
          path: filePath,
          type,
          chunkCount: 1, // 仮の値
          addedAt: new Date().toISOString()
        });
      }
    }
    
    // サブディレクトリも検索してファイルを処理
    const directories = fs.readdirSync(KNOWLEDGE_BASE_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
      .map(dirent => dirent.name);
      
    // サブディレクトリ内のファイルも検索して追加
    for (const dir of directories) {
      const dirPath = path.join(KNOWLEDGE_BASE_DIR, dir);
      const subFiles = fs.readdirSync(dirPath)
        .filter(item => !item.startsWith('.') && 
          (item.endsWith('.txt') || 
           item.endsWith('.pdf') || 
           item.endsWith('.docx') || 
           item.endsWith('.xlsx') || 
           item.endsWith('.pptx')));
      
      for (const file of subFiles) {
        // ファイル名のデコード処理
        let decodedFileName = file;
        if (/å|æ|ç|ã/.test(file)) {
          try {
            decodedFileName = Buffer.from(file, 'latin1').toString('utf8');
            console.log(`サブディレクトリ内ファイル名をUTF-8にデコード: ${decodedFileName}`);
          } catch (e) {
            console.error(`サブディレクトリ内ファイル名のデコードに失敗: ${e}`);
          }
        }
        
        const filePath = path.join(dirPath, file);
        // インデックスにファイルが存在するかチェック
        const existingDoc = index.documents.find(doc => doc.path === filePath);
        
        if (!existingDoc) {
          // ファイル拡張子を基にタイプを判定
          let type = 'text';
          if (file.endsWith('.pdf')) type = 'pdf';
          else if (file.endsWith('.docx')) type = 'word';
          else if (file.endsWith('.xlsx')) type = 'excel';
          else if (file.endsWith('.pptx')) type = 'powerpoint';
          
          // 新しいID生成
          const newId = `doc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          
          // ディレクトリ名のデコード処理
          let decodedDirName = dir;
          if (/å|æ|ç|ã/.test(dir)) {
            try {
              decodedDirName = Buffer.from(dir, 'latin1').toString('utf8');
              console.log(`ディレクトリ名をUTF-8にデコード: ${decodedDirName}`);
            } catch (e) {
              console.error(`ディレクトリ名のデコードに失敗: ${e}`);
            }
          }
          
          // インデックスに追加 (デコードされたファイル名を使用)
          index.documents.push({
            id: newId,
            title: `${decodedDirName}/${decodedFileName}`, // サブディレクトリのパスを含める
            path: filePath,
            type,
            chunkCount: 1, // 仮の値
            addedAt: new Date().toISOString()
          });
        }
      }
    }
    
    // インデックスを更新
    saveKnowledgeBaseIndex(index);
    
    // ドキュメント情報を返す
    return index.documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      addedAt: doc.addedAt
    }));
  } catch (error) {
    console.error('ナレッジベース一覧取得エラー:', error);
    return [];
  }
}

/**
 * 差分処理でドキュメントを更新する
 * @param newDoc 新しいドキュメント
 * @param existingDocId 既存のドキュメントID
 */
export async function mergeDocumentContent(newDoc: ProcessedDocument, existingDocId: string): Promise<void> {
  try {
    console.log(`ドキュメント差分更新開始: ${existingDocId}`);
    
    // 既存ドキュメントのチャンクを読み込む
    const existingDocDir = path.join(KNOWLEDGE_DOCUMENTS_DIR, existingDocId);
    const chunksFile = path.join(existingDocDir, 'chunks.json');
    
    if (fs.existsSync(chunksFile)) {
      const existingChunks: DocumentChunk[] = JSON.parse(fs.readFileSync(chunksFile, 'utf8'));
      console.log(`既存チャンク数: ${existingChunks.length}`);
      
      // 既存チャンクのテキスト内容をハッシュマップに格納
      const existingChunkMap = new Map<string, DocumentChunk>();
      existingChunks.forEach(chunk => {
        // テキストの最初の50文字をキーとして使用
        const key = chunk.text.substring(0, 50);
        existingChunkMap.set(key, chunk);
      });
      
      // 新しいチャンクを既存のものとマージ
      const mergedChunks: DocumentChunk[] = [...existingChunks];
      
      for (const newChunk of newDoc.chunks) {
        const key = newChunk.text.substring(0, 50);
        if (existingChunkMap.has(key)) {
          // 重複チャンクは既存のものを更新
          const index = mergedChunks.findIndex(chunk => 
            chunk.text.substring(0, 50) === key);
          if (index !== -1) {
            mergedChunks[index] = newChunk;
            console.log(`チャンクを更新: ${key.substring(0, 20)}...`);
          }
        } else {
          // 新規チャンクを追加
          mergedChunks.push(newChunk);
          console.log(`新規チャンクを追加: ${key.substring(0, 20)}...`);
        }
      }
      
      // マージしたチャンクを保存
      fs.writeFileSync(chunksFile, JSON.stringify(mergedChunks, null, 2));
      console.log(`マージ後のチャンク数: ${mergedChunks.length}`);
      
      // Q&Aデータもマージする
      try {
        const qaDir = path.join(existingDocDir, 'qa');
        ensureDirectoryExists(qaDir);
        
        // 既存のQ&Aデータを読み込む
        const qaPairsFile = path.join(qaDir, 'qa_pairs.json');
        let existingQAPairs: any[] = [];
        
        if (fs.existsSync(qaPairsFile)) {
          try {
            existingQAPairs = JSON.parse(fs.readFileSync(qaPairsFile, 'utf8'));
            if (!Array.isArray(existingQAPairs)) {
              existingQAPairs = [];
            }
          } catch (e) {
            console.error('既存のQ&Aデータ読み込みエラー:', e);
          }
        }
        
        // 新しいQ&Aデータを生成
        const fullText = newDoc.chunks.map(chunk => chunk.text).join("\n");
        const openaiModule = await import('./openai');
        const newQAPairs = await openaiModule.generateQAPairs(fullText, 5);
        
        // 既存のQ&Aとマージ（重複を避ける）
        const existingQuestions = new Set(existingQAPairs.map(qa => qa.question));
        const mergedQAPairs = [...existingQAPairs];
        
        for (const qa of newQAPairs) {
          if (!existingQuestions.has(qa.question)) {
            mergedQAPairs.push(qa);
          }
        }
        
        // マージしたQ&Aデータを保存
        fs.writeFileSync(qaPairsFile, JSON.stringify(mergedQAPairs, null, 2));
        console.log(`マージ後のQ&A数: ${mergedQAPairs.length}`);
        
        // 個別のQ&Aファイルも更新
        mergedQAPairs.forEach((qa, index) => {
          const qaFileName = `qa_${index + 1}.json`;
          fs.writeFileSync(
            path.join(qaDir, qaFileName),
            JSON.stringify(qa, null, 2)
          );
        });
      } catch (qaError) {
        console.error('Q&Aマージエラー:', qaError);
      }
      
      // インデックスも更新
      const index = loadKnowledgeBaseIndex();
      const docIndex = index.documents.findIndex(doc => doc.id === existingDocId);
      
      if (docIndex !== -1) {
        index.documents[docIndex].chunkCount = mergedChunks.length;
        saveKnowledgeBaseIndex(index);
        console.log('ドキュメントインデックスを更新しました');
      }
    } else {
      console.error(`既存のチャンクファイルが見つかりません: ${chunksFile}`);
    }
  } catch (error) {
    console.error('ドキュメントマージエラー:', error);
    throw error;
  }
}

/**
 * 知識ベースのバックアップを作成する
 * @param docIds バックアップするドキュメントIDの配列（空の場合はすべてをバックアップ）
 * @returns バックアップファイルのパス
 */
export async function backupKnowledgeBase(docIds?: string[]): Promise<string> {
  try {
    // バックアップ用のディレクトリを確認
    const backupDir = path.join(KNOWLEDGE_BASE_DIR, 'backups');
    ensureDirectoryExists(backupDir);
    
    // 新しいZIPファイルを作成
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFileName = `knowledge_backup_${timestamp}.zip`;
    const zipFilePath = path.join(backupDir, zipFileName);
    
    const zip = new AdmZip();
    
    // バックアップするドキュメントの選択
    let targetDocIds: string[] = docIds || [];
    
    // 指定がない場合はすべてのドキュメントをバックアップ
    if (targetDocIds.length === 0) {
      const index = loadKnowledgeBaseIndex();
      targetDocIds = index.documents.map(doc => doc.id);
    }
    
    console.log(`バックアップ対象ドキュメント数: ${targetDocIds.length}`);
    
    // インデックスファイルを追加
    if (fs.existsSync(KNOWLEDGE_INDEX_FILE)) {
      zip.addLocalFile(KNOWLEDGE_INDEX_FILE, '');
      console.log('インデックスファイルをバックアップに追加しました');
    }
    
    // 指定されたドキュメントをバックアップ
    for (const docId of targetDocIds) {
      const docDir = path.join(KNOWLEDGE_DOCUMENTS_DIR, docId);
      
      if (fs.existsSync(docDir)) {
        // ディレクトリ内のすべてのファイルを再帰的に追加
        addDirectoryToZip(zip, docDir, `documents/${docId}`);
        console.log(`ドキュメント ${docId} をバックアップに追加しました`);
      } else {
        console.warn(`ドキュメント ${docId} が見つかりません`);
      }
    }
    
    // ZIPファイルを書き込む
    zip.writeZip(zipFilePath);
    
    console.log(`バックアップを作成しました: ${zipFilePath}`);
    return zipFilePath;
  } catch (error) {
    console.error('バックアップ作成エラー:', error);
    throw error;
  }
}

/**
 * ディレクトリを再帰的にZIPに追加するヘルパー関数
 */
function addDirectoryToZip(zip: AdmZip, dirPath: string, zipPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const zipEntryPath = path.join(zipPath, item);
    
    if (fs.statSync(fullPath).isDirectory()) {
      // サブディレクトリを再帰的に処理
      addDirectoryToZip(zip, fullPath, zipEntryPath);
    } else {
      // ファイルをZIPに追加
      zip.addLocalFile(fullPath, path.dirname(zipEntryPath));
    }
  }
}

/**
 * 知識ベースからドキュメントを削除
 * @param docId 削除するドキュメントID
 */
export function removeDocumentFromKnowledgeBase(docId: string): boolean {
  try {
    console.log(`ドキュメント削除リクエスト: ${docId}`);
    
    // インデックスを読み込み
    const index = loadKnowledgeBaseIndex();
    
    // ドキュメントが存在するか確認
    const docIndex = index.documents.findIndex(doc => doc.id === docId);
    if (docIndex === -1) {
      console.log(`該当ドキュメントがインデックスに見つかりません: ${docId}`);
      return false;
    }
    
    // 削除対象ドキュメントの情報を保存
    const docInfo = index.documents[docIndex];
    const docPath = docInfo.path;
    const docTitle = docInfo.title;
    const docType = docInfo.type;
    console.log(`削除対象ドキュメント: ${docPath}`);
    console.log(`ドキュメントタイトル: ${docTitle}, タイプ: ${docType}`);
    
    // 画像検索用データの場合の特別処理
    if (docType === 'image_search_data') {
      return removeImageSearchData(docId, docPath, index, docIndex);
    }
    
    // インデックスから削除
    index.documents.splice(docIndex, 1);
    saveKnowledgeBaseIndex(index);
    console.log(`インデックスから削除しました: ${docId}`);
    
    // ドキュメントファイルまたはディレクトリを削除
    if (fs.existsSync(docPath) && !docPath.includes('..')) {
      // 通常のファイルの場合
      try {
        const stats = fs.statSync(docPath);
        if (stats.isFile()) {
          fs.unlinkSync(docPath);
          console.log(`ファイルを削除しました: ${docPath}`);
        }
      } catch (err: any) {
        console.error(`ファイル削除エラー: ${err.message}`);
      }
    }
    
    // 旧フォルダ構造のドキュメントディレクトリをチェック
    const oldDocDir = path.join(KNOWLEDGE_BASE_DIR, docId);
    if (fs.existsSync(oldDocDir) && !oldDocDir.includes('..')) {
      try {
        fs.rmSync(oldDocDir, { recursive: true, force: true });
        console.log(`旧ディレクトリ構造を削除しました: ${oldDocDir}`);
      } catch (err: any) {
        console.error(`旧ディレクトリ削除エラー: ${err.message}`);
      }
    }
    
    // 新フォルダ構造のドキュメントディレクトリをチェック
    const newDocDir = path.join(KNOWLEDGE_DOCUMENTS_DIR, docId);
    if (fs.existsSync(newDocDir) && !newDocDir.includes('..')) {
      try {
        fs.rmSync(newDocDir, { recursive: true, force: true });
        console.log(`新ディレクトリ構造を削除しました: ${newDocDir}`);
      } catch (err: any) {
        console.error(`新ディレクトリ削除エラー: ${err.message}`);
      }
    }
    
    // 関連する画像も画像インデックスから削除
    if (fs.existsSync(KNOWLEDGE_IMAGE_INDEX_FILE)) {
      try {
        const imageIndexStr = fs.readFileSync(KNOWLEDGE_IMAGE_INDEX_FILE, 'utf8');
        const imageIndex = JSON.parse(imageIndexStr);
        
        if (imageIndex.images && Array.isArray(imageIndex.images)) {
          // ドキュメントIDに関連する画像を除外
          const updatedImages = imageIndex.images.filter((img: any) => img.documentId !== docId);
          
          // 関連する画像ファイルも削除
          const imagesToDelete = imageIndex.images.filter((img: any) => img.documentId === docId);
          
          // 画像ファイルを物理的に削除
          for (const img of imagesToDelete) {
            // path属性があれば直接パスを使用
            if (img.path && fs.existsSync(img.path)) {
              try {
                fs.unlinkSync(img.path);
                console.log(`関連画像ファイルを削除しました: ${img.path}`);
              } catch (fileErr) {
                console.error(`画像ファイル削除エラー: ${img.path}`, fileErr);
              }
            }
            
            // file属性があれば（画像検索用データ）
            if (img.file && !img.path) {
              // 絶対パスに変換（/knowledge-base/images/... → プロジェクトルートからの相対パス）
              const absolutePath = path.join(process.cwd(), img.file.replace(/^\//, ''));
              if (fs.existsSync(absolutePath)) {
                try {
                  fs.unlinkSync(absolutePath);
                  console.log(`関連画像ファイルを削除しました: ${absolutePath}`);
                } catch (fileErr) {
                  console.error(`画像ファイル削除エラー: ${absolutePath}`, fileErr);
                }
              }
            }
            
            // SVGとPNGの両方のバージョンがある場合は両方削除
            const checkAndDeleteAlternative = (filePath: string) => {
              if (filePath.toLowerCase().endsWith('.svg')) {
                const pngPath = filePath.replace(/\.svg$/i, '.png');
                if (fs.existsSync(pngPath)) {
                  try {
                    fs.unlinkSync(pngPath);
                    console.log(`関連PNG画像も削除しました: ${pngPath}`);
                  } catch (pngErr) {
                    console.error(`PNG画像削除エラー: ${pngPath}`, pngErr);
                  }
                }
              } else if (filePath.toLowerCase().endsWith('.png')) {
                const svgPath = filePath.replace(/\.png$/i, '.svg');
                if (fs.existsSync(svgPath)) {
                  try {
                    fs.unlinkSync(svgPath);
                    console.log(`関連SVG画像も削除しました: ${svgPath}`);
                  } catch (svgErr) {
                    console.error(`SVG画像削除エラー: ${svgPath}`, svgErr);
                  }
                }
              }
            };
            
            // パスとファイルの両方について代替フォーマットも削除
            if (img.path) checkAndDeleteAlternative(img.path);
            if (img.file && !img.path) {
              const absolutePath = path.join(process.cwd(), img.file.replace(/^\//, ''));
              checkAndDeleteAlternative(absolutePath);
            }
          }
          
          if (updatedImages.length !== imageIndex.images.length) {
            // 画像が削除された場合は更新
            imageIndex.images = updatedImages;
            fs.writeFileSync(KNOWLEDGE_IMAGE_INDEX_FILE, JSON.stringify(imageIndex, null, 2));
            console.log(`画像インデックスから${docId}に関連する画像を削除しました (${imageIndex.images.length - updatedImages.length}件)`);
          }
        }
      } catch (err) {
        console.error('画像インデックス更新エラー:', err);
      }
    }
    
    // ドキュメントタイトルから拡張子を除いた名前を取得（共通利用）
    const baseNameWithoutExt = path.basename(docTitle, path.extname(docTitle));
    
    // 画像検索データから関連画像を削除
    try {
      // 画像検索データのパス
      const imageSearchDataPath = path.join(KNOWLEDGE_BASE_DIR, 'data', 'image_search_data.json');
      if (fs.existsSync(imageSearchDataPath)) {
        // 画像検索データを読み込む
        const jsonContent = fs.readFileSync(imageSearchDataPath, 'utf8');
        const imageSearchData = JSON.parse(jsonContent);
        
        if (Array.isArray(imageSearchData)) {
          // ドキュメントタイトルから生成されたIDパターンを検索
          // docTitle（拡張子なし）から先頭2文字を取得
          const prefix = baseNameWithoutExt.substring(0, 2).toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
          
          console.log(`画像検索データからの削除: 検索プレフィックス=${prefix}`);
          
          // 元のデータサイズを保存
          const originalSize = imageSearchData.length;
          
          // 削除対象項目を特定（実際に削除する前に）
          const itemsToDelete = imageSearchData.filter((item: any) => 
            (item.id && (item.id.includes(docId) || item.id.includes(prefix))) ||
            (item.file && (item.file.includes(docId) || item.file.includes(prefix)))
          );
          
          // 削除対象項目のファイルを実際に削除
          for (const item of itemsToDelete) {
            if (item.file) {
              // ファイルパスを絶対パスに変換して削除
              const absoluteFilePath = path.join(process.cwd(), item.file.replace(/^\//, ''));
              if (fs.existsSync(absoluteFilePath)) {
                try {
                  fs.unlinkSync(absoluteFilePath);
                  console.log(`検索データ関連の画像を削除しました: ${absoluteFilePath}`);
                } catch (fileError) {
                  console.error(`検索データ関連の画像削除エラー: ${absoluteFilePath}`, fileError);
                }
              }
              
              // 代替形式のファイルも確認して削除
              if (absoluteFilePath.toLowerCase().endsWith('.svg')) {
                const pngPath = absoluteFilePath.replace(/\.svg$/i, '.png');
                if (fs.existsSync(pngPath)) {
                  try {
                    fs.unlinkSync(pngPath);
                    console.log(`関連PNG画像も削除しました: ${pngPath}`);
                  } catch (fileError) {
                    console.error(`関連PNG画像削除エラー: ${pngPath}`, fileError);
                  }
                }
              } else if (absoluteFilePath.toLowerCase().endsWith('.png')) {
                const svgPath = absoluteFilePath.replace(/\.png$/i, '.svg');
                if (fs.existsSync(svgPath)) {
                  try {
                    fs.unlinkSync(svgPath);
                    console.log(`関連SVG画像も削除しました: ${svgPath}`);
                  } catch (fileError) {
                    console.error(`関連SVG画像削除エラー: ${svgPath}`, fileError);
                  }
                }
              }
            }
          }
          
          // ドキュメントIDまたはプレフィックスに関連する画像を除外
          const filteredData = imageSearchData.filter((item: any) => {
            // fileまたはidにdocIdやプレフィックスが含まれていないものを残す
            return !(
              (item.id && (item.id.includes(docId) || item.id.includes(prefix))) ||
              (item.file && (item.file.includes(docId) || item.file.includes(prefix)))
            );
          });
          
          // 変更があれば保存
          if (filteredData.length !== originalSize) {
            fs.writeFileSync(imageSearchDataPath, JSON.stringify(filteredData, null, 2));
            console.log(`画像検索データを更新しました: ${originalSize}件 -> ${filteredData.length}件（${originalSize - filteredData.length}件削除）`);
          } else {
            console.log('画像検索データに削除すべき項目はありませんでした');
          }
        }
      }
    } catch (err) {
      console.error('画像検索データ更新エラー:', err);
    }
    
    // PowerPointドキュメントの場合、extracted_data.jsonからも削除
    if (docType === 'powerpoint' || docType === 'pptx') {
      try {
        const extractedDataPath = path.join(process.cwd(), 'extracted_data.json');
        if (fs.existsSync(extractedDataPath)) {
          const extractedData = JSON.parse(fs.readFileSync(extractedDataPath, 'utf-8'));
          
          // 保守用車データキーが存在するか確認
          const vehicleDataKey = '保守用車データ';
          if (extractedData[vehicleDataKey] && Array.isArray(extractedData[vehicleDataKey])) {
            // ドキュメントIDに関連するデータを除外
            const originalSize = extractedData[vehicleDataKey].length;
            
            // docIdの一部やタイトルの一部が含まれるエントリを削除
            extractedData[vehicleDataKey] = extractedData[vehicleDataKey].filter((item: any) => {
              // idやtitleにdocIdの一部が含まれていないものを残す
              return !(
                (item.id && (item.id.includes(docId) || item.id.includes(baseNameWithoutExt))) ||
                (item.title && (
                  item.title === docTitle || 
                  item.title.includes(baseNameWithoutExt)
                ))
              );
            });
            
            // 変更があれば保存
            if (extractedData[vehicleDataKey].length !== originalSize) {
              fs.writeFileSync(extractedDataPath, JSON.stringify(extractedData, null, 2));
              console.log(`extracted_data.jsonを更新しました: ${originalSize}件 -> ${extractedData[vehicleDataKey].length}件（${originalSize - extractedData[vehicleDataKey].length}件削除）`);
            } else {
              console.log('extracted_data.jsonに削除すべき項目はありませんでした');
            }
          }
        }
      } catch (err) {
        console.error('extracted_data.json更新エラー:', err);
      }
    }
    
    // 関連するJSONファイルを検索して削除
    try {
      // プレフィックスパターンの抽出
      // docId が doc_1745233987839_123 の場合、mc_1745233987839 を探す
      const matchDocId = docId.match(/doc_(\d+)_/);
      const timeIdPrefix = matchDocId ? `mc_${matchDocId[1]}` : '';
      
      if (timeIdPrefix) {
        // JSONディレクトリパス
        const jsonDir = path.join(KNOWLEDGE_BASE_DIR, 'json');
        
        if (fs.existsSync(jsonDir)) {
          // JSONディレクトリ内のファイル一覧を取得
          const jsonFiles = fs.readdirSync(jsonDir);
          let removedJsonCount = 0;
          
          // 関連するJSONファイルを検索して削除
          for (const jsonFile of jsonFiles) {
            // 削除対象ドキュメントのタイムスタンプを含むJSONファイルを検出
            if (jsonFile.includes(timeIdPrefix)) {
              const jsonFilePath = path.join(jsonDir, jsonFile);
              try {
                fs.unlinkSync(jsonFilePath);
                console.log(`関連JSONファイルを削除しました: ${jsonFilePath}`);
                removedJsonCount++;
              } catch (jsonErr) {
                console.error(`JSONファイル削除エラー: ${jsonFilePath}`, jsonErr);
              }
            }
          }
          
          console.log(`${removedJsonCount}件の関連JSONファイルを削除しました (プレフィックス: ${timeIdPrefix})`);
        }
      }
    } catch (jsonCleanupErr) {
      console.error('JSONファイルクリーンアップエラー:', jsonCleanupErr);
      // JSONクリーンアップエラーは処理を続行
    }
    
    // 処理完了
    console.log(`ドキュメント削除処理が完了しました: ${docId}`);
    return true;
  } catch (err: any) {
    console.error(`ドキュメント削除中のエラー ${docId}:`, err);
    return false;
  }
}

/**
 * 画像検索用データファイルとその関連ファイルを削除する
 * @param docId ドキュメントID
 * @param docPath ドキュメントパス
 * @param index ナレッジベースインデックス
 * @param docIndex ドキュメントのインデックス位置
 */
function removeImageSearchData(docId: string, docPath: string, index: KnowledgeBaseIndex, docIndex: number): boolean {
  try {
    console.log(`画像検索用データファイル削除を開始します: ${docId}`);
    
    // ドキュメントをインデックスから削除
    index.documents.splice(docIndex, 1);
    saveKnowledgeBaseIndex(index);
    console.log(`インデックスから削除しました: ${docId}`);
    
    // JSONメタデータファイルを削除
    if (fs.existsSync(docPath) && !docPath.includes('..')) {
      try {
        fs.unlinkSync(docPath);
        console.log(`JSONメタデータファイルを削除しました: ${docPath}`);
      } catch (err) {
        console.error(`JSONファイル削除エラー: ${docPath}`, err);
      }
    }
    
    // image_search_data.jsonから関連エントリを削除
    const imageSearchDataPath = path.join(process.cwd(), 'knowledge-base', 'data', 'image_search_data.json');
    if (fs.existsSync(imageSearchDataPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(imageSearchDataPath, 'utf8'));
        if (Array.isArray(data)) {
          // 元のデータサイズを保存
          const originalSize = data.length;
          
          // ドキュメントIDに関連するすべてのエントリを検索
          const imagesToDelete = data.filter((item: any) => {
            // メタデータを確認
            return (item.metadata && 
                  (item.metadata.documentId === docId || 
                   item.metadata.fileId === docId)) ||
                  (item.id && item.id.toString().includes(docId));
          });
          
          console.log(`image_search_data.jsonから削除対象: ${imagesToDelete.length}件`);
          
          // 対応する画像ファイルを削除
          for (const item of imagesToDelete) {
            if (item.file) {
              const imagePath = path.join(process.cwd(), item.file.replace(/^\//, ''));
              if (fs.existsSync(imagePath)) {
                try {
                  fs.unlinkSync(imagePath);
                  console.log(`関連画像ファイルを削除しました: ${imagePath}`);
                } catch (fileErr) {
                  console.error(`画像ファイル削除エラー: ${imagePath}`, fileErr);
                }
              }
              
              // SVGとPNGの両方のバージョンがある場合は両方削除
              if (imagePath.toLowerCase().endsWith('.svg')) {
                const pngPath = imagePath.replace(/\.svg$/i, '.png');
                if (fs.existsSync(pngPath)) {
                  try {
                    fs.unlinkSync(pngPath);
                    console.log(`関連PNG画像も削除しました: ${pngPath}`);
                  } catch (pngErr) {
                    console.error(`PNG画像削除エラー: ${pngPath}`, pngErr);
                  }
                }
              } else if (imagePath.toLowerCase().endsWith('.png')) {
                const svgPath = imagePath.replace(/\.png$/i, '.svg');
                if (fs.existsSync(svgPath)) {
                  try {
                    fs.unlinkSync(svgPath);
                    console.log(`関連SVG画像も削除しました: ${svgPath}`);
                  } catch (svgErr) {
                    console.error(`SVG画像削除エラー: ${svgPath}`, svgErr);
                  }
                }
              }
            }
          }
          
          // 残りのエントリのみを保持
          const updatedData = data.filter((item: any) => {
            // メタデータを確認し、ドキュメントIDに関連しないものだけを残す
            return !((item.metadata && 
                    (item.metadata.documentId === docId || 
                     item.metadata.fileId === docId)) ||
                    (item.id && item.id.toString().includes(docId)));
          });
          
          // 更新したデータを保存
          fs.writeFileSync(imageSearchDataPath, JSON.stringify(updatedData, null, 2));
          console.log(`image_search_data.jsonを更新しました（${data.length - updatedData.length}件削除）`);
        }
      } catch (jsonErr) {
        console.error('image_search_data.json更新エラー:', jsonErr);
      }
    }
    
    // index.jsonから対応するエントリを削除
    const indexJsonPath = path.join(process.cwd(), 'knowledge-base', 'index.json');
    if (fs.existsSync(indexJsonPath)) {
      try {
        const indexData = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
        
        // guidesエントリがある場合、ドキュメントIDに関連するエントリを削除
        if (indexData.guides && Array.isArray(indexData.guides)) {
          const originalLength = indexData.guides.length;
          indexData.guides = indexData.guides.filter((item: any) => item.id !== docId);
          
          if (originalLength !== indexData.guides.length) {
            // カウントも更新
            if (typeof indexData.fileCount === 'number') {
              indexData.fileCount = indexData.guides.length;
            }
            fs.writeFileSync(indexJsonPath, JSON.stringify(indexData, null, 2));
            console.log(`index.jsonからエントリを削除しました: ${docId}`);
          }
        }
      } catch (indexErr) {
        console.error('index.json更新エラー:', indexErr);
      }
    }
    
    // 同じIDを持つ他のファイルを検索して削除
    try {
      // JSONディレクトリパス
      const jsonDir = path.join(KNOWLEDGE_BASE_DIR, 'json');
      
      if (fs.existsSync(jsonDir)) {
        // JSONディレクトリ内のファイル一覧を取得
        const jsonFiles = fs.readdirSync(jsonDir);
        
        // 当該IDのプレフィックスと同じJSONファイルをすべて削除
        const jsonPrefix = docId.split('_')[0]; // mc_ や guide_ などのプレフィックス
        const jsonTimestamp = docId.split('_')[1]; // タイムスタンプ部分
        
        if (jsonPrefix && jsonTimestamp) {
          console.log(`関連JSONファイル検索: プレフィックス=${jsonPrefix}, タイムスタンプ=${jsonTimestamp}`);
          
          let relatedFilesRemoved = 0;
          for (const jsonFile of jsonFiles) {
            if (jsonFile.startsWith(jsonPrefix) && jsonFile.includes(jsonTimestamp)) {
              // 削除対象と同じプレフィックスとタイムスタンプを持つファイル
              const relatedFilePath = path.join(jsonDir, jsonFile);
              try {
                fs.unlinkSync(relatedFilePath);
                console.log(`関連JSONファイルを削除しました: ${relatedFilePath}`);
                relatedFilesRemoved++;
              } catch (fileErr) {
                console.error(`関連JSONファイル削除エラー: ${relatedFilePath}`, fileErr);
              }
            }
          }
          
          console.log(`${relatedFilesRemoved}件の関連JSONファイルを削除しました`);
        }
      }
    } catch (relErr) {
      console.error('関連ファイル削除エラー:', relErr);
    }
    
    console.log(`画像検索用データファイル削除が完了しました: ${docId}`);
    return true;
  } catch (error) {
    console.error('画像検索用データ削除エラー:', error);
    return false;
  }
}