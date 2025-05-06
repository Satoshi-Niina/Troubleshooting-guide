import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { log } from '../vite';

const router = express.Router();

// 応急処置フローの保存（クライアント側のエンドポイントに対応）
router.post('/save', async (req: Request, res: Response) => {
  try {
    const flowData = req.body;
    console.log('受信したフローデータ:', flowData);
    
    if (!flowData || !flowData.title) {
      console.error('無効なフローデータ:', flowData);
      return res.status(400).json({
        success: false,
        error: '無効なフローデータです'
      });
    }

    if (!flowData.id) {
      console.error('フローIDが未指定:', flowData);
      return res.status(400).json({
        success: false,
        error: 'フローIDが指定されていません'
      });
    }
    
    // 保存先のパスを取得（クライアントから指定されたパスを使用）
    const basePath = process.cwd();
    const savePath = flowData.savePath || path.join(basePath, 'knowledge-base', 'troubleshooting');
    console.log('保存先パス:', savePath);
    
    // パスの正規化
    const normalizedSavePath = path.normalize(savePath);
    console.log('正規化された保存先パス:', normalizedSavePath);
    
    // ディレクトリ存在確認と作成
    try {
      if (!fs.existsSync(normalizedSavePath)) {
        console.log('ディレクトリを作成します:', normalizedSavePath);
        fs.mkdirSync(normalizedSavePath, { recursive: true });
        console.log('ディレクトリ作成完了');
      }
      
      // ディレクトリの書き込み権限を確認
      try {
        const testFile = path.join(normalizedSavePath, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('書き込み権限確認OK');
      } catch (error) {
        console.error('書き込み権限エラー:', error);
        return res.status(500).json({
          success: false,
          error: '保存先ディレクトリへの書き込み権限がありません'
        });
      }
    } catch (error) {
      console.error('ディレクトリ操作エラー:', error);
      return res.status(500).json({
        success: false,
        error: '保存先ディレクトリの操作に失敗しました'
      });
    }
    
    // フローIDとタイムスタンプでファイル名を生成
    const fileName = `${flowData.id}.json`;
    const filePath = path.join(normalizedSavePath, fileName);
    console.log('フローファイルパス:', filePath);
    
    try {
      // フローデータをJSON形式で保存
      console.log('フローデータを保存します:', filePath);
      const jsonData = JSON.stringify(flowData, null, 2);
      fs.writeFileSync(filePath, jsonData, 'utf8');
      
      // 保存の確認
      if (!fs.existsSync(filePath)) {
        throw new Error('ファイルの保存に失敗しました');
      }
      
      log(`フローデータを保存しました: ${fileName}`);
      
      return res.status(200).json({
        success: true,
        id: flowData.id,
        message: 'フローデータが保存されました',
        filePath: filePath
      });
    } catch (error) {
      console.error('ファイル保存エラー:', error);
      return res.status(500).json({
        success: false,
        error: 'ファイルの保存中にエラーが発生しました',
        details: error instanceof Error ? error.message : '不明なエラー'
      });
    }
  } catch (error) {
    console.error('フロー保存エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'フローデータの保存中にエラーが発生しました',
      details: error instanceof Error ? error.message : '不明なエラー'
    });
  }
});

// フロー一覧の取得
router.get('/', async (req: Request, res: Response) => {
  try {
    const troubleshootingDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
    
    if (!fs.existsSync(troubleshootingDir)) {
      fs.mkdirSync(troubleshootingDir, { recursive: true });
      return res.status(200).json({ flows: [] });
    }
    
    const files = fs.readdirSync(troubleshootingDir)
      .filter(file => file.endsWith('.json') && !file.endsWith('_metadata.json') && file !== 'index.json');
    
    const flowList = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(troubleshootingDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const flowData = JSON.parse(content);
        
        flowList.push({
          id: flowData.id || file.replace('.json', ''),
          title: flowData.title || 'タイトルなし',
          description: flowData.description || '',
          type: flowData.type || '応急処置',
          createdAt: flowData.metadata?.createdAt || new Date().toISOString(),
          steps: flowData.steps || [],
          stepCount: flowData.steps ? flowData.steps.length : 0
        });
      } catch (err) {
        console.error(`フローファイル読み込みエラー (${file}):`, err);
      }
    }
    
    log(`${flowList.length}個のフローを取得しました`);
    return res.status(200).json({ flows: flowList });
  } catch (error) {
    console.error('フロー一覧取得エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'フロー一覧の取得中にエラーが発生しました'
    });
  }
});

// フロー詳細の取得
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'フローIDが指定されていません'
      });
    }
    
    const troubleshootingDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
    const filePath = path.join(troubleshootingDir, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: '指定されたフローが見つかりません'
      });
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const flowData = JSON.parse(content);
    
    return res.status(200).json(flowData);
  } catch (error) {
    console.error('フロー詳細取得エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'フロー詳細の取得中にエラーが発生しました'
    });
  }
});

// フローの削除
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'フローIDが指定されていません'
      });
    }
    
    const troubleshootingDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
    const filePath = path.join(troubleshootingDir, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: '指定されたフローが見つかりません'
      });
    }
    
    // ファイルの削除
    fs.unlinkSync(filePath);
    
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
    const indexPath = path.join('C:', 'Users', 'Satoshi Niina', 'OneDrive', 'Desktop', 'Troubleshooting-guide', 'knowledge-base', 'troubleshooting', 'index.json');
    
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

export default router;