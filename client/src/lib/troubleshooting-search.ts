import Fuse from 'fuse.js';
import { apiRequest } from './queryClient';

// トラブルシューティングフローの検索用インターフェース
interface TroubleshootingStep {
  id: string;
  message: string;
  imageKeywords?: string[]; 
  keywords?: string[];
  options?: {
    text?: string;
    label?: string;
    next?: string;
    nextStep?: string;
  }[];
  next?: string;
  nextStep?: string;
  checklist?: string[];
  end?: boolean;
}

interface TroubleshootingFlow {
  id: string;
  title: string;
  description?: string;
  steps: TroubleshootingStep[];
}

// キャッシュされたフローデータ
let cachedFlows: TroubleshootingFlow[] = [];

// フローデータをロードする関数
async function loadTroubleshootingFlows(): Promise<TroubleshootingFlow[]> {
  try {
    // キャッシュがあればそれを使用
    if (cachedFlows.length > 0) {
      return cachedFlows;
    }
    
    // API経由でフロー一覧を取得
    const response = await apiRequest('GET', '/api/troubleshooting/flows');
    
    if (!response.ok) {
      throw new Error(`トラブルシューティングフロー取得エラー: ${response.status}`);
    }
    
    const flows = await response.json();
    
    // キャッシュに保存
    cachedFlows = flows;
    console.log(`${flows.length}件のトラブルシューティングフローを読み込みました`);
    
    return flows;
  } catch (error) {
    console.error('トラブルシューティングフロー読み込みエラー:', error);
    return [];
  }
}

// フロー検索用に全ステップを展開する関数
function extractAllSteps(flows: TroubleshootingFlow[]): any[] {
  const allSteps: any[] = [];
  
  flows.forEach(flow => {
    // フロー全体の情報を抽出
    const flowInfo = {
      id: flow.id,
      title: flow.title,
      description: flow.description || '',
      type: 'flow',
      searchText: `${flow.title} ${flow.description || ''}`
    };
    
    allSteps.push(flowInfo);
    
    // 各ステップの情報を抽出
    flow.steps.forEach(step => {
      // ステップのオプションからテキストを抽出
      const optionsText = step.options?.map(option => 
        `${option.label || ''} ${option.text || ''}`
      ).join(' ') || '';
      
      // チェックリストからテキストを抽出
      const checklistText = step.checklist?.join(' ') || '';
      
      // 検索用テキストを作成
      const searchText = `${flow.title} ${flow.description || ''} ${step.message} ${optionsText} ${checklistText}`;
      
      // キーワードを作成（imageKeywords + オプションのキーワード）
      const keywords = [
        ...(step.imageKeywords || []),
        ...(step.keywords || [])
      ];
      
      allSteps.push({
        id: step.id,
        flowId: flow.id,
        flowTitle: flow.title,
        message: step.message,
        type: 'step',
        searchText,
        keywords
      });
    });
  });
  
  return allSteps;
}

// テキストからトラブルシューティングフローを検索する関数
export async function searchTroubleshootingFlow(text: string): Promise<string | null> {
  try {
    // フローデータをロード
    const flows = await loadTroubleshootingFlows();
    
    if (flows.length === 0) {
      console.log('検索対象のフローがありません');
      return null;
    }
    
    // 全ステップを展開
    const allSteps = extractAllSteps(flows);
    
    // Fuseインスタンスを作成
    const fuse = new Fuse(allSteps, {
      includeScore: true,
      keys: [
        { name: 'searchText', weight: 1.0 },
        { name: 'keywords', weight: 1.5 },  // キーワードの重みを高く
        { name: 'message', weight: 0.8 },
        { name: 'flowTitle', weight: 0.7 }
      ],
      threshold: 0.4,
      ignoreLocation: true,
      useExtendedSearch: true,
      findAllMatches: true
    });
    
    // 検索実行
    const results = fuse.search(text);
    
    console.log(`"${text}"の検索結果:`, results.length > 0 ? results[0].score : '該当なし');
    
    if (results.length > 0) {
      // 最良の結果を選択
      const bestMatch = results[0].item;
      
      // スコアが低すぎる場合は該当なしとする
      if (results[0].score && results[0].score > 0.7) {
        console.log('検索スコアが低すぎるため該当なしとします:', results[0].score);
        return null;
      }
      
      // 結果がフロー全体の場合はそのIDを返す
      if (bestMatch.type === 'flow') {
        return bestMatch.id;
      }
      
      // 結果がステップの場合はそのフローIDを返す
      if (bestMatch.type === 'step') {
        return bestMatch.flowId || null;
      }
    }
    
    return null;
  } catch (error) {
    console.error('トラブルシューティングフロー検索エラー:', error);
    return null;
  }
}

// キャッシュをクリアする関数
export function clearTroubleshootingFlowCache() {
  cachedFlows = [];
}