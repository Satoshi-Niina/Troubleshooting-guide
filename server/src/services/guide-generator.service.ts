import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { pineconeService } from './pinecone.service';
import { embeddingService } from './embedding.service';
import { EmergencyGuideVector } from '../types/emergency-guide';
import { extractTextFromFile } from '../utils/file-utils';

class GuideGeneratorService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  // キーワードからガイドを生成
  async generateFromKeywords(keywords: string[]): Promise<EmergencyGuideVector> {
    try {
      // キーワードをベクトル化
      const keywordVector = await embeddingService.generateEmbedding(keywords.join(' '));
      
      // 類似ガイドを検索
      const similarGuides = await pineconeService.searchSimilarGuides(keywordVector);
      
      // GPTで新しいガイドを生成
      const prompt = `
        以下のキーワードと類似ガイドを参考に、新しい応急処置ガイドを生成してください。
        生成するガイドは以下の形式で出力してください：
        
        {
          "title": "ガイドのタイトル",
          "content": "ガイドの概要説明",
          "steps": ["手順1", "手順2", ...],
          "keywords": ["キーワード1", "キーワード2", ...],
          "category": "カテゴリ",
          "severity": "low|medium|high"
        }
        
        キーワード: ${keywords.join(', ')}
        
        類似ガイド:
        ${similarGuides.matches.map(guide => `
          タイトル: ${guide.metadata.title}
          内容: ${guide.metadata.content}
          手順: ${guide.metadata.steps.join('\n')}
        `).join('\n')}
      `;
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: "あなたは応急処置ガイドの専門家です。与えられた情報を元に、正確で分かりやすい応急処置ガイドを生成してください。" },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });
      
      const generatedGuide = JSON.parse(completion.choices[0].message.content);
      
      // 生成されたガイドをベクトル化
      const guideVector = await embeddingService.generateEmbedding(
        `${generatedGuide.title} ${generatedGuide.content} ${generatedGuide.steps.join(' ')}`
      );
      
      // Pineconeに保存
      const guideWithVector: EmergencyGuideVector = {
        id: uuidv4(),
        ...generatedGuide,
        vector: guideVector,
        lastUpdated: new Date().toISOString(),
        metadata: {
          source: 'keyword',
          originalFile: null
        }
      };
      
      await pineconeService.upsertGuide(guideWithVector);
      
      return guideWithVector;
    } catch (error) {
      console.error('Guide generation from keywords error:', error);
      throw new Error('ガイドの生成に失敗しました');
    }
  }

  // ファイルからガイドを生成
  async generateFromFile(file: Express.Multer.File): Promise<EmergencyGuideVector> {
    try {
      // ファイルからテキストを抽出
      const extractedText = await extractTextFromFile(file);
      
      // 抽出テキストをベクトル化
      const textVector = await embeddingService.generateEmbedding(extractedText);
      
      // 類似ガイドを検索
      const similarGuides = await pineconeService.searchSimilarGuides(textVector);
      
      // GPTで新しいガイドを生成
      const prompt = `
        以下のファイル内容と類似ガイドを参考に、新しい応急処置ガイドを生成してください。
        生成するガイドは以下の形式で出力してください：
        
        {
          "title": "ガイドのタイトル",
          "content": "ガイドの概要説明",
          "steps": ["手順1", "手順2", ...],
          "keywords": ["キーワード1", "キーワード2", ...],
          "category": "カテゴリ",
          "severity": "low|medium|high"
        }
        
        ファイル内容:
        ${extractedText}
        
        類似ガイド:
        ${similarGuides.matches.map(guide => `
          タイトル: ${guide.metadata.title}
          内容: ${guide.metadata.content}
          手順: ${guide.metadata.steps.join('\n')}
        `).join('\n')}
      `;
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: "あなたは応急処置ガイドの専門家です。与えられた情報を元に、正確で分かりやすい応急処置ガイドを生成してください。" },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      });
      
      const generatedGuide = JSON.parse(completion.choices[0].message.content);
      
      // 生成されたガイドをベクトル化
      const guideVector = await embeddingService.generateEmbedding(
        `${generatedGuide.title} ${generatedGuide.content} ${generatedGuide.steps.join(' ')}`
      );
      
      // Pineconeに保存
      const guideWithVector: EmergencyGuideVector = {
        id: uuidv4(),
        ...generatedGuide,
        vector: guideVector,
        lastUpdated: new Date().toISOString(),
        metadata: {
          source: 'file',
          originalFile: file.originalname
        }
      };
      
      await pineconeService.upsertGuide(guideWithVector);
      
      return guideWithVector;
    } catch (error) {
      console.error('Guide generation from file error:', error);
      throw new Error('ガイドの生成に失敗しました');
    }
  }
}

export const guideGeneratorService = new GuideGeneratorService(); 