import { Chat, Message, ChatExport } from "@shared/schema";
import OpenAI from "openai";

// OpenAI クライアントを初期化
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 保守用車車両モデルのデータ
 */
interface VehicleModel {
  id: string;
  name: string;
  keywords: string[];
}

// 保守用車の車両モデルデータベース
const vehicleModels: VehicleModel[] = [
  {
    id: "mc3000",
    name: "モータカー3000",
    keywords: ["モータカー3000", "MC3000", "mc3000", "モーターカー3000"]
  },
  {
    id: "mc5000",
    name: "モータカー5000",
    keywords: ["モータカー5000", "MC5000", "mc5000", "モーターカー5000"]
  },
  {
    id: "mc7000",
    name: "モータカー7000",
    keywords: ["モータカー7000", "MC7000", "mc7000", "モーターカー7000"]
  },
  {
    id: "mt2000",
    name: "マルチプルタイタンパー2000",
    keywords: ["マルチプルタイタンパー", "MT2000", "mt2000", "タイタンパー"]
  },
  {
    id: "bb1000",
    name: "バラストブラシ1000",
    keywords: ["バラストブラシ", "BB1000", "bb1000", "ブラシ車"]
  }
];

/**
 * 症状データ
 */
interface Symptom {
  id: string;
  description: string;
  keywords: string[];
}

// 症状データベース
const symptoms: Symptom[] = [
  {
    id: "engine_stop",
    description: "エンジン停止",
    keywords: ["エンジン停止", "エンジンが止まる", "エンストール", "停止した", "切れた"]
  },
  {
    id: "engine_slow",
    description: "エンジン出力低下",
    keywords: ["出力低下", "パワーダウン", "力が出ない", "回転が落ちる", "弱くなった"]
  },
  {
    id: "engine_overheat",
    description: "エンジンオーバーヒート",
    keywords: ["オーバーヒート", "温度上昇", "熱くなった", "高温", "温度警告"]
  },
  {
    id: "brake_failure",
    description: "ブレーキ故障",
    keywords: ["ブレーキ故障", "効かない", "ブレーキ不良", "制動不良", "止まらない"]
  },
  {
    id: "hydraulic_leak",
    description: "油圧漏れ",
    keywords: ["油圧漏れ", "オイル漏れ", "漏油", "油圧低下", "油が漏れる"]
  },
  {
    id: "electrical_problem",
    description: "電気系統の問題",
    keywords: ["電気系統", "通電しない", "電気が来ない", "ショート", "電気故障"]
  },
  {
    id: "control_system",
    description: "制御システムの問題",
    keywords: ["制御系", "コントローラー", "操作不能", "反応しない", "パネル表示"]
  }
];

/**
 * コンポーネントデータ
 */
interface Component {
  id: string;
  name: string;
  keywords: string[];
}

// コンポーネントデータベース
const components: Component[] = [
  {
    id: "engine",
    name: "エンジン",
    keywords: ["エンジン", "機関", "モーター", "駆動系", "原動機"]
  },
  {
    id: "fuel_system",
    name: "燃料系統",
    keywords: ["燃料", "ガソリン", "軽油", "燃料ポンプ", "インジェクター", "燃料タンク"]
  },
  {
    id: "cooling_system",
    name: "冷却系統",
    keywords: ["冷却", "ラジエーター", "冷却水", "サーモスタット", "ウォーターポンプ"]
  },
  {
    id: "brake_system",
    name: "ブレーキ系統",
    keywords: ["ブレーキ", "制動", "ブレーキパッド", "ブレーキディスク", "ブレーキロック"]
  },
  {
    id: "hydraulic_system",
    name: "油圧系統",
    keywords: ["油圧", "ポンプ", "油圧シリンダー", "作動油", "バルブ"]
  },
  {
    id: "electrical_system",
    name: "電気系統",
    keywords: ["電気", "電装", "バッテリー", "配線", "発電機", "スターター"]
  },
  {
    id: "control_system",
    name: "制御系統",
    keywords: ["制御", "コントローラー", "ECU", "操作パネル", "センサー"]
  },
  {
    id: "transmission",
    name: "トランスミッション",
    keywords: ["ミッション", "変速機", "ギア", "クラッチ", "デフ"]
  }
];

/**
 * テキストからコンポーネント関連のキーワードを抽出する
 */
export function extractComponentKeywords(text: string): string[] {
  const foundComponents: string[] = [];
  
  components.forEach(component => {
    component.keywords.forEach(keyword => {
      if (text.includes(keyword) && !foundComponents.includes(component.name)) {
        foundComponents.push(component.name);
      }
    });
  });
  
  return foundComponents;
}

/**
 * テキストから症状関連のキーワードを抽出する
 */
export function extractSymptomKeywords(text: string): string[] {
  const foundSymptoms: string[] = [];
  
  symptoms.forEach(symptom => {
    symptom.keywords.forEach(keyword => {
      if (text.includes(keyword) && !foundSymptoms.includes(symptom.description)) {
        foundSymptoms.push(symptom.description);
      }
    });
  });
  
  return foundSymptoms;
}

/**
 * テキストから可能性のある機種モデルを判別する
 */
export function detectPossibleModels(text: string): string[] {
  const foundModels: string[] = [];
  
  vehicleModels.forEach(model => {
    model.keywords.forEach(keyword => {
      if (text.includes(keyword) && !foundModels.includes(model.name)) {
        foundModels.push(model.name);
      }
    });
  });
  
  return foundModels;
}

/**
 * チャット履歴を外部システム用にフォーマットする
 */
export async function formatChatHistoryForExternalSystem(
  chat: Chat,
  messages: Message[],
  messageMedia: Record<number, any[]>,
  lastExport: ChatExport | null
): Promise<any> {
  // チャット全体から抽出したメタデータ
  const allText = messages.map(msg => msg.content).join(' ');
  
  // 主要なメタデータ抽出
  const mentionedComponents = extractComponentKeywords(allText);
  const mentionedSymptoms = extractSymptomKeywords(allText);
  const possibleModels = detectPossibleModels(allText);
  
  // 会話履歴からの重要情報の抽出（必要に応じてOpenAI APIを使用）
  let primaryProblem = "";
  let problemDescription = "";
  let vehicleContext = "";
  
  try {
    // 最新のOpenAIモデルを使って追加コンテキストを抽出
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `あなたは保守用車の故障診断エキスパートです。以下のチャット履歴から重要な情報を抽出し、JSONフォーマットで返してください。
          抽出すべき情報：
          1. primary_problem: 主要な問題・故障（簡潔に）
          2. problem_description: 問題の説明（詳細に）
          3. vehicle_context: 車両の状況や環境に関する情報（できるだけ多く）`
        },
        {
          role: "user",
          content: messages.map(msg => 
            `${msg.isAiResponse ? "サポート: " : "ユーザー: "}${msg.content}`
          ).join('\n\n')
        }
      ],
      response_format: { type: "json_object" }
    });
    
    try {
      const aiExtractedData = JSON.parse(response.choices[0].message.content || "{}");
      primaryProblem = aiExtractedData.primary_problem || "";
      problemDescription = aiExtractedData.problem_description || "";
      vehicleContext = aiExtractedData.vehicle_context || "";
    } catch (parseError) {
      console.error("AIレスポンスのJSONパース失敗:", parseError);
    }
  } catch (aiError) {
    console.warn("AIによる情報抽出エラー:", aiError);
    // エラー時のフォールバック: キーワードベースの単純抽出
  }
  
  // 会話履歴を適切なフォーマットに変換
  const conversationHistory = messages.map(msg => {
    // メッセージに紐づくメディア情報
    const media = messageMedia[msg.id] || [];
    
    return {
      id: msg.id,
      timestamp: msg.timestamp.toISOString(),
      role: msg.isAiResponse ? "assistant" : "user",
      content: msg.content,
      media: media.map((m: any) => ({
        type: m.type,
        url: m.url,
        thumbnail: m.thumbnail
      }))
    };
  });
  
  // 診断情報ブロック
  const diagnostics = {
    components: mentionedComponents,
    symptoms: mentionedSymptoms,
    possible_models: possibleModels,
    primary_problem: primaryProblem,
    problem_description: problemDescription
  };
  
  // 最終的なフォーマット済みデータ
  const formattedData = {
    session_id: chat.id,
    timestamp: new Date().toISOString(),
    user_id: chat.userId,
    device_context: {
      detected_models: possibleModels,
      environment: vehicleContext,
      last_export: lastExport ? new Date(lastExport.timestamp).toISOString() : null
    },
    conversation_history: conversationHistory,
    diagnostics: diagnostics,
    metadata: {
      message_count: messages.length,
      has_images: Object.values(messageMedia).some(media => media.length > 0),
      extracted_timestamp: new Date().toISOString(),
      version: "1.0.0"
    }
  };
  
  return formattedData;
}