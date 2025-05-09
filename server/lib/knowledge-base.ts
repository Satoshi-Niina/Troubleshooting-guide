/**
 * 知識ベース検索関連の機能
 */
import * as path from 'path';
import * as fs from 'fs';

// 知識ベースディレクトリのパス
const KNOWLEDGE_BASE_DIR = './knowledge-base';
const DATA_DIR = path.join(KNOWLEDGE_BASE_DIR, 'data');
const TEXT_DIR = path.join(KNOWLEDGE_BASE_DIR, 'text');
const TROUBLESHOOTING_DIR = path.join(KNOWLEDGE_BASE_DIR, 'troubleshooting');
const BACKUP_DIR = path.join(KNOWLEDGE_BASE_DIR, 'backups');

// 知識ベースインデックスファイル
const INDEX_FILE = path.join(DATA_DIR, 'knowledge_index.json');

// 知識ベースの初期化
export function initializeKnowledgeBase() {
  console.log('知識ベースの初期化を開始...');
  
  // 必要なディレクトリを作成
  [KNOWLEDGE_BASE_DIR, DATA_DIR, TEXT_DIR, TROUBLESHOOTING_DIR, BACKUP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  console.log('Knowledge base directories initialized');
  console.log('知識ベースの初期化が完了しました');
}

/**
 * シンプルな類似度計算関数
 * @param text1 
 * @param text2 
 * @returns 
 */
function calculateSimilarity(text1: string, text2: string): number {
  // 文字列を小文字に変換して単語に分割
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);
  
  // 共通の単語数をカウント
  const commonWords = words1.filter(word => words2.includes(word));
  
  // 類似度スコアを計算（Jaccard類似度の簡易版）
  const allWords = new Set([...words1, ...words2]);
  return commonWords.length / allWords.size;
}

/**
 * テキストのチャンクを表すインターフェース
 */
export interface TextChunk {
  text: string;
  metadata: {
    source: string;
    index: number;
  };
  similarity?: number;
}

/**
 * 知識ベースから検索する関数
 * @param query 検索クエリ
 * @returns 関連するテキストチャンクの配列
 */
export async function searchKnowledgeBase(query: string): Promise<TextChunk[]> {
  // インメモリで単純な検索を実装
  try {
    const chunks: TextChunk[] = [];
    
    // テキストファイルを読み込む
    const textFiles = fs.readdirSync(TEXT_DIR).filter(file => file.endsWith('.txt'));
    
    for (const file of textFiles) {
      try {
        const content = fs.readFileSync(path.join(TEXT_DIR, file), 'utf-8');
        
        // テキストをチャンクに分割（単純な段落分割）
        const paragraphs = content.split(/\n\s*\n/);
        
        paragraphs.forEach((paragraph, index) => {
          // 空の段落はスキップ
          if (paragraph.trim().length === 0) return;
          
          chunks.push({
            text: paragraph,
            metadata: {
              source: file,
              index
            }
          });
        });
      } catch (error) {
        console.error(`ファイル ${file} の読み込み中にエラーが発生しました:`, error);
      }
    }
    
    // トラブルシューティングフローも検索対象に含める
    try {
      const flowFiles = fs.readdirSync(TROUBLESHOOTING_DIR).filter(file => file.endsWith('.json'));
      
      for (const file of flowFiles) {
        try {
          const content = fs.readFileSync(path.join(TROUBLESHOOTING_DIR, file), 'utf-8');
          const flowData = JSON.parse(content);
          
          // フローのタイトルと説明を検索対象に含める
          const flowText = `${flowData.title || ''} ${flowData.description || ''}`;
          
          // キーワードがあれば追加
          if (flowData.triggerKeywords && Array.isArray(flowData.triggerKeywords)) {
            const keywords = flowData.triggerKeywords.join(' ');
            chunks.push({
              text: `${flowText} ${keywords}`,
              metadata: {
                source: `フロー: ${file}`,
                index: 0
              }
            });
          } else {
            chunks.push({
              text: flowText,
              metadata: {
                source: `フロー: ${file}`,
                index: 0
              }
            });
          }
          
          // 各ステップの説明も検索対象に含める
          if (flowData.steps && Array.isArray(flowData.steps)) {
            flowData.steps.forEach((step: any, index: number) => {
              const stepText = `${step.title || ''} ${step.description || ''}`;
              if (stepText.trim()) {
                chunks.push({
                  text: stepText,
                  metadata: {
                    source: `フローステップ: ${file}`,
                    index: index + 1
                  }
                });
              }
            });
          }
        } catch (error) {
          console.error(`フローファイル ${file} の読み込み中にエラーが発生しました:`, error);
        }
      }
    } catch (error) {
      console.error('トラブルシューティングフロー検索エラー:', error);
    }
    
    // クエリとの類似度を計算
    const scoredChunks = chunks.map(chunk => {
      const similarityScore = calculateSimilarity(query, chunk.text);
      return {
        ...chunk,
        similarity: similarityScore
      };
    });
    
    // 類似度でソートして上位10件を返す
    return scoredChunks
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, 10);
      
  } catch (error) {
    console.error('知識ベース検索エラー:', error);
    return [];
  }
}

/**
 * 知識ベースの内容を使用してシステムプロンプトを生成する
 * @param query ユーザークエリ
 * @returns 知識ベースを組み込んだシステムプロンプト
 */
export async function generateSystemPromptWithKnowledge(query: string): Promise<string> {
  // 知識ベースから関連情報を検索
  const relevantChunks = await searchKnowledgeBase(query);
  
  // 関連情報をプロンプトに追加するための文字列を構築
  let knowledgeText = '';
  if (relevantChunks.length > 0) {
    knowledgeText = '\n\n【関連する知識ベース情報】:\n';
    // 最大5チャンクまで追加(多すぎるとトークン数制限に達する可能性がある)
    const chunksToInclude = relevantChunks.slice(0, 5);
    
    for (const chunk of chunksToInclude) {
      knowledgeText += `---\n出典: ${chunk.metadata.source || '不明'}\n\n${chunk.text}\n---\n\n`;
    }
  }
  
  // 基本的なシステムプロンプト
  const baseSystemPrompt = `あなたは保守用車支援システムの一部として機能するAIアシスタントです。
ユーザーの質問に対して、正確で実用的な回答を提供してください。
以下の知識ベースの情報を活用して回答を生成してください。`;
  
  return `${baseSystemPrompt}${knowledgeText}`;
}

/**
 * ドキュメントを知識ベースに追加する
 * @param fileInfo ファイル情報
 * @param content コンテンツ
 * @returns 処理結果
 */
export function addDocumentToKnowledgeBase(
  fileInfo: { originalname: string; path: string; mimetype: string },
  content: string
): { success: boolean; message: string } {
  try {
    // ファイル名から拡張子を除いた部分を取得
    const baseName = path.basename(fileInfo.originalname, path.extname(fileInfo.originalname));
    const safeBaseName = baseName.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // タイムスタンプを含むファイル名を作成
    const timestamp = Date.now();
    const textFileName = `${safeBaseName}_${timestamp}.txt`;
    
    // テキストファイルを知識ベースに保存
    fs.writeFileSync(path.join(TEXT_DIR, textFileName), content, 'utf-8');
    
    console.log(`ドキュメントを知識ベースに追加しました: ${textFileName}`);
    
    return {
      success: true,
      message: `ドキュメント ${fileInfo.originalname} を知識ベースに追加しました`
    };
  } catch (error) {
    console.error('ドキュメントの知識ベース追加エラー:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '不明なエラーが発生しました'
    };
  }
}

/**
 * 知識ベースのバックアップを作成する
 * @returns バックアップ結果
 */
export function backupKnowledgeBase(): { success: boolean; message: string; backupPath?: string } {
  try {
    // バックアップディレクトリが存在しない場合は作成
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // バックアップファイル名（現在のタイムスタンプを含む）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `knowledge_base_backup_${timestamp}.json`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);
    
    // テキストコンテンツのインデックスを作成
    const textFiles = fs.readdirSync(TEXT_DIR).filter(file => file.endsWith('.txt'));
    const textContents: Record<string, string> = {};
    
    for (const file of textFiles) {
      try {
        const content = fs.readFileSync(path.join(TEXT_DIR, file), 'utf-8');
        textContents[file] = content;
      } catch (error) {
        console.error(`ファイル ${file} の読み込み中にエラーが発生しました:`, error);
      }
    }
    
    // バックアップデータ構造
    const backupData = {
      timestamp: new Date().toISOString(),
      textFiles: textContents,
      // 必要に応じて他のデータも追加
    };
    
    // バックアップファイルに書き込み
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf-8');
    
    console.log(`知識ベースのバックアップを作成しました: ${backupFileName}`);
    
    return {
      success: true,
      message: `知識ベースのバックアップを作成しました: ${backupFileName}`,
      backupPath
    };
  } catch (error) {
    console.error('知識ベースのバックアップ作成エラー:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '不明なエラーが発生しました'
    };
  }
}

/**
 * 複数のドキュメントコンテンツをマージする
 * @param contents マージするコンテンツの配列
 * @returns マージされたコンテンツ
 */
export function mergeDocumentContent(contents: string[]): string {
  // 単純に改行で区切ってマージする
  return contents.join('\n\n---\n\n');
}

/**
 * 知識ベースのインデックスをロードする
 * @returns インデックスデータ
 */
export function loadKnowledgeBaseIndex(): any {
  try {
    if (!fs.existsSync(INDEX_FILE)) {
      // インデックスファイルが存在しない場合は空のインデックスを返す
      return {
        documents: [],
        lastUpdated: new Date().toISOString()
      };
    }
    
    const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
    return JSON.parse(indexContent);
  } catch (error) {
    console.error('知識ベースインデックス読み込みエラー:', error);
    
    // エラーが発生した場合も空のインデックスを返す
    return {
      documents: [],
      lastUpdated: new Date().toISOString(),
      error: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}

/**
 * 知識ベースに保存されているドキュメントの一覧を取得する
 * @returns ドキュメントのメタデータ配列
 */
export function listKnowledgeBaseDocuments(): { success: boolean; documents: any[]; message?: string } {
  try {
    // テキストファイルを取得
    const textFiles = fs.readdirSync(TEXT_DIR).filter(file => file.endsWith('.txt'));
    
    // ファイル情報の配列を作成
    const documents = textFiles.map(file => {
      try {
        const stats = fs.statSync(path.join(TEXT_DIR, file));
        const content = fs.readFileSync(path.join(TEXT_DIR, file), 'utf-8');
        
        // ファイル名からメタデータを抽出
        const nameParts = file.split('_');
        const timestamp = parseInt(nameParts[nameParts.length - 1], 10) || stats.mtime.getTime();
        
        return {
          id: file.replace('.txt', ''),
          filename: file,
          title: nameParts.slice(0, -1).join('_').replace(/_/g, ' '),
          size: stats.size,
          createdAt: new Date(timestamp).toISOString(),
          lastModified: stats.mtime.toISOString(),
          contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
        };
      } catch (error) {
        console.error(`ファイル ${file} の情報取得中にエラーが発生しました:`, error);
        return {
          id: file.replace('.txt', ''),
          filename: file,
          title: file.replace('.txt', ''),
          error: error instanceof Error ? error.message : '不明なエラー'
        };
      }
    });
    
    // 新しい順に並べ替え
    documents.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    
    return {
      success: true,
      documents
    };
  } catch (error) {
    console.error('知識ベースドキュメント一覧取得エラー:', error);
    return {
      success: false,
      documents: [],
      message: error instanceof Error ? error.message : '不明なエラーが発生しました'
    };
  }
}

/**
 * 知識ベースからドキュメントを削除する
 * @param documentId ドキュメントID
 * @returns 削除結果
 */
export function removeDocumentFromKnowledgeBase(documentId: string): { success: boolean; message: string } {
  try {
    // ファイル名を作成（.txtが含まれていない場合は追加）
    const filename = documentId.endsWith('.txt') ? documentId : `${documentId}.txt`;
    const filePath = path.join(TEXT_DIR, filename);
    
    // ファイルが存在するか確認
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: `ドキュメント ${documentId} は存在しません`
      };
    }
    
    // ファイルを削除
    fs.unlinkSync(filePath);
    
    console.log(`ドキュメント ${documentId} を知識ベースから削除しました`);
    
    return {
      success: true,
      message: `ドキュメント ${documentId} を知識ベースから削除しました`
    };
  } catch (error) {
    console.error('ドキュメント削除エラー:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '不明なエラーが発生しました'
    };
  }
}