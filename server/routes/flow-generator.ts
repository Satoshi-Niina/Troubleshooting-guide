import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { processOpenAIRequest } from '../lib/openai';

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
    
    // GPTに渡すプロンプト
    const prompt = `以下の応急処置ガイドからトラブルシューティングフローを生成してください。
JSON形式で、以下のフィールドを含むようにしてください：
- id: ファイル名として使用される一意の識別子（アルファベット小文字とアンダースコアのみ）
- title: フローのタイトル
- description: フローの説明
- triggerKeywords: 関連するキーワードの配列
- steps: フローのステップ配列（各ステップには以下を含む）
  - id: ステップの一意の識別子
  - title: ステップのタイトル
  - description: ステップの詳細説明
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

フローは論理的に分岐して様々な条件に対応できるようにしてください。
また、作業手順は安全性を考慮して、危険なステップには適切な警告を含めてください。`;

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
    // ここに実装を追加

    res.json({
      success: true,
      message: 'フロー生成リクエストを受け付けました',
      status: 'processing'
    });
  } catch (error) {
    console.error('フロー生成エラー:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    });
  }
});

export const flowGeneratorRouter = router;