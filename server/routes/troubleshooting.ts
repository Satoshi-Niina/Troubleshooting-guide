import { Response, Request, Express } from 'express';
import path from 'path';
import fs from 'fs';

// トラブルシューティングデータの格納ディレクトリ
const TROUBLESHOOTING_DIR = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');

// ディレクトリが存在することを確認
function ensureDirectoryExists(directory: string) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

// トラブルシューティングJSONファイルのロード
function loadTroubleshootingFile(filename: string) {
  try {
    const filePath = path.join(TROUBLESHOOTING_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`トラブルシューティングファイルの読み込みに失敗しました: ${filename}`, error);
    return null;
  }
}

// トラブルシューティングファイルの保存
function saveTroubleshootingFile(filename: string, data: any) {
  try {
    const filePath = path.join(TROUBLESHOOTING_DIR, filename);
    const fileContent = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, fileContent, 'utf-8');
    return true;
  } catch (error) {
    console.error(`トラブルシューティングファイルの保存に失敗しました: ${filename}`, error);
    return false;
  }
}

// トラブルシューティングルートの登録
export function registerTroubleshootingRoutes(app: Express) {
  // ディレクトリの存在を確認
  ensureDirectoryExists(TROUBLESHOOTING_DIR);
  
  // トラブルシューティングリストを取得
  app.get('/api/troubleshooting', (req: Request, res: Response) => {
    try {
      const files = fs.readdirSync(TROUBLESHOOTING_DIR);
      const troubleshootingList = files
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const data = loadTroubleshootingFile(file);
          if (!data) return null;
          
          return {
            id: data.id || path.basename(file, '.json'),
            title: data.title || '未設定タイトル',
            description: data.description || '',
            trigger: data.trigger || []
          };
        })
        .filter(Boolean); // nullを除外
      
      res.json(troubleshootingList);
    } catch (error) {
      console.error('トラブルシューティングリストの取得に失敗しました:', error);
      res.status(500).json({ error: 'トラブルシューティングリストの取得に失敗しました' });
    }
  });
  
  // 特定のトラブルシューティングデータを取得
  app.get('/api/troubleshooting/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const filename = `${id}.json`;
      const data = loadTroubleshootingFile(filename);
      
      if (!data) {
        return res.status(404).json({ error: 'トラブルシューティングデータが見つかりません' });
      }
      
      res.json(data);
    } catch (error) {
      console.error('トラブルシューティングデータの取得に失敗しました:', error);
      res.status(500).json({ error: 'トラブルシューティングデータの取得に失敗しました' });
    }
  });
  
  // トラブルシューティングデータの作成
  app.post('/api/troubleshooting/create', (req: Request, res: Response) => {
    try {
      const data = req.body;
      
      if (!data || !data.id) {
        return res.status(400).json({ error: 'データが無効です。IDは必須です。' });
      }
      
      // ファイル名として使用するIDを正規化（空白を除去し、安全な文字のみに）
      const safeId = data.id.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
      const filename = `${safeId}.json`;
      
      // 既存ファイルのチェック
      const existingFilePath = path.join(TROUBLESHOOTING_DIR, filename);
      if (fs.existsSync(existingFilePath)) {
        return res.status(409).json({ error: '同じIDのデータが既に存在します' });
      }
      
      // データの保存
      const success = saveTroubleshootingFile(filename, data);
      
      if (success) {
        res.status(201).json({ 
          message: 'トラブルシューティングデータを作成しました',
          id: safeId
        });
      } else {
        res.status(500).json({ error: 'データの保存に失敗しました' });
      }
    } catch (error) {
      console.error('トラブルシューティングデータの作成に失敗しました:', error);
      res.status(500).json({ error: 'データの作成に失敗しました' });
    }
  });
  
  // トラブルシューティングデータの更新
  app.post('/api/troubleshooting/update/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const data = req.body;
      
      if (!data) {
        return res.status(400).json({ error: 'データが無効です' });
      }
      
      // 既存データの確認
      const filename = `${id}.json`;
      const existingData = loadTroubleshootingFile(filename);
      
      if (!existingData) {
        return res.status(404).json({ error: '更新対象のデータが見つかりません' });
      }
      
      // 更新データの保存
      const success = saveTroubleshootingFile(filename, data);
      
      if (success) {
        res.json({ 
          message: 'トラブルシューティングデータを更新しました',
          id
        });
      } else {
        res.status(500).json({ error: 'データの更新に失敗しました' });
      }
    } catch (error) {
      console.error('トラブルシューティングデータの更新に失敗しました:', error);
      res.status(500).json({ error: 'データの更新に失敗しました' });
    }
  });
  
  // トラブルシューティングデータの削除
  app.delete('/api/troubleshooting/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const filename = `${id}.json`;
      const filePath = path.join(TROUBLESHOOTING_DIR, filename);
      
      // ファイルの存在確認
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '削除対象のデータが見つかりません' });
      }
      
      // ファイルの削除
      fs.unlinkSync(filePath);
      
      res.json({ 
        message: 'トラブルシューティングデータを削除しました',
        id
      });
    } catch (error) {
      console.error('トラブルシューティングデータの削除に失敗しました:', error);
      res.status(500).json({ error: 'データの削除に失敗しました' });
    }
  });
  
  // キーワードによるトラブルシューティング検索
  app.post('/api/troubleshooting/search', (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: '検索クエリが指定されていません' });
      }
      
      const files = fs.readdirSync(TROUBLESHOOTING_DIR);
      const searchResults = files
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const data = loadTroubleshootingFile(file);
          if (!data) return null;
          
          // 検索スコアの計算
          let score = 0;
          const lowerQuery = query.toLowerCase();
          
          // IDに検索語が含まれる場合
          if (data.id && data.id.toLowerCase().includes(lowerQuery)) {
            score += 10;
          }
          
          // 説明に検索語が含まれる場合
          if (data.description && data.description.toLowerCase().includes(lowerQuery)) {
            score += 5;
          }
          
          // タイトルに検索語が含まれる場合
          if (data.title && data.title.toLowerCase().includes(lowerQuery)) {
            score += 8;
          }
          
          // トリガーキーワードが一致する場合
          if (data.trigger && Array.isArray(data.trigger)) {
            const matchingTriggers = data.trigger.filter(function(trigger: unknown) {
              return typeof trigger === 'string' && trigger.toLowerCase().includes(lowerQuery);
            });
            score += matchingTriggers.length * 15;
          }
          
          // ステップ内容に検索語が含まれる場合
          if (data.steps && Array.isArray(data.steps)) {
            const matchingSteps = data.steps.filter(function(step: { message?: string }) {
              return step.message && typeof step.message === 'string' && step.message.toLowerCase().includes(lowerQuery);
            });
            score += matchingSteps.length * 2;
          }
          
          // スコアが0より大きい場合のみ結果に含める
          if (score > 0) {
            return {
              id: data.id || path.basename(file, '.json'),
              title: data.title || '',
              description: data.description || '',
              trigger: data.trigger || [],
              score
            };
          }
          
          return null;
        })
        .filter(Boolean) // nullを除外
        .sort((a: any, b: any) => (b?.score || 0) - (a?.score || 0)); // スコアの高い順にソート
      
      res.json(searchResults);
    } catch (error) {
      console.error('トラブルシューティング検索に失敗しました:', error);
      res.status(500).json({ error: '検索処理に失敗しました' });
    }
  });
}