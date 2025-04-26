import { Chat, ChatExport, Message } from '@shared/schema';
import OpenAI from "openai";
import fs from 'fs';
import path from 'path';

// OpenAIクライアントの初期化
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user

/**
 * 保守用車車両モデルのデータ
 */
interface VehicleModel {
  id: string;
  name: string;
  keywords: string[];
}

// 車両モデルのサンプルデータ
const vehicleModels: VehicleModel[] = [
  { id: 'mt-100', name: 'MT-100型保線車', keywords: ['MT-100', 'MT100', 'MT 100'] },
  { id: 'mr-400', name: 'MR-400シリーズ', keywords: ['MR-400', 'MR400', 'MR 400'] },
  { id: 'tc-250', name: 'TC-250作業車', keywords: ['TC-250', 'TC250', 'TC 250'] },
  { id: 'ss-750', name: 'SS-750重機', keywords: ['SS-750', 'SS750', 'SS 750'] },
];

/**
 * 症状データ
 */
interface Symptom {
  id: string;
  description: string;
  keywords: string[];
}

// 症状のサンプルデータ
const symptoms: Symptom[] = [
  { id: 'engine-stop', description: 'エンジン停止', keywords: ['エンジン停止', 'エンジンが止まる', 'エンジン切れ'] },
  { id: 'engine-noise', description: '異音', keywords: ['異音', '変な音', '音がする'] },
  { id: 'brake-failure', description: 'ブレーキ不良', keywords: ['ブレーキ不良', 'ブレーキが効かない', 'ブレーキ故障'] },
  { id: 'hydraulic-leak', description: '油圧漏れ', keywords: ['油圧漏れ', 'オイル漏れ', '漏油'] },
  { id: 'electrical-failure', description: '電気系統故障', keywords: ['電気系統', '電装品', '電気不良'] },
];

/**
 * コンポーネントデータ
 */
interface Component {
  id: string;
  name: string;
  keywords: string[];
}

// コンポーネントのサンプルデータ
const components: Component[] = [
  { id: 'engine', name: 'エンジン', keywords: ['エンジン', 'engine', 'モーター'] },
  { id: 'brake', name: 'ブレーキ', keywords: ['ブレーキ', 'brake', '制動装置'] },
  { id: 'hydraulic', name: '油圧系統', keywords: ['油圧', 'hydraulic', 'オイル', '油'] },
  { id: 'electrical', name: '電気系統', keywords: ['電気', 'electrical', '電装', '配線'] },
  { id: 'transmission', name: '変速機', keywords: ['変速機', 'transmission', 'ギア', 'トランスミッション'] },
];

/**
 * テキストからコンポーネント関連のキーワードを抽出する
 */
export function extractComponentKeywords(text: string): string[] {
  const foundComponents: string[] = [];
  
  for (const component of components) {
    for (const keyword of component.keywords) {
      if (text.includes(keyword) && !foundComponents.includes(component.name)) {
        foundComponents.push(component.name);
        break;
      }
    }
  }
  
  return foundComponents;
}

/**
 * テキストから症状関連のキーワードを抽出する
 */
export function extractSymptomKeywords(text: string): string[] {
  const foundSymptoms: string[] = [];
  
  for (const symptom of symptoms) {
    for (const keyword of symptom.keywords) {
      if (text.includes(keyword) && !foundSymptoms.includes(symptom.description)) {
        foundSymptoms.push(symptom.description);
        break;
      }
    }
  }
  
  return foundSymptoms;
}

/**
 * テキストから可能性のある機種モデルを判別する
 */
export function detectPossibleModels(text: string): string[] {
  const foundModels: string[] = [];
  
  for (const model of vehicleModels) {
    for (const keyword of model.keywords) {
      if (text.includes(keyword) && !foundModels.includes(model.name)) {
        foundModels.push(model.name);
        break;
      }
    }
  }
  
  return foundModels;
}

/**
 * チャット履歴を外部システム用にフォーマットする
 */
export async function formatChatHistoryForExternalSystem(
  chat: Chat,
  messages: Message[],
  messageMedia: Record<number, any[]>,
  lastExport: ChatExport | null
): Promise<any> {
  // メッセージからテキスト全体を取得
  const allText = messages.map(m => m.content).join(' ');
  
  // コンポーネント、症状、モデルを抽出
  const extractedComponents = extractComponentKeywords(allText);
  const extractedSymptoms = extractSymptomKeywords(allText);
  const possibleModels = detectPossibleModels(allText);
  
  // 会話の概要をAIで分析（主要な問題と説明を抽出）
  let primaryProblem = '';
  let problemDescription = '';
  
  try {
    // OpenAIを使用して会話から問題を抽出
    const userMessages = messages.filter(m => !m.isAiResponse).map(m => m.content).join('\n');
    const prompt = `
以下は鉄道保守用車両のトラブルシューティングに関する会話です。
この会話から、主要な問題と問題の詳細な説明を日本語で抽出してください。
抽出結果は以下のJSONフォーマットで返してください：
{
  "primary_problem": "簡潔な問題のタイトル（15-20文字程度）",
  "problem_description": "問題の詳細説明（50-100文字程度）"
}

会話：
${userMessages}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    // null チェックを追加
    const content = response.choices[0].message.content || '{"primary_problem":"不明な問題","problem_description":"詳細情報なし"}';
    const result = JSON.parse(content);
    primaryProblem = result.primary_problem;
    problemDescription = result.problem_description;
  } catch (error) {
    console.error('OpenAI APIでの分析中にエラーが発生しました:', error);
    // エラーが発生した場合は単純な抽出結果を使用
    primaryProblem = extractedComponents.length > 0 ? 
      `${extractedComponents[0]}に関する問題` : '不明な問題';
    problemDescription = extractedSymptoms.length > 0 ?
      `${extractedSymptoms.join('と')}の症状が報告されています。` : '詳細な症状は報告されていません。';
  }
  
  // 環境情報をAIで生成
  let environmentContext = '';
  try {
    const contextPrompt = `
以下は鉄道保守用車両のトラブルシューティングに関する会話です。
この会話から、車両の現在の状況や環境に関する情報を50-80文字程度で簡潔にまとめてください。
例えば「車両は〇〇の状態で△△の症状が発生している」といった形式です。

会話：
${messages.slice(0, 10).map(m => m.content).join('\n')}
`;

    const contextResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: contextPrompt }],
    });

    // null チェックを追加
    environmentContext = contextResponse.choices[0].message.content?.trim() || '会話内容から環境情報を抽出できませんでした。';
  } catch (error) {
    console.error('環境情報の生成中にエラーが発生しました:', error);
    environmentContext = '会話から環境情報を抽出できませんでした。';
  }
  
  // 会話の履歴をフォーマット（画像をBase64でエンコード）
  const conversationHistory = messages.map(message => {
    // コンテンツ内の画像パスを検出
    let updatedContent = message.content;
    
    // 画像パスを正規表現で抽出 - パターンを拡張して相対パスと絶対パスの両方に対応
    const imagePathRegex = /(\/|\.\/)?(knowledge-base|public)\/images\/[^)\s"'\n]+\.(svg|png|jpg|jpeg)/g;
    const imagePaths = message.content.match(imagePathRegex) || [];
    
    console.log(`メッセージID ${message.id}: ${imagePaths.length}個の画像パスを検出`);
    
    // Base64エンコードした画像データを保持するマップ
    const base64Images: Record<string, string> = {};
    
    // プロジェクトのルートディレクトリを基準とする絶対パスを取得する関数
    const resolveImagePath = (imgPath: string): string => {
      // パスが / で始まる場合は、プロジェクトルートからの絶対パスとして扱う
      if (imgPath.startsWith('/')) {
        return path.join(process.cwd(), imgPath.substring(1));
      }
      
      // ./ で始まる場合も同様
      if (imgPath.startsWith('./')) {
        return path.join(process.cwd(), imgPath.substring(2));
      }
      
      // それ以外は、相対パスとしてそのままプロジェクトルートから解決
      return path.join(process.cwd(), imgPath);
    };
    
    // 画像をBase64エンコード
    for (const imagePath of imagePaths) {
      try {
        // 画像ファイルのパスを絶対パスに解決
        const resolvedPath = resolveImagePath(imagePath);
        console.log(`画像パス変換: ${imagePath} -> ${resolvedPath}`);
        
        // 画像ファイルが存在するか確認
        if (fs.existsSync(resolvedPath)) {
          console.log(`画像ファイルを読み込み中: ${resolvedPath}`);
          // 画像をBase64にエンコード
          const imageBuffer = fs.readFileSync(resolvedPath);
          const extension = path.extname(resolvedPath).toLowerCase().slice(1);
          const mimeType = extension === 'svg' ? 'image/svg+xml' : 
                          extension === 'png' ? 'image/png' : 
                          extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
          
          const base64Data = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
          console.log(`画像 ${imagePath} をBase64にエンコードしました (${imageBuffer.length} バイト)`);
          
          // マップに追加
          base64Images[imagePath] = base64Data;
        } else {
          // ファイルが存在しない場合の代替パスを試す（knowledgeベースとpublicディレクトリの両方を試す）
          const alternativePaths = [
            path.join(process.cwd(), 'knowledge-base', 'images', path.basename(imagePath)),
            path.join(process.cwd(), 'public', 'images', path.basename(imagePath))
          ];
          
          let found = false;
          for (const altPath of alternativePaths) {
            console.log(`代替パスを確認中: ${altPath}`);
            if (fs.existsSync(altPath)) {
              const imageBuffer = fs.readFileSync(altPath);
              const extension = path.extname(altPath).toLowerCase().slice(1);
              const mimeType = extension === 'svg' ? 'image/svg+xml' : 
                             extension === 'png' ? 'image/png' : 
                             extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
              
              const base64Data = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
              console.log(`代替パス ${altPath} を使用して画像をエンコードしました (${imageBuffer.length} バイト)`);
              
              base64Images[imagePath] = base64Data;
              found = true;
              break;
            }
          }
          
          if (!found) {
            console.warn(`警告: 画像ファイルが見つかりません: ${imagePath}`);
          }
        }
      } catch (error) {
        console.error(`画像 ${imagePath} のBase64エンコード中にエラーが発生しました:`, error);
      }
    }
    
    // メディア情報も画像をBase64エンコード
    const encodedMedia = (messageMedia[message.id] || []).map(media => {
      // mediaが画像パスを含む場合、Base64エンコード
      if (media.type === 'image' && media.url) {
        try {
          // 画像パスの解決
          const resolvedPath = resolveImagePath(media.url);
          console.log(`メディア画像パス変換: ${media.url} -> ${resolvedPath}`);
          
          // 画像ファイルの存在チェック
          if (fs.existsSync(resolvedPath)) {
            console.log(`メディア画像を読み込み中: ${resolvedPath}`);
            const imageBuffer = fs.readFileSync(resolvedPath);
            const extension = path.extname(resolvedPath).toLowerCase().slice(1);
            const mimeType = extension === 'svg' ? 'image/svg+xml' : 
                           extension === 'png' ? 'image/png' : 
                           extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
            
            console.log(`メディア画像をBase64エンコードしました (${imageBuffer.length} バイト)`);
            return {
              ...media,
              url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`
            };
          } else {
            // 代替パスを試す
            const alternativePaths = [
              path.join(process.cwd(), 'knowledge-base', 'images', path.basename(media.url)),
              path.join(process.cwd(), 'public', 'images', path.basename(media.url)),
              path.join(process.cwd(), 'uploads', path.basename(media.url))
            ];
            
            for (const altPath of alternativePaths) {
              console.log(`メディア代替パスを確認中: ${altPath}`);
              if (fs.existsSync(altPath)) {
                const imageBuffer = fs.readFileSync(altPath);
                const extension = path.extname(altPath).toLowerCase().slice(1);
                const mimeType = extension === 'svg' ? 'image/svg+xml' : 
                               extension === 'png' ? 'image/png' : 
                               extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
                
                console.log(`代替パス ${altPath} を使用してメディア画像をエンコードしました (${imageBuffer.length} バイト)`);
                return {
                  ...media,
                  url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`
                };
              }
            }
            
            console.warn(`警告: メディア画像ファイルが見つかりません: ${media.url}`);
            return media;
          }
        } catch (error) {
          console.error(`メディア画像 ${media.url} のエンコード中にエラーが発生しました:`, error);
          return media;
        }
      }
      return media;
    });

    // timestamp の型安全な取得
    let timestamp: string;
    try {
      if (message.timestamp && typeof message.timestamp.toISOString === 'function') {
        timestamp = message.timestamp.toISOString();
      // @ts-ignore - createdAtが存在する可能性がある
      } else if (message.createdAt && typeof message.createdAt.toISOString === 'function') {
        // @ts-ignore
        timestamp = message.createdAt.toISOString();
      } else {
        timestamp = new Date().toISOString(); // フォールバック
      }
    } catch (error) {
      console.warn('タイムスタンプ処理でエラーが発生しました', error);
      timestamp = new Date().toISOString();
    }

    return {
      id: message.id,
      timestamp: timestamp,
      role: message.isAiResponse ? 'assistant' : 'user',
      content: updatedContent,
      media: encodedMedia,
      base64_images: base64Images // Base64でエンコードした画像を追加
    };
  });
  
  // 最終的なフォーマット済みデータを構築
  return {
    session_id: chat.id,
    timestamp: new Date().toISOString(),
    user_id: chat.userId,
    device_context: {
      detected_models: possibleModels,
      environment: environmentContext,
      last_export: lastExport ? lastExport.timestamp.toISOString() : null
    },
    conversation_history: conversationHistory,
    diagnostics: {
      components: extractedComponents,
      symptoms: extractedSymptoms,
      possible_models: possibleModels,
      primary_problem: primaryProblem,
      problem_description: problemDescription
    },
    metadata: {
      message_count: messages.length,
      has_images: Object.values(messageMedia).some(media => media.length > 0),
      extracted_timestamp: new Date().toISOString(),
      version: "1.0.0"
    }
  };
}