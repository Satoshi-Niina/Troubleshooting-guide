import { Message, Media, Chat, ChatExport } from "@shared/schema";

// キーワード抽出用の正規表現パターン
const COMPONENT_PATTERNS = {
  ENGINE: /エンジン|engine|機関|モーター/i,
  TRANSMISSION: /トランスミッション|変速機|ギア|transmission/i,
  BRAKE: /ブレーキ|制動|brake/i,
  ELECTRICAL: /電気|バッテリー|配線|電装|electrical|battery/i,
  HYDRAULIC: /油圧|ポンプ|hydraulic|pump/i,
  COOLING: /冷却|radiator|ラジエーター/i,
  FUEL: /燃料|ガソリン|diesel|燃料タンク|fuel/i,
  CONTROL: /制御|コントローラー|操作|control|controller/i,
  CHASSIS: /シャーシ|フレーム|車体|chassis|frame/i,
  WHEEL: /車輪|タイヤ|wheel|tire/i
};

// 症状抽出用の正規表現パターン
const SYMPTOM_PATTERNS = {
  NOT_STARTING: /始動しない|スタートしない|動かない|起動しない|start|starting/i,
  STOPPING: /停止|止まる|停まる|ストール|停止する|stopping|stall/i,
  NOISE: /音|振動|異音|ノイズ|うるさい|noise|vibration|sound/i,
  SMOKE: /煙|排気|スモーク|臭い|smoke|exhaust|smell/i,
  LEAK: /漏れ|漏油|液漏れ|leak|dripping|leaking/i,
  POWER_LOSS: /力が入らない|出力低下|パワーダウン|power loss|weak/i,
  OVERHEATING: /オーバーヒート|熱|過熱|温度|overheat|temperature|hot/i,
  WARNING_LIGHT: /警告灯|ランプ|表示|warning|light|indicator/i,
  RESPONSE: /反応|レスポンス|遅い|response|slow|delay/i,
  PERFORMANCE: /性能|パフォーマンス|efficiency|performance/i
};

// モデルタイプ判別用のキーワード
const MODEL_TYPE_KEYWORDS = {
  MC5000: ["MC-5000", "MC5000", "モーターカー5000", "5000型"],
  TR2500: ["TR-2500", "TR2500", "トロリー2500", "2500型"],
  KM350: ["KM-350", "KM350", "軌道モーターカー350", "350型"]
};

/**
 * テキストからコンポーネント関連のキーワードを抽出する
 */
export function extractComponentKeywords(text: string): string[] {
  const components: string[] = [];
  
  Object.entries(COMPONENT_PATTERNS).forEach(([component, pattern]) => {
    if (pattern.test(text)) {
      components.push(component.toLowerCase());
    }
  });
  
  return components;
}

/**
 * テキストから症状関連のキーワードを抽出する
 */
export function extractSymptomKeywords(text: string): string[] {
  const symptoms: string[] = [];
  
  Object.entries(SYMPTOM_PATTERNS).forEach(([symptom, pattern]) => {
    if (pattern.test(text)) {
      symptoms.push(symptom.toLowerCase());
    }
  });
  
  return symptoms;
}

/**
 * テキストから可能性のある機種モデルを判別する
 */
export function detectPossibleModels(text: string): string[] {
  const detectedModels: string[] = [];
  
  Object.entries(MODEL_TYPE_KEYWORDS).forEach(([model, keywords]) => {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        detectedModels.push(model);
        break;
      }
    }
  });
  
  return detectedModels;
}

/**
 * チャット履歴を外部システム用にフォーマットする
 */
export async function formatChatHistoryForExternalSystem(
  chat: Chat,
  messages: Message[],
  messageMedia: Record<number, Media[]>,
  exportRecord: ChatExport | null
): Promise<any> {
  // 全テキストを連結して機種判別用のデータを作成
  const allText = messages.map(msg => msg.content).join(" ");
  
  // 可能性のある機種モデルを検出
  const possibleModels = detectPossibleModels(allText);
  
  // コンポーネントと症状の抽出
  const mentionedComponents: Set<string> = new Set();
  const primarySymptoms: Set<string> = new Set();
  
  // 各メッセージを処理
  const formattedMessages = messages.map(message => {
    // メッセージごとにキーワード抽出
    const componentKeywords = extractComponentKeywords(message.content);
    const symptomKeywords = extractSymptomKeywords(message.content);
    
    // 全体の集合に追加
    componentKeywords.forEach(k => mentionedComponents.add(k));
    
    // ユーザーメッセージの場合のみ症状として記録
    if (!message.isAiResponse) {
      symptomKeywords.forEach(s => primarySymptoms.add(s));
    }
    
    // フォーマット済みメッセージを返す
    return {
      role: message.isAiResponse ? "assistant" : "user",
      content: message.content,
      timestamp: message.timestamp.toISOString(),
      keywords: [...componentKeywords, ...symptomKeywords],
      reference_images: messageMedia[message.id]?.map(media => media.url) || []
    };
  });
  
  // 最終的なフォーマット済みデータ
  return {
    session_id: `chat_${chat.id}`,
    timestamp: new Date().toISOString(),
    device_context: {
      model_type: "railway_maintenance_vehicle",
      possible_models: possibleModels.length > 0 ? possibleModels : ["MC-5000", "TR-2500", "KM-350"]
    },
    conversation: formattedMessages,
    diagnostics: {
      primary_symptoms: Array.from(primarySymptoms),
      component_mentions: Array.from(mentionedComponents),
      repair_context: "現場応急対応"
    },
    metadata: {
      chat_id: chat.id,
      user_id: chat.userId || 0,
      export_id: exportRecord?.id || 0
    }
  };
}