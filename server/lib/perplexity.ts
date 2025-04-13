import axios from 'axios';
import { generateSystemPromptWithKnowledge } from './knowledge-base';
import { log } from '../vite';

// Perplexity API の型定義
interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityRequestOptions {
  model: string;
  messages: PerplexityMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  search_domain_filter?: string[];
  return_images?: boolean;
  return_related_questions?: boolean;
  search_recency_filter?: string;
  top_k?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface PerplexityCitation {
  url: string;
  text?: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations: PerplexityCitation[];
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role: string;
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Perplexity API キーが設定されているかチェック
function validateApiKey(): boolean {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    log('環境変数 PERPLEXITY_API_KEY が設定されていません', 'perplexity');
    return false;
  }
  return true;
}

/**
 * Perplexity API を使用して回答を生成する
 * @param query ユーザーの質問
 * @param useKnowledgeBaseOnly ナレッジベースのみを使用する場合はtrue
 * @returns 生成された回答
 */
export async function processPerplexityRequest(
  query: string,
  systemPrompt: string = "",
  useKnowledgeBaseOnly: boolean = true
): Promise<{ content: string, citations: PerplexityCitation[] }> {
  // API キーをチェック
  if (!validateApiKey()) {
    throw new Error('Perplexity API キーが設定されていません');
  }

  try {
    // ナレッジベースからシステムプロンプトを生成または既存のものを使用
    const finalSystemPrompt = systemPrompt || await generateSystemPromptWithKnowledge(query);
    
    // Perplexity API リクエスト設定
    const requestOptions: PerplexityRequestOptions = {
      model: "llama-3.1-sonar-small-128k-online", // デフォルトモデル
      messages: [
        {
          role: "system",
          content: finalSystemPrompt
        },
        {
          role: "user",
          content: query
        }
      ],
      temperature: 0.2,
      top_p: 0.9,
      frequency_penalty: 1,
      search_recency_filter: "month",
      return_related_questions: false
    };

    // ナレッジベースのみを使用する場合は検索ドメインを制限
    if (useKnowledgeBaseOnly) {
      requestOptions.search_domain_filter = ["perplexity.ai"];
    }

    // Perplexity API を呼び出す
    const response = await axios.post<PerplexityResponse>(
      'https://api.perplexity.ai/chat/completions',
      requestOptions,
      {
        headers: {
          'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 応答から回答とcitationsを取得
    const content = response.data.choices[0].message.content;
    const citations = response.data.citations || [];

    // 応答をログに記録
    log(`Perplexity応答: ${content.substring(0, 100)}...`, 'perplexity');
    
    return { content, citations };
  } catch (error) {
    // エラーをログに記録
    if (axios.isAxiosError(error)) {
      log(`Perplexity APIエラー: ${error.message}`, 'perplexity');
      if (error.response) {
        log(`レスポンスデータ: ${JSON.stringify(error.response.data)}`, 'perplexity');
      }
    } else {
      log(`Perplexity処理エラー: ${error instanceof Error ? error.message : String(error)}`, 'perplexity');
    }
    
    throw error;
  }
}