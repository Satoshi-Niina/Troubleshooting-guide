import OpenAI from "openai";
import { generateSystemPromptWithKnowledge } from "./knowledge-base";

// Check if API key is available
const apiKey = process.env.OPENAI_API_KEY;
console.log(`[DEBUG] OpenAI API KEY exists: ${apiKey ? "YES" : "NO"}`);

if (!apiKey) {
  console.error(
    "ERROR: OPENAI_API_KEY is not set in the environment variables",
  );
  console.error("OpenAI functionality will not work without a valid API key");
}

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: apiKey || "",
  dangerouslyAllowBrowser: true, // Allow running in browser environment if needed
});

// Function to check if API key is present before making requests
function validateApiKey(): boolean {
  if (!apiKey) {
    console.error("ERROR: No OpenAI API key available");
    return false;
  }
  return true;
}

// Process a text request and get an AI response
export async function processOpenAIRequest(prompt: string, useOnlyKnowledgeBase: boolean = true): Promise<string> {
  try {
    // Check if API key is available
    if (!validateApiKey()) {
      return "OpenAI APIキーが設定されていません。システム管理者に連絡してください。";
    }

    // ナレッジベースから関連情報を取得してシステムプロンプトを生成
    const systemPrompt = await generateSystemPromptWithKnowledge(prompt);

    // ユーザー設定に応じて制約を追加
    const finalSystemPrompt = useOnlyKnowledgeBase 
      ? systemPrompt 
      : systemPrompt.replace(
          '- 提供された知識ベースの情報のみを使用し、それ以外の一般知識での回答は禁止',
          '- 提供された知識ベースの情報を優先して使用し、必要に応じて一般知識も使用可能'
        );

    console.log("OpenAI APIに送信するシステムプロンプト:", finalSystemPrompt.substring(0, 200) + "...");
    console.log("ユーザープロンプト:", prompt);
    console.log("ナレッジベースのみを使用:", useOnlyKnowledgeBase);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: finalSystemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1, // 非常に低い温度設定で確定的な回答を得る（デフォルトよりさらに低く設定）
      max_tokens: 800, // 回答の長さを制限して具体的にする
    });
    
    // 応答内容をデバッグ出力
    console.log("GPTからの応答:", response.choices[0].message.content?.substring(0, 100) + "...");

    const content =
      response.choices[0].message.content ||
      "申し訳ありませんが、応答を生成できませんでした。";
    return content;
  } catch (error: any) {
    console.error("OpenAI API error:", error);

    // Check for authentication errors
    if (error?.status === 401) {
      return "OpenAI APIキーが無効または設定されていません。システム管理者に連絡してください。";
    }

    // Check for rate limit errors
    if (error?.status === 429) {
      return "OpenAI APIのリクエスト制限に達しました。しばらく待ってからもう一度お試しください。";
    }

    return "申し訳ありませんが、エラーが発生しました。後でもう一度お試しください。";
  }
}

// Process a selected text to generate a search query
export async function generateSearchQuery(
  selectedText: string,
): Promise<string> {
  try {
    // Check if API key is available
    if (!validateApiKey()) {
      return selectedText;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "あなたは鉄道保守用車（軌道モータカーなど）の熟練技術者です。\n以下の方針に従って、ユーザーの質問に簡潔かつ的確に回答してください。\n\n- 参考とする情報は「保守用車ナレッジ.txt」に記載された内容に限る\n- 質問の内容を以下の3つに分類して回答を組み立てること\n  - 【構造説明】：装置や構造の概要や仕組み\n  - 【点検基準】：点検・検査での確認項目、法令等の基準\n  - 【応急処置】：故障時に現地で行う対処。手順を1つずつ簡潔に説明\n- 応急処置は、現場の作業者が理解しやすいように、手順を番号付きで段階的に示す\n- 専門用語は、可能であれば簡単な表現で補足すること\n- 回答は端的・明確にし、長い説明は避ける",
        },
        {
          role: "user",
          content: `このテキストから最適化された検索クエリを生成してください: "${selectedText}"`,
        },
      ],
      max_tokens: 50,
    });

    const content = response.choices[0].message.content || selectedText;
    return content;
  } catch (error: any) {
    console.error("OpenAI API error in search query generation:", error);

    // Still return the selected text even if there's an error
    return selectedText;
  }
}

// Analyze an image to identify vehicle parts or issues
export async function analyzeVehicleImage(base64Image: string): Promise<{
  analysis: string;
  suggestedActions: string[];
}> {
  try {
    // Check if API key is available
    if (!validateApiKey()) {
      return {
        analysis:
          "OpenAI APIキーが設定されていません。システム管理者に連絡してください。",
        suggestedActions: [
          "システム管理者に連絡してAPIキーを確認してください。",
        ],
      };
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `あなたは保守用車の部品や系統に関する専門家です。
提供された車両部品やシステムの画像を分析してください。
コンポーネントを特定し、潜在的な問題と推奨されるトラブルシューティング手順を提案してください。
重機、道路保守車両、線路保守車両などの保守用車に焦点を当ててください。
分析を以下の2つのフィールドを持つJSON形式で提供してください：
1. "analysis": 画像に見える内容の詳細な説明。車両のコンポーネントとその状態に焦点を当てる
2. "suggestedActions": トラブルシューティングや修理のための3〜5つの推奨される次のステップの配列`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "この保守用車のコンポーネント画像を分析して、診断情報を提供してください：",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || "{}";
    const result = JSON.parse(content);
    return {
      analysis: result.analysis || "画像分析を完了できませんでした。",
      suggestedActions: result.suggestedActions || [
        "技術者に相談してください。",
      ],
    };
  } catch (error: any) {
    console.error("OpenAI image analysis error:", error);

    // Check for authentication errors
    if (error?.status === 401) {
      return {
        analysis:
          "OpenAI APIキーが無効または設定されていません。システム管理者に連絡してください。",
        suggestedActions: [
          "システム管理者に連絡してAPIキーを確認してください。",
        ],
      };
    }

    // Check for rate limit errors
    if (error?.status === 429) {
      return {
        analysis: "OpenAI APIのリクエスト制限に達しました。",
        suggestedActions: [
          "しばらく待ってからもう一度お試しください。",
          "技術サポートにお問い合わせください。",
        ],
      };
    }

    return {
      analysis: "画像分析中にエラーが発生しました。",
      suggestedActions: [
        "もう一度お試しください。",
        "別の画像をアップロードしてみてください。",
        "技術サポートにお問い合わせください。",
      ],
    };
  }
}
