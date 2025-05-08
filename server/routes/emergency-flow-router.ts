import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { log } from '../vite';

const router = express.Router();

// トラブルシューティングデータを更新
router.post('/update-troubleshooting/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'IDが指定されていません'
      });
    }
    
    // IDがts_から始まる場合、prefixを削除
    const fileId = id.startsWith('ts_') ? id.replace('ts_', '') : id;
    
    // トラブルシューティングディレクトリのパス
    const troubleshootingDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
    if (!fs.existsSync(troubleshootingDir)) {
      fs.mkdirSync(troubleshootingDir, { recursive: true });
    }
    
    // ファイルパス
    const filePath = path.join(troubleshootingDir, `${fileId}.json`);
    
    // リクエストボディからデータを取得
    const troubleshootingData = req.body;
    
    // ファイルが存在するか確認
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: '指定されたトラブルシューティングファイルが見つかりません'
      });
    }
    
    // 更新日時を設定
    troubleshootingData.updatedAt = new Date().toISOString();
    
    // ファイルに書き込み
    fs.writeFileSync(filePath, JSON.stringify(troubleshootingData, null, 2));
    
    log(`トラブルシューティングデータを更新しました: ${fileId}.json`);
    
    return res.status(200).json({
      success: true,
      message: 'トラブルシューティングデータが更新されました'
    });
  } catch (error) {
    console.error('トラブルシューティング更新エラー:', error);
    return res.status(500).json({
      success: false,
      error: 'トラブルシューティングデータの更新中にエラーが発生しました'
    });
  }
});

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
    const troubleshootingDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
    
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
    }
    
    const flowList = [];
    
    // JSONディレクトリからメタデータを読み込む
    if (fs.existsSync(jsonDir)) {
      const jsonFiles = fs.readdirSync(jsonDir)
        .filter(file => (file.endsWith('_metadata.json') || file.includes('example_flow_metadata')));
      
      let jsonMetadataCount = 0;
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(jsonDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const metadata = JSON.parse(content);
          flowList.push({
            ...metadata,
            source: 'json'
          });
          jsonMetadataCount++;
        } catch (err) {
          console.error(`メタデータ読み込みエラー (${file}):`, err);
        }
      }
      
      log(`jsonDirから${jsonMetadataCount}個のメタデータファイルを取得しました`);
    }
    
    // トラブルシューティングディレクトリからJSONを読み込む
    if (fs.existsSync(troubleshootingDir)) {
      const tsFiles = fs.readdirSync(troubleshootingDir)
        .filter(file => file.endsWith('.json'));
      
      let tsCount = 0;
      for (const file of tsFiles) {
        try {
          const filePath = path.join(troubleshootingDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const tsData = JSON.parse(content);
          
          // IDとタイトルがある場合のみ追加
          if (tsData.id && tsData.title) {
            flowList.push({
              id: `ts_${file.replace('.json', '')}`,
              filePath: filePath,
              fileName: file,
              title: tsData.title,
              createdAt: new Date().toISOString(),
              slideCount: tsData.slides ? tsData.slides.length : 0,
              source: 'troubleshooting'
            });
            tsCount++;
          }
        } catch (err) {
          console.error(`トラブルシューティングファイル読み込みエラー (${file}):`, err);
        }
      }
      
      log(`troubleshootingDirから${tsCount}個のJSONファイルを取得しました`);
    }
    
    log(`合計${flowList.length}個のガイドを取得しました`);
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
    
    // トラブルシューティングのIDか通常フローのIDかを判断
    if (id.startsWith('ts_')) {
      // トラブルシューティングファイルの場合
      const troubleshootingDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
      const filename = id.replace('ts_', '') + '.json';
      const filePath = path.join(troubleshootingDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: '指定されたトラブルシューティングファイルが見つかりません'
        });
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const flowData = JSON.parse(content);
      
      return res.status(200).json({
        id: id,
        data: flowData
      });
    } else if (id === 'example_flow') {
      // サンプルフローの場合
      const jsonDir = path.join(process.cwd(), 'knowledge-base', 'json');
      const flowPath = path.join(jsonDir, 'example_flow.json');
      
      if (!fs.existsSync(flowPath)) {
        return res.status(404).json({
          success: false,
          error: 'サンプルフローファイルが見つかりません'
        });
      }
      
      const flowContent = fs.readFileSync(flowPath, 'utf-8');
      const flowData = JSON.parse(flowContent);
      
      return res.status(200).json({
        id: 'example_flow',
        data: flowData
      });
    } else {
      // 通常のフローファイルの場合
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
    }
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
    
    // トラブルシューティングIDの場合
    if (id.startsWith('ts_')) {
      const troubleshootingDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
      const filename = id.replace('ts_', '') + '.json';
      const filePath = path.join(troubleshootingDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: '指定されたトラブルシューティングファイルが見つかりません'
        });
      }
      
      // ファイルの削除
      fs.unlinkSync(filePath);
      
      log(`トラブルシューティングフローを削除しました: ${filename}`);
      
      return res.status(200).json({
        success: true,
        message: 'トラブルシューティングファイルが削除されました'
      });
    } else {
      // 通常のフローファイルの場合
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
    }
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