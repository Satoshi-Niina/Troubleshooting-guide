import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { processOpenAIRequest } from '../lib/openai';
import { searchKnowledgeBase } from '../lib/knowledge-base';

const router = Router();

// 知識ベースディレクトリ
const knowledgeBaseDir = './knowledge-base';
const jsonDir = path.join(knowledgeBaseDir, 'json');
const troubleshootingDir = path.join(knowledgeBaseDir, 'troubleshooting');

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(troubleshootingDir)) {
  fs.mkdirSync(troubleshootingDir, { recursive: true });
}

// ガイドデータからフローを自動生成するエンドポイント
router.post('/generate-from-guide/:id', async (req, res) => {
  try {
    const guideId = req.params.id;
    
    // JSONファイルを検索
    const files = fs.readdirSync(jsonDir)
      .filter(file => file.startsWith(guideId) && file.endsWith('_metadata.json'));
    
    if (files.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'ガイドデータが見つかりません' 
      });
    }
    
    const filePath = path.join(jsonDir, files[0]);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const guideData = JSON.parse(fileContent);
    
    // タイトルと説明を取得
    const title = guideData.metadata?.タイトル || 'タイトルなし';
    const description = guideData.metadata?.説明 || '';
    
    // 本文テキストを抽出
    let contentText = '';
    
    if (guideData.slides && Array.isArray(guideData.slides)) {
      for (const slide of guideData.slides) {
        contentText += `## ${slide.タイトル || 'スライド'}\n`;
        
        if (slide.本文 && Array.isArray(slide.本文)) {
          slide.本文.forEach((text: string) => {
            contentText += `${text}\n`;
          });
        }
        
        if (slide.ノート) {
          contentText += `【ノート】: ${slide.ノート}\n`;
        }
        
        contentText += '\n';
      }
    }
    
    // ナレッジベースから関連情報を検索
    console.log('ナレッジベースから関連情報を検索中...');
    // タイトルとコンテンツテキストを組み合わせて検索クエリを作成
    const searchQuery = `${title} ${description}`.split(' ').slice(0, 10).join(' ');
    console.log(`検索クエリ: "${searchQuery}"`);
    
    const relevantChunks = await searchKnowledgeBase(searchQuery);
    console.log(`関連チャンク数: ${relevantChunks.length}`);
    
    // 関連情報をプロンプトに追加するための文字列を構築
    let relatedKnowledgeText = '';
    if (relevantChunks.length > 0) {
      relatedKnowledgeText = '\n\n【関連する知識ベース情報】:\n';
      // 最大5チャンクまで追加（多すぎるとトークン数制限に達する可能性がある）
      const chunksToInclude = relevantChunks.slice(0, 5);
      
      for (const chunk of chunksToInclude) {
        relatedKnowledgeText += `---\n出典: ${chunk.metadata.source || '不明'}\n\n${chunk.text}\n---\n\n`;
      }
    }
    
    // GPTに渡す強化されたプロンプト
    const prompt = `以下の応急処置ガイドからトラブルシューティングフローを生成してください。
JSON形式で、以下のフィールドを含むようにしてください：
- id: ファイル名として使用される一意の識別子（アルファベット小文字とアンダースコアのみ）
- title: フローのタイトル
- description: フローの説明
- triggerKeywords: 関連するキーワードの配列（重要な専門用語、部品名、症状を必ず含める）
- steps: フローのステップ配列（各ステップには以下を含む）
  - id: ステップの一意の識別子
  - title: ステップのタイトル
  - description: ステップの詳細説明（具体的かつ技術的に正確であること）
  - imageUrl: 画像URL（もしあれば）または空文字列
  - options: 次のステップへの選択肢の配列（各選択肢には以下を含む）
    - text: 選択肢のテキスト
    - nextStepId: 次のステップID
    - isTerminal: 終端フラグ（これが最終ステップなら true）

以下が応急処置ガイドのコンテンツです：

【タイトル】: ${title}
【説明】: ${description}

【コンテンツ】:
${contentText}
${relatedKnowledgeText}

フロー生成に関する重要なガイドライン：
1. フローは論理的に分岐して様々な条件に対応できるようにしてください。少なくとも2つ以上の分岐を含めます。
2. 作業手順は安全性を優先し、危険なステップには適切な警告を含めてください。
3. 保守用車の専門的な知識（上記の関連知識ベース情報）を活用して、技術的に正確な手順を作成してください。
4. トラブルシューティングの初期ステップでは、複数の可能性のある原因を調査するための選択肢を提供してください。
5. ステップIDは重複せず、論理的に追跡可能な形式（例: step1, step2a, step2b）を使用してください。
6. 最終ステップではアクションの結果と次のステップ（完了または別の専門家への相談）を明確に示してください。`;

    // OpenAIでフローを生成
    console.log('OpenAIにフロー生成をリクエスト中...');
    const generatedFlow = await processOpenAIRequest(prompt);
    
    let flowData;
    try {
      // JSONとして解析
      flowData = JSON.parse(generatedFlow.trim());
      
      // IDが設定されていない場合はファイル名から生成
      if (!flowData.id) {
        // タイトルからIDを生成（小文字化してスペースをアンダースコアに置換）
        const generatedId = title.toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .substring(0, 50); // 長すぎる場合は切り詰め
        
        flowData.id = generatedId;
      }
      
      // フローのファイルパス
      const flowFilePath = path.join(troubleshootingDir, `${flowData.id}.json`);
      
      // 既存のファイル名と競合しないように確認
      let finalId = flowData.id;
      let counter = 1;
      
      while (fs.existsSync(path.join(troubleshootingDir, `${finalId}.json`))) {
        finalId = `${flowData.id}_${counter}`;
        counter++;
      }
      
      flowData.id = finalId;
      
      // フローをファイルに保存
      fs.writeFileSync(
        path.join(troubleshootingDir, `${flowData.id}.json`),
        JSON.stringify(flowData, null, 2)
      );
      
      // 成功レスポンス
      res.json({
        success: true,
        message: `フローが正常に生成されました: ${flowData.title}`,
        flowData
      });
      
    } catch (parseError) {
      console.error('生成されたフローの解析エラー:', parseError);
      console.error('生成されたテキスト:', generatedFlow);
      
      res.status(500).json({
        success: false,
        error: 'フローデータの解析に失敗しました',
        rawResponse: generatedFlow
      });
    }
    
  } catch (error) {
    console.error('フロー生成エラー:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    });
  }
});

// ファイルアップロード時に自動的にフローを生成するエンドポイント
router.post('/generate-from-uploaded-file/:documentId', async (req, res) => {
  try {
    const documentId = req.params.documentId;
    console.log(`アップロードされたファイル ${documentId} からフローを生成します`);
    
    // アップロードされたファイルのメタデータを検索
    const documentsDir = path.join(knowledgeBaseDir, 'documents', documentId);
    if (!fs.existsSync(documentsDir)) {
      return res.status(404).json({
        success: false,
        error: 'ドキュメントが見つかりません'
      });
    }
    
    // メタデータファイルを読み込み
    const metadataPath = path.join(documentsDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({
        success: false,
        error: 'メタデータファイルが見つかりません'
      });
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const title = metadata.title || 'タイトルなし';
    
    // チャンクファイルを読み込み
    const chunksPath = path.join(documentsDir, 'chunks.json');
    if (!fs.existsSync(chunksPath)) {
      return res.status(404).json({
        success: false,
        error: 'チャンクファイルが見つかりません'
      });
    }
    
    const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf-8'));
    const contentText = chunks.map((chunk: any) => chunk.text).join('\n\n');
    
    // ナレッジベースから関連情報を検索
    console.log('ナレッジベースから関連情報を検索中...');
    const searchQuery = title.split(' ').slice(0, 10).join(' ');
    console.log(`検索クエリ: "${searchQuery}"`);
    
    const relevantChunks = await searchKnowledgeBase(searchQuery);
    console.log(`関連チャンク数: ${relevantChunks.length}`);
    
    // 関連情報をプロンプトに追加するための文字列を構築
    let relatedKnowledgeText = '';
    if (relevantChunks.length > 0) {
      relatedKnowledgeText = '\n\n【関連する知識ベース情報】:\n';
      // 最大5チャンクまで追加（多すぎるとトークン数制限に達する可能性がある）
      const chunksToInclude = relevantChunks.slice(0, 5);
      
      for (const chunk of chunksToInclude) {
        relatedKnowledgeText += `---\n出典: ${chunk.metadata.source || '不明'}\n\n${chunk.text}\n---\n\n`;
      }
    }
    
    // GPTに渡す強化されたプロンプト
    const prompt = `以下の応急処置ガイドからトラブルシューティングフローを生成してください。
JSON形式で、以下のフィールドを含むようにしてください：
- id: ファイル名として使用される一意の識別子（アルファベット小文字とアンダースコアのみ）
- title: フローのタイトル
- description: フローの説明
- triggerKeywords: 関連するキーワードの配列（重要な専門用語、部品名、症状を必ず含める）
- steps: フローのステップ配列（各ステップには以下を含む）
  - id: ステップの一意の識別子
  - title: ステップのタイトル
  - description: ステップの詳細説明（具体的かつ技術的に正確であること）
  - imageUrl: 画像URL（もしあれば）または空文字列
  - options: 次のステップへの選択肢の配列（各選択肢には以下を含む）
    - text: 選択肢のテキスト
    - nextStepId: 次のステップID
    - isTerminal: 終端フラグ（これが最終ステップなら true）

以下が応急処置ガイドのコンテンツです：

【タイトル】: ${title}

【コンテンツ】:
${contentText}
${relatedKnowledgeText}

フロー生成に関する重要なガイドライン：
1. フローは論理的に分岐して様々な条件に対応できるようにしてください。少なくとも2つ以上の分岐を含めます。
2. 作業手順は安全性を優先し、危険なステップには適切な警告を含めてください。
3. 保守用車の専門的な知識（上記の関連知識ベース情報）を活用して、技術的に正確な手順を作成してください。
4. トラブルシューティングの初期ステップでは、複数の可能性のある原因を調査するための選択肢を提供してください。
5. ステップIDは重複せず、論理的に追跡可能な形式（例: step1, step2a, step2b）を使用してください。
6. 最終ステップではアクションの結果と次のステップ（完了または別の専門家への相談）を明確に示してください。`;
    
    // 処理を開始したことをクライアントに通知
    res.json({
      success: true,
      message: 'フロー生成を開始しました',
      status: 'processing'
    });
    
    // 非同期でフローを生成
    (async () => {
      try {
        console.log('OpenAIにフロー生成をリクエスト中...');
        const generatedFlow = await processOpenAIRequest(prompt);
        
        try {
          // JSONとして解析
          const flowData = JSON.parse(generatedFlow.trim());
          
          // IDが設定されていない場合はタイトルから生成
          let flowId = flowData.id || title.toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 50);
          
          // 既存のファイル名と競合しないように確認
          let finalId = flowId;
          let counter = 1;
          
          while (fs.existsSync(path.join(troubleshootingDir, `${finalId}.json`))) {
            finalId = `${flowId}_${counter}`;
            counter++;
          }
          
          flowData.id = finalId;
          
          // フローをファイルに保存
          fs.writeFileSync(
            path.join(troubleshootingDir, `${flowData.id}.json`),
            JSON.stringify(flowData, null, 2)
          );
          
          console.log(`フローが正常に生成されました: ${flowData.title}`);
        } catch (parseError) {
          console.error('生成されたフローの解析エラー:', parseError);
          console.error('生成されたテキスト:', generatedFlow);
        }
      } catch (error) {
        console.error('フロー生成エラー:', error);
      }
    })();
  } catch (error) {
    console.error('フロー生成エラー:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    });
  }
});

// キーワードからフローを直接生成するエンドポイント
router.post('/generate-flow', async (req, res) => {
  try {
    const { query, options } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'クエリが必要です'
      });
    }

    // ナレッジベースから関連情報を検索
    console.log('ナレッジベースから関連情報を検索中...');
    const searchQuery = query.split(' ').slice(0, 10).join(' ');
    console.log(`検索クエリ: "${searchQuery}"`);
    
    let relevantChunks = [];
    try {
      relevantChunks = await searchKnowledgeBase(searchQuery);
      console.log(`関連チャンク数: ${relevantChunks.length}`);
    } catch (searchError) {
      console.error('ナレッジベース検索エラー:', searchError);
      // 検索エラーが発生しても処理は続行
    }
    
    // 関連情報をプロンプトに追加するための文字列を構築
    let relatedKnowledgeText = '';
    if (relevantChunks.length > 0) {
      relatedKnowledgeText = '\n\n【関連する知識ベース情報】:\n';
      const chunksToInclude = relevantChunks.slice(0, 5);
      
      for (const chunk of chunksToInclude) {
        relatedKnowledgeText += `---\n出典: ${chunk.metadata?.source || '不明'}\n\n${chunk.text}\n---\n\n`;
      }
    }
    
    // GPTに渡すプロンプト
    const prompt = `以下のキーワードに基づいて、複数の応急処置フローの選択肢を生成してください。
応答は必ず以下の形式の有効なJSONで返してください：

{
  "options": [
    {
      "id": "一意のID",
      "summary": "フローの概要",
      "content": "詳細な手順（ステップごとに改行）",
      "type": "応急処置",
      "category": "カテゴリ名"
    }
  ]
}

キーワード: ${query}

${relatedKnowledgeText}

生成時の注意点：
1. 少なくとも3つの異なるアプローチの選択肢を提供してください
2. 各選択肢は異なる状況や原因を想定したものにしてください
3. 安全性を最優先し、危険な手順には適切な警告を含めてください
4. 専門的な知識を活用しつつ、明確で実行可能な手順を提供してください
5. 各ステップは具体的で、技術者でなくても理解できる説明を心がけてください

重要: 応答は必ず有効なJSONフォーマットにしてください。HTMLやその他のフォーマットは使用しないでください。`;

    // OpenAIでフローを生成
    console.log('OpenAIにフロー生成をリクエスト中...');
    const generatedFlow = await processOpenAIRequest(prompt);
    
    try {
      // 生成されたテキストからJSONの部分のみを抽出
      const jsonMatch = generatedFlow.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSONデータが見つかりません');
      }
      
      // JSONとして解析
      const flowData = JSON.parse(jsonMatch[0]);
      
      // 必要なフィールドの存在を確認
      if (!flowData.options || !Array.isArray(flowData.options)) {
        throw new Error('生成されたデータの形式が不正です');
      }
      
      // 各オプションにIDを付与（存在しない場合）
      flowData.options = flowData.options.map((option: any, index: number) => ({
        ...option,
        id: option.id || `flow_${Date.now()}_${index}`
      }));
      
      // 成功レスポンス
      res.json({
        success: true,
        options: flowData.options
      });
      
    } catch (parseError) {
      console.error('生成されたフローの解析エラー:', parseError);
      console.error('生成されたテキスト:', generatedFlow);
      
      res.status(500).json({
        success: false,
        error: 'フローデータの解析に失敗しました',
        details: parseError instanceof Error ? parseError.message : '不明なエラー'
      });
    }
  } catch (error) {
    console.error('フロー生成エラー:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    });
  }
});

export const flowGeneratorRouter = router;