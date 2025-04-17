import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../vite';
import OpenAI from 'openai';

const router = Router();

// ディレクトリの設定
const troubleshootingDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
const knowledgeBaseDir = path.join(process.cwd(), 'knowledge-base');
const imagesDir = path.join(knowledgeBaseDir, 'images');

// ディレクトリの存在確認と作成
[troubleshootingDir, imagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// OpenAIクライアントの初期化
let openai: OpenAI;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} catch (error) {
  console.error('OpenAI初期化エラー:', error);
}

// ナレッジベースから関連資料を探す
async function findRelevantKnowledge(topic: string): Promise<string> {
  // ナレッジベースの索引ファイル
  const indexPath = path.join(knowledgeBaseDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return '';
  }

  try {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const index = JSON.parse(indexContent);
    const documents = index.documents || [];

    // 各ドキュメントからチャンクを抽出
    let allText = '';
    for (const doc of documents) {
      const docChunksPath = path.join(knowledgeBaseDir, 'documents', doc.id, 'chunks.json');
      if (fs.existsSync(docChunksPath)) {
        const chunksContent = fs.readFileSync(docChunksPath, 'utf8');
        const chunks = JSON.parse(chunksContent);
        
        // 各チャンクのテキストを連結
        for (const chunk of chunks) {
          if (chunk.text) {
            allText += chunk.text + '\n\n';
          }
        }
      }
    }

    return allText;
  } catch (error) {
    console.error('ナレッジベース検索エラー:', error);
    return '';
  }
}

// ガイドデータからフローを生成する関数
async function generateFlowFromGuide(guideId: string): Promise<any> {
  try {
    // アップロードされたガイドJSONを取得
    const jsonDir = path.join(process.cwd(), 'uploads', 'json');
    const files = fs.readdirSync(jsonDir)
      .filter(file => file.startsWith(guideId) && file.endsWith('_metadata.json'));
    
    if (files.length === 0) {
      throw new Error('ガイドデータが見つかりません');
    }
    
    const filePath = path.join(jsonDir, files[0]);
    const content = fs.readFileSync(filePath, 'utf8');
    const guideData = JSON.parse(content);
    
    // ガイドデータからテキストを抽出
    let guideText = '';
    
    // PowerPoint形式の場合
    if (guideData.metadata && guideData.slides) {
      guideText += `タイトル: ${guideData.metadata.タイトル}\n`;
      guideText += `説明: ${guideData.metadata.説明}\n\n`;
      
      // 各スライドの内容を追加
      for (const slide of guideData.slides) {
        guideText += `スライド ${slide.スライド番号}: ${slide.タイトル}\n`;
        
        if (slide.本文 && Array.isArray(slide.本文)) {
          slide.本文.forEach((text: string) => {
            guideText += `${text}\n`;
          });
        }
        
        if (slide.ノート) {
          guideText += `ノート: ${slide.ノート}\n`;
        }
        
        guideText += '\n';
      }
    }
    // JSON形式の応急処置フローの場合は、既に形式が整っているため変換不要
    else if (guideData.title && guideData.steps) {
      return guideData; // そのまま返す
    }
    
    // ナレッジベースから関連情報を取得
    const knowledgeText = await findRelevantKnowledge(guideData.metadata?.タイトル || '');
    
    // OpenAIを使用してフローを生成
    if (!openai || !process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI APIキーが設定されていません');
    }
    
    // フロー生成のためのプロンプト
    const prompt = `
あなたは機械保守の専門家です。以下の情報から応急処置手順のフローチャートを作成してください。
JSON形式で返してください。

--- 提供される情報 ---
${guideText}

--- ナレッジベースの情報 ---
${knowledgeText}

--- 出力形式 ---
以下のJSON形式で応急処置フローを作成してください：

{
  "id": "一意のID (英数字とアンダースコアのみ)",
  "title": "タイトル",
  "description": "説明文",
  "triggerKeywords": ["キーワード1", "キーワード2"],
  "steps": [
    {
      "id": "start",
      "title": "最初のステップタイトル",
      "message": "表示メッセージ",
      "options": [
        {
          "text": "選択肢のテキスト",
          "nextStep": "次のステップID"
        }
      ],
      "imageUrl": "/knowledge-base/images/engine_001.svg"
    },
    {
      "id": "end",
      "title": "終了",
      "message": "トラブルシューティングが完了しました。問題が解決しない場合は技術サポートにお問い合わせください。",
      "end": true
    }
  ]
}

注意点：
- 各ステップにはユニークなIDを付けてください
- 最初のステップはIDを "start" としてください
- 最後のステップはIDを "end" として、end: true を設定してください
- 選択肢には必ず nextStep を設定し、有効なステップIDを指定してください
- トラブルシューティングの流れが論理的に繋がるようにしてください
- 元のコンテンツの重要な情報をすべて含めてください
- シンプルで簡潔な指示文を心がけてください
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'あなたは応急処置ガイドを作成する専門家です。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    });

    const generatedContent = response.choices[0]?.message?.content || '';
    
    // JSON文字列を抽出してパース
    const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('有効なJSONレスポンスが生成されませんでした');
    }
    
    const flowData = JSON.parse(jsonMatch[0]);
    
    // 生成されたフローデータを保存
    const filename = `${flowData.id || 'flow_' + Date.now()}.json`;
    const outputPath = path.join(troubleshootingDir, filename);
    fs.writeFileSync(outputPath, JSON.stringify(flowData, null, 2), 'utf8');
    
    return {
      success: true,
      flowData,
      path: outputPath
    };
  } catch (error) {
    console.error('フロー生成エラー:', error);
    throw error;
  }
}

// 応急処置フローを生成するエンドポイント
router.post('/generate-from-guide/:guideId', async (req, res) => {
  try {
    const { guideId } = req.params;
    
    if (!guideId) {
      return res.status(400).json({
        success: false,
        error: 'ガイドIDが指定されていません'
      });
    }
    
    // ガイドデータからフローを生成
    const result = await generateFlowFromGuide(guideId);
    
    res.json({
      success: true,
      message: '応急処置フローが生成されました',
      flowData: result.flowData
    });
  } catch (error) {
    console.error('応急処置フロー生成エラー:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    });
  }
});

// 既存のテキストからフローを生成するエンドポイント
router.post('/generate-from-text', async (req, res) => {
  try {
    const { text, title } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'テキストが指定されていません'
      });
    }
    
    // OpenAIを使用してフローを生成
    if (!openai || !process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'OpenAI APIキーが設定されていません'
      });
    }
    
    // フロー生成のためのプロンプト
    const prompt = `
あなたは機械保守の専門家です。以下の情報から応急処置手順のフローチャートを作成してください。
JSON形式で返してください。

--- 提供される情報 ---
タイトル: ${title || '応急処置ガイド'}
内容:
${text}

--- 出力形式 ---
以下のJSON形式で応急処置フローを作成してください：

{
  "id": "一意のID (英数字とアンダースコアのみ)",
  "title": "タイトル",
  "description": "説明文",
  "triggerKeywords": ["キーワード1", "キーワード2"],
  "steps": [
    {
      "id": "start",
      "title": "最初のステップタイトル",
      "message": "表示メッセージ",
      "options": [
        {
          "text": "選択肢のテキスト",
          "nextStep": "次のステップID"
        }
      ]
    },
    {
      "id": "end",
      "title": "終了",
      "message": "トラブルシューティングが完了しました。問題が解決しない場合は技術サポートにお問い合わせください。",
      "end": true
    }
  ]
}

注意点：
- 各ステップにはユニークなIDを付けてください
- 最初のステップはIDを "start" としてください
- 最後のステップはIDを "end" として、end: true を設定してください
- 選択肢には必ず nextStep を設定し、有効なステップIDを指定してください
- トラブルシューティングの流れが論理的に繋がるようにしてください
- 元のコンテンツの重要な情報をすべて含めてください
- シンプルで簡潔な指示文を心がけてください
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'あなたは応急処置ガイドを作成する専門家です。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    });

    const generatedContent = response.choices[0]?.message?.content || '';
    
    // JSON文字列を抽出してパース
    const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        success: false,
        error: '有効なJSONレスポンスが生成されませんでした'
      });
    }
    
    const flowData = JSON.parse(jsonMatch[0]);
    
    // 生成されたフローデータを保存
    const filename = `${flowData.id || 'flow_' + Date.now()}.json`;
    const outputPath = path.join(troubleshootingDir, filename);
    fs.writeFileSync(outputPath, JSON.stringify(flowData, null, 2), 'utf8');
    
    res.json({
      success: true,
      message: '応急処置フローが生成されました',
      flowData
    });
  } catch (error) {
    console.error('テキストからのフロー生成エラー:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    });
  }
});

export const flowGeneratorRouter = router;