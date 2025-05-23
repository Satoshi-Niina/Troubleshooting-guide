import OpenAI from "openai";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirnameの代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .envファイルの読み込み
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const OPENAI_MODEL = "gpt-4o";

// OpenAI クライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// APIキーが存在するか確認
console.log("[DEBUG] OpenAI API KEY exists:", process.env.OPENAI_API_KEY ? "YES" : "NO");

/**
 * OpenAI APIにリクエストを送信して応答を取得する関数
 * @param prompt プロンプト文字列
 * @param useKnowledgeBase ナレッジベースを使用するかどうか
 * @returns OpenAI APIからの応答テキスト
 */
export async function processOpenAIRequest(prompt: string, useKnowledgeBase: boolean = true): Promise<string> {
  try {
    // システムプロンプトを設定
    let systemPrompt = "あなたは保守用車支援システムの一部として機能するAIアシスタントです。ユーザーの質問に対して、正確で実用的な回答を提供してください。";
    
    // ナレッジベースから関連情報を取得して含める
    if (useKnowledgeBase) {
      const { generateSystemPromptWithKnowledge } = await import('./knowledge-base');
      systemPrompt = await generateSystemPromptWithKnowledge(prompt);
    }
    
    // OpenAI API呼び出し
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      // JSON形式の強制は解除
    });

    // レスポンスからテキストを抽出
    const responseText = response.choices[0].message.content || '';
    return responseText;
  } catch (error: any) {
    console.error('OpenAI API エラー:', error.message);
    if (error.response) {
      console.error('レスポンスステータス:', error.response.status);
      console.error('レスポンスデータ:', error.response.data);
    }
    throw new Error(`OpenAI APIリクエスト中にエラーが発生しました: ${error.message}`);
  }
}

/**
 * テキストを要約するヘルパー関数
 * @param text 要約するテキスト
 * @returns 要約されたテキスト
 */
export async function summarizeText(text: string): Promise<string> {
  try {
    // 長すぎるテキストを切り詰める
    const truncatedText = text.length > 4000 ? text.substring(0, 4000) + "..." : text;
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { 
          role: "system", 
          content: "あなたは技術文書の要約を行う専門家です。文章の要点を保ちながら、簡潔に要約してください。" 
        },
        { 
          role: "user", 
          content: `以下のテキストを100語程度に要約してください:\n\n${truncatedText}` 
        }
      ],
      temperature: 0.3,
    });

    return response.choices[0].message.content || '';
  } catch (error: any) {
    console.error('テキスト要約エラー:', error.message);
    return '要約の生成中にエラーが発生しました。';
  }
}

/**
 * キーワードを生成するヘルパー関数
 * @param text キーワードを生成するテキスト
 * @returns キーワードの配列
 */
export async function generateKeywords(text: string): Promise<string[]> {
  try {
    // 長すぎるテキストを切り詰める
    const truncatedText = text.length > 4000 ? text.substring(0, 4000) + "..." : text;
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { 
          role: "system", 
          content: "あなたは技術文書からキーワードを抽出する専門家です。与えられたテキストから、検索に役立つ重要なキーワードを抽出してください。" 
        },
        { 
          role: "user", 
          content: `以下のテキストから、最も重要な5〜10個のキーワードを抽出し、JSON配列形式で返してください。専門用語や固有名詞を優先してください:\n\n${truncatedText}` 
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }, // 強制的にJSONオブジェクトとして返す
    });

    const content = response.choices[0].message.content || '{"keywords": []}';
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.keywords)) {
        return parsed.keywords;
      } else if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (e) {
      console.error('キーワード解析エラー:', e);
      return [];
    }
  } catch (error: any) {
    console.error('キーワード生成エラー:', error.message);
    return [];
  }
}

/**
 * 検索クエリを生成する関数
 * @param text 元のテキスト
 * @returns 最適化された検索クエリ
 */
/**
 * キーワードからステップ形式のレスポンスを生成する
 */
export async function generateStepResponse(keyword: string): Promise<{
  title: string;
  steps: { description: string }[];
}> {
  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "あなたは保守用車の専門家です。キーワードに基づいて、具体的な手順を説明してください。"
        },
        {
          role: "user",
          content: `以下のキーワードに関する対応手順を、3-5つのステップに分けて説明してください:\n${keyword}`
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content || '';
    const result = JSON.parse(content);
    return {
      title: result.title || keyword,
      steps: result.steps || []
    };
  } catch (error) {
    console.error('ステップレスポンス生成エラー:', error);
    return {
      title: keyword,
      steps: [{ description: "レスポンスの生成に失敗しました。" }]
    };
  }
}

export async function generateSearchQuery(text: string): Promise<string> {
  try {
    // 長すぎるテキストを切り詰める
    const truncatedText = text.length > 200 ? text.substring(0, 200) + "..." : text;
    
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { 
          role: "system", 
          content: "あなたは検索クエリの最適化専門家です。ユーザーの質問や文章から、検索エンジンで使用するのに最適な検索クエリを生成してください。" 
        },
        { 
          role: "user", 
          content: `以下のテキストから、関連する技術文書を検索するための最適な検索キーワードを5～10語で抽出してください。専門用語を優先し、余分な接続詞や前置詞は除外してください:\n\n${truncatedText}` 
        }
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    const query = response.choices[0].message.content?.trim() || truncatedText;
    return query;
  } catch (error: any) {
    console.error('検索クエリ生成エラー:', error.message);
    // エラーが発生した場合は元のテキストを返す
    return text;
  }
}

/**
 * 車両画像を分析する関数
 * @param base64Image Base64エンコードされた画像データ
 * @returns 分析結果
 */
export async function analyzeVehicleImage(base64Image: string): Promise<any> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // ビジョン機能を持つモデルを使用
      messages: [
        {
          role: "system",
          content: "あなたは車両画像分析の専門家です。保守用車・作業用車両・特殊車両の画像を分析し、車両のタイプ、状態、特徴を詳細に説明してください。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "この車両の画像を分析して、車両の種類、状態、目立つ特徴、および考えられる用途について詳細に説明してください。保守用車の場合は、その種類（軌道モータカー、マルチプルタイタンパー、バラストレギュレーターなど）も特定してください。"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 1000,
    });

    return {
      analysis: response.choices[0].message.content || '',
      success: true
    };
  } catch (error: any) {
    console.error('車両画像分析エラー:', error.message);
    return {
      analysis: '画像の分析中にエラーが発生しました。',
      success: false,
      error: error.message
    };
  }
}