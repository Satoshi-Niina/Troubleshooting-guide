import { Pinecone } from '@pinecone-database/pinecone';
import { EmergencyGuideVector } from '../types/emergency-guide';

class PineconeService {
  private pinecone: Pinecone;
  private index: any;

  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
      environment: process.env.PINECONE_ENVIRONMENT!
    });
    this.index = this.pinecone.Index(process.env.PINECONE_INDEX_NAME!);
  }

  // ベクトルの検索
  async searchSimilarGuides(vector: number[], topK: number = 3) {
    try {
      const searchResults = await this.index.query({
        vector,
        topK,
        includeMetadata: true
      });
      return searchResults;
    } catch (error) {
      console.error('Pinecone search error:', error);
      throw new Error('類似ガイドの検索に失敗しました');
    }
  }

  // ベクトルの保存
  async upsertGuide(guide: EmergencyGuideVector) {
    try {
      await this.index.upsert({
        vectors: [{
          id: guide.id,
          vector: guide.vector,
          metadata: {
            title: guide.title,
            content: guide.content,
            steps: guide.steps,
            keywords: guide.keywords,
            category: guide.category,
            severity: guide.severity,
            lastUpdated: guide.lastUpdated,
            source: guide.metadata.source,
            originalFile: guide.metadata.originalFile
          }
        }]
      });
    } catch (error) {
      console.error('Pinecone upsert error:', error);
      throw new Error('ガイドの保存に失敗しました');
    }
  }

  // ベクトルの削除
  async deleteGuide(id: string) {
    try {
      await this.index.deleteOne(id);
    } catch (error) {
      console.error('Pinecone delete error:', error);
      throw new Error('ガイドの削除に失敗しました');
    }
  }
}

export const pineconeService = new PineconeService(); 