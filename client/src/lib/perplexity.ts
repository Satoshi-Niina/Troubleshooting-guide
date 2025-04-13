import axios from 'axios';

// Perplexity API の型定義
export interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PerplexityRequestOptions {
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

export interface PerplexityResponse {
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

/**
 * Perplexity API を使用して質問に回答する
 * @param query ユーザーの質問
 * @param systemPrompt システムプロンプト
 * @param useKnowledgeBaseOnly ナレッジベースのみを使用するか
 * @returns Perplexity APIからの応答
 */
export async function getPerplexityAnswer(
  query: string,
  systemPrompt: string = "保守用車の緊急対応に関する質問に具体的に回答してください。回答は簡潔にしてください。",
  useKnowledgeBaseOnly: boolean = true
): Promise<{ content: string, citations: PerplexityCitation[] }> {
  try {
    // サーバーサイドで実行するAPIリクエスト
    const response = await axios.post('/api/perplexity', {
      query,
      systemPrompt,
      useKnowledgeBaseOnly
    });

    return {
      content: response.data.content,
      citations: response.data.citations || []
    };
  } catch (error) {
    console.error('Perplexity API エラー:', error);
    throw new Error('Perplexity API からの応答に失敗しました');
  }
}