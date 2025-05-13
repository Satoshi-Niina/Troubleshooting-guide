import Fuse from 'fuse.js';
import { OpenAI } from 'openai';
import path from 'path';
import fs from 'fs/promises';

interface SearchResult {
  text: string;
  images: string[];
  emergencyGuides: {
    title: string;
    description: string;
    imageUrl: string;
    steps: string[];
  }[];
  metadata: any;
}

export class SearchService {
  private fuse: Fuse<any>;
  private emergencyFuse: Fuse<any>;
  private openai: OpenAI;
  private metadataPath: string;
  private emergencyGuidePath: string;

  constructor() {
    this.metadataPath = path.join(process.cwd(), 'knowledge-base', 'processed', 'metadata');
    this.emergencyGuidePath = path.join(process.cwd(), 'knowledge-base', 'processed', 'emergency-guides');
    this.openai = new OpenAI();
    this.initializeFuse();
  }

  private async initializeFuse() {
    // 通常のメタデータの初期化
    const metadataFiles = await fs.readdir(this.metadataPath);
    const searchableItems = [];

    for (const file of metadataFiles) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(this.metadataPath, file), 'utf-8');
        const metadata = JSON.parse(content);
        searchableItems.push(metadata);
      }
    }

    this.fuse = new Fuse(searchableItems, {
      keys: ['title', 'description', 'tags', 'content'],
      threshold: 0.3,
      includeScore: true
    });

    // 応急処置ガイドの初期化
    const emergencyFiles = await fs.readdir(this.emergencyGuidePath);
    const emergencyItems = [];

    for (const file of emergencyFiles) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(this.emergencyGuidePath, file), 'utf-8');
        const guide = JSON.parse(content);
        emergencyItems.push(guide);
      }
    }

    this.emergencyFuse = new Fuse(emergencyItems, {
      keys: ['title', 'description', 'steps', 'keywords'],
      threshold: 0.4,
      includeScore: true
    });
  }

  async search(query: string): Promise<SearchResult> {
    // Fuse.jsでメタデータを検索
    const fuseResults = this.fuse.search(query);
    
    // 関連する画像を取得
    const images = fuseResults
      .map(result => result.item.images)
      .flat()
      .filter(Boolean);

    // 応急処置ガイドを検索
    const emergencyResults = this.emergencyFuse.search(query);
    const emergencyGuides = emergencyResults.map(result => ({
      title: result.item.title,
      description: result.item.description,
      imageUrl: result.item.imageUrl,
      steps: result.item.steps,
      score: result.score
    }));

    // GPTでテキスト検索と回答生成
    const gptResponse = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that provides accurate information based on the knowledge base and emergency guides."
        },
        {
          role: "user",
          content: query
        }
      ]
    });

    return {
      text: gptResponse.choices[0].message.content || '',
      images,
      emergencyGuides,
      metadata: fuseResults.map(result => result.item)
    };
  }

  async updateSearchIndex() {
    await this.initializeFuse();
  }
} 