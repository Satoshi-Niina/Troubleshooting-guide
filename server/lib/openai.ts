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
    // ナレッジベースからの情報を最大限活用するために常に専門的な回答を促す
    let finalSystemPrompt = systemPrompt;
    
    // プロンプトにある情報を最優先に
    finalSystemPrompt = finalSystemPrompt.replace(
      '- 提供された知識ベースの情報のみを使用し、それ以外の一般知識での回答は禁止',
      '- 提供された知識ベースの情報を最優先で使用し、専門的かつ具体的な回答を提供する。ユーザーの質問で述べられた事実（例：「燃料がある」など）は必ず尊重すること。一般的な表現を避け、専門用語や具体的な手順を含めること\n- すべての関連する知識ベース情報を網羅的に活用し、複数の情報源からの知識を統合して総合的な回答を作成すること\n- 保守用車の技術情報全体を考慮した包括的な分析を行うこと'
    );
    
    // 回答の質を高めるための追加指示
    finalSystemPrompt += '\n\n追加の制約事項:\n';
    finalSystemPrompt += '- ユーザーが既に確認済みの情報（例：「燃料が十分ある」など）については、再確認を促さないこと\n';
    finalSystemPrompt += '- 回答は常に状況に応じた具体的な対処法を中心に構成すること\n';
    finalSystemPrompt += '- 鉄道車両の専門知識に基づいた正確な診断と解決策を提供すること\n';
    finalSystemPrompt += '- 曖昧な表現や一般的な助言ではなく、技術的に具体的な指示を提供すること';

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
      temperature: 0.05, // さらに低い温度設定で専門的で確定的な回答を得る
      max_tokens: 1000, // 回答の長さを少し増やして詳細な情報を含められるようにする
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
// Generate Q&A pairs from document content
export async function generateQAPairs(text: string, count: number = 5): Promise<{question: string, answer: string}[]> {
  try {
    // Check if API key is available
    if (!validateApiKey()) {
      return [{
        question: "APIキーが設定されていません",
        answer: "システム管理者に連絡してください。"
      }];
    }
    
    // Truncate text if it's too long to fit in a prompt
    const maxLength = 14000; // GPT-4o has a large context window but we'll still limit it
    const truncatedText = text.length > maxLength 
      ? text.substring(0, maxLength) + "...(以下省略)" 
      : text;
    
    console.log(`QA生成: テキスト長さ ${text.length} 文字 (${truncatedText.length} 文字に切り詰め)`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `あなたは保守用車マニュアルから質問と回答のペアを生成する専門家です。以下の指示に従ってください：
1. 提供されたテキストから最も重要で実用的な情報に基づいて質問と回答のペアを生成してください
2. 質問は実際の現場作業者が緊急時に尋ねるような実践的なものにしてください
3. それぞれの回答は具体的で、テキストの情報に基づいた正確なものであること
4. 回答は簡潔かつ明瞭で、参照番号や数値を含める場合は正確に引用すること
5. 質問はユーザーの立場を想定した実践的で自然な表現にすること`,
        },
        {
          role: "user",
          content: `以下のテキストから${count}個の質問と回答のペアを生成してください。JSONフォーマットで返してください。各アイテムには "question" と "answer" キーを含めてください：\n\n${truncatedText}`,
        },
      ],
      temperature: 0.2, // 創造性よりも一貫性を重視するため低く設定
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || "{}";
    try {
      const result = JSON.parse(content);
      // qaPairs キーで取得できる場合
      if (Array.isArray(result.qaPairs)) {
        console.log(`${result.qaPairs.length}個のQAペアを生成しました`);
        return result.qaPairs;
      } 
      // 配列で直接返ってくる場合
      else if (Array.isArray(result) && result.length > 0 && 'question' in result[0] && 'answer' in result[0]) {
        console.log(`${result.length}個のQAペアを生成しました（配列形式）`);
        return result;
      } else {
        // 結果がQAペアの配列以外の場合、フォールバック処理
        console.error("予期しないフォーマットのレスポンス:", content);
        return [{
          question: "生成されたQAペアが不正なフォーマットです",
          answer: "エラーが発生しました。もう一度お試しください。"
        }];
      }
    } catch (parseError) {
      console.error("JSON解析エラー:", parseError, "元のコンテンツ:", content);
      return [{
        question: "QAデータの解析エラー",
        answer: "エラーが発生しました。もう一度お試しください。"
      }];
    }
  } catch (error: any) {
    console.error("OpenAI QA生成エラー:", error);
    
    // エラーに応じたフォールバック処理
    if (error?.status === 401) {
      return [{
        question: "OpenAIのAPIキーが無効です",
        answer: "システム管理者に連絡してAPIキーを確認してください。"
      }];
    }
    
    if (error?.status === 429) {
      return [{
        question: "APIレート制限に達しました",
        answer: "しばらく待ってからもう一度お試しください。"
      }];
    }
    
    return [{
      question: "エラーが発生しました",
      answer: "技術的な問題が発生しました。もう一度お試しください。"
    }];
  }
}

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
