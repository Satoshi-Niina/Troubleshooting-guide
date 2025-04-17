import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { log } from '../vite';

const router = express.Router();

// 応急処置フローの保存
router.post('/save-flow', async (req: Request, res: Response) => {
  try {
    const flowData = req.body;
    
    if (!flowData || !flowData.id || !flowData.title) {
      return res.status(400).json({
        success: false,
        error: '無効なフローデータです'
      });
    }
    
    // ディレクトリ存在確認
    const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
    }
    
    // フローIDとタイムスタンプでファイル名を生成
    const timestamp = Date.now();
    const fileName = `flow_${timestamp}.json`;
    const filePath = path.join(jsonDir, fileName);
    
    // メタデータファイル名
    const metadataFileName = `flow_${timestamp}_metadata.json`;
    const metadataFilePath = path.join(jsonDir, metadataFileName);
    
    // フローデータをJSON形式で保存
    fs.writeFileSync(filePath, JSON.stringify(flowData, null, 2));
    
    // メタデータを作成
    const metadata = {
      id: `flow_${timestamp}`,
      filePath: filePath,
      fileName: fileName,
      title: flowData.title,
      description: flowData.description || '',
      createdAt: new Date().toISOString(),
      type: 'flow',
      nodeCount: flowData.nodes ? flowData.nodes.length : 0,
      edgeCount: flowData.edges ? flowData.edges.length : 0
    };
    
    // メタデータをJSON形式で保存
    fs.writeFileSync(metadataFilePath, JSON.stringify(metadata, null, 2));
    
    // インデックスファイルを更新
    updateIndexFile(metadata);
    
    log(`フローデータを保存しました: ${fileName}`);
    
    return res.status(200).json({
      success: true,
      id: metadata.id,
      message: 'フローデータが保存されました'
    });
  } catch (error) {
    console.error('フロー保存エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'フローデータの保存中にエラーが発生しました'
    });
  }
});

// インデックスファイルを更新
function updateIndexFile(metadata: any) {
  try {
    const indexPath = path.join(process.cwd(), 'knowledge-base', 'index.json');
    let indexData: any = { lastUpdated: new Date().toISOString(), guides: [], fileCount: 0 };
    
    if (fs.existsSync(indexPath)) {
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      indexData = JSON.parse(indexContent);
    }
    
    // 既存のガイドリストを更新
    const existingIndex = indexData.guides.findIndex((g: any) => g.id === metadata.id);
    if (existingIndex >= 0) {
      indexData.guides[existingIndex] = metadata;
    } else {
      indexData.guides.push(metadata);
    }
    
    // ファイル数を更新
    indexData.fileCount = indexData.guides.length;
    indexData.lastUpdated = new Date().toISOString();
    
    // インデックスファイルを書き込み
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
    log(`インデックスファイルを更新しました: ${indexData.fileCount}件のガイド`);
  } catch (error) {
    console.error('インデックスファイル更新エラー:', error);
  }
}

// フロー一覧の取得
router.get('/list', async (req: Request, res: Response) => {
  try {
    const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
    
    if (!fs.existsSync(jsonDir)) {
      return res.status(200).json([]);
    }
    
    const files = fs.readdirSync(jsonDir)
      .filter(file => file.startsWith('flow_') && file.endsWith('_metadata.json'));
    
    const flowList = [];
    
    for (const file of files) {
      const filePath = path.join(jsonDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const metadata = JSON.parse(content);
      flowList.push(metadata);
    }
    
    return res.status(200).json(flowList);
  } catch (error) {
    console.error('フロー一覧取得エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'フロー一覧の取得中にエラーが発生しました'
    });
  }
});

// フロー詳細の取得
router.get('/detail/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'フローIDが指定されていません'
      });
    }
    
    const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
    const metadataPath = path.join(jsonDir, `${id}_metadata.json`);
    
    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({
        success: false,
        error: '指定されたフローが見つかりません'
      });
    }
    
    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);
    
    const flowPath = path.join(jsonDir, metadata.fileName);
    
    if (!fs.existsSync(flowPath)) {
      return res.status(404).json({
        success: false,
        error: 'フローデータファイルが見つかりません'
      });
    }
    
    const flowContent = fs.readFileSync(flowPath, 'utf-8');
    const flowData = JSON.parse(flowContent);
    
    return res.status(200).json({
      id: metadata.id,
      data: flowData
    });
  } catch (error) {
    console.error('フロー詳細取得エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'フロー詳細の取得中にエラーが発生しました'
    });
  }
});

// フローの削除
router.delete('/delete/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'フローIDが指定されていません'
      });
    }
    
    const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
    const metadataPath = path.join(jsonDir, `${id}_metadata.json`);
    
    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({
        success: false,
        error: '指定されたフローが見つかりません'
      });
    }
    
    // メタデータからファイル名を取得
    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);
    const flowPath = path.join(jsonDir, metadata.fileName);
    
    // ファイルの削除
    if (fs.existsSync(flowPath)) {
      fs.unlinkSync(flowPath);
    }
    
    // メタデータファイルの削除
    fs.unlinkSync(metadataPath);
    
    // インデックスファイルを更新
    updateIndexFileAfterDelete(id);
    
    log(`フローを削除しました: ${id}`);
    
    return res.status(200).json({
      success: true,
      message: 'フローが削除されました'
    });
  } catch (error) {
    console.error('フロー削除エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'フローの削除中にエラーが発生しました'
    });
  }
});

// 削除後にインデックスファイルを更新
function updateIndexFileAfterDelete(id: string) {
  try {
    const indexPath = path.join(process.cwd(), 'knowledge-base', 'index.json');
    
    if (!fs.existsSync(indexPath)) {
      return;
    }
    
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    let indexData = JSON.parse(indexContent);
    
    // 削除されたガイドを除外
    indexData.guides = indexData.guides.filter((guide: any) => guide.id !== id);
    
    // ファイル数を更新
    indexData.fileCount = indexData.guides.length;
    indexData.lastUpdated = new Date().toISOString();
    
    // インデックスファイルを書き込み
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
    log(`インデックスファイルを更新しました（削除後）: ${indexData.fileCount}件のガイド`);
  } catch (error) {
    console.error('インデックスファイル更新エラー（削除後）:', error);
  }
}

export const emergencyFlowRouter = router;