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
            description: data.description || data.title || '応急処置ガイド',
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
              description: data.description || data.title || '応急処置ガイド',
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