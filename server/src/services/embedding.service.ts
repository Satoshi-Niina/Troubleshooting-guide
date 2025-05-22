import OpenAI from 'openai';

class EmbeddingService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  // テキストをベクトル化
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        encoding_format: "float"
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      throw new Error('テキストのベクトル化に失敗しました');
    }
  }

  // 複数のテキストをバッチでベクトル化
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
        encoding_format: "float"
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('Batch embedding generation error:', error);
      throw new Error('テキストのバッチベクトル化に失敗しました');
    }
  }
}

export const embeddingService = new EmbeddingService(); 