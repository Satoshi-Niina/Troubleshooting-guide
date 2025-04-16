import { 
  getUnsyncedMessages, 
  getUnsyncedMedia, 
  markAsSynced,
  getMessageBatches,
  dataURLtoBlob
} from './offline-storage';
import { requestBackgroundSync } from './service-worker';

// APIリクエストを送信する関数
async function apiRequest(method: string, url: string, data?: any) {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return response;
}

// メディアファイルをアップロードする関数
async function uploadMedia(mediaData: any) {
  // データURLからBlobに変換
  const blob = dataURLtoBlob(mediaData.url);
  
  // FormDataを作成
  const formData = new FormData();
  formData.append('file', blob, `media_${Date.now()}.jpg`);
  formData.append('type', mediaData.type || 'image');
  
  // アップロード
  const response = await fetch('/api/media/upload', {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Media upload failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  return data.url; // サーバーが返す実際のURL
}

// メッセージバッチを同期する関数
async function syncMessageBatch(chatId: number, messageBatch: any[]) {
  const messages = [];
  const syncedKeys = [];
  
  // 各メッセージを処理
  for (const { key, message } of messageBatch) {
    try {
      // メッセージに関連するメディアを取得
      const mediaItems = await getUnsyncedMedia(chatId, message.id);
      const processedMedia = [];
      
      // 各メディアをアップロード
      for (const { key: mediaKey, media } of mediaItems) {
        try {
          const serverUrl = await uploadMedia(media);
          processedMedia.push({
            type: media.type || 'image',
            url: serverUrl,
            thumbnail: media.thumbnail
          });
          
          // 同期されたメディアをマーク
          syncedKeys.push(mediaKey);
        } catch (error) {
          console.error(`メディアの同期中にエラーが発生しました: ${mediaKey}`, error);
          // このメディアはスキップするが、他は続行
        }
      }
      
      // メッセージを同期用に準備
      const syncedMessage = {
        ...message,
        media: processedMedia
      };
      
      messages.push(syncedMessage);
      syncedKeys.push(key);
    } catch (error) {
      console.error(`メッセージの同期中にエラーが発生しました: ${key}`, error);
      // このメッセージはスキップするが、他は続行
    }
  }
  
  if (messages.length === 0) {
    return { success: false, syncedCount: 0 };
  }
  
  try {
    // メッセージバッチをサーバーに送信
    await apiRequest('POST', `/api/chats/${chatId}/sync-messages`, { messages });
    
    // 同期されたメッセージとメディアをマーク
    await markAsSynced(syncedKeys);
    
    return { success: true, syncedCount: messages.length };
  } catch (error) {
    console.error('メッセージバッチの同期中にエラーが発生しました:', error);
    return { success: false, syncedCount: 0, error };
  }
}

// チャットの同期を実行する関数
export async function syncChat(chatId: number, batchSize = 5): Promise<{
  success: boolean;
  totalSynced: number;
  error?: any;
}> {
  try {
    // 未同期のメッセージを取得
    const unsyncedMessages = await getUnsyncedMessages(chatId);
    
    if (unsyncedMessages.length === 0) {
      console.log(`チャット ${chatId} には同期が必要なメッセージがありません`);
      return { success: true, totalSynced: 0 };
    }
    
    console.log(`チャット ${chatId} の ${unsyncedMessages.length} 件のメッセージを同期します`);
    
    // メッセージをバッチに分割
    const batches = getMessageBatches(unsyncedMessages, batchSize);
    let totalSynced = 0;
    
    // 各バッチを同期
    for (const batch of batches) {
      const result = await syncMessageBatch(chatId, batch);
      
      if (result.success) {
        totalSynced += result.syncedCount;
      }
    }
    
    // 同期が必要なメッセージが残っているか確認
    const remainingMessages = await getUnsyncedMessages(chatId);
    
    if (remainingMessages.length > 0) {
      // バックグラウンド同期を登録して残りを後で処理
      await requestBackgroundSync();
    }
    
    return { success: true, totalSynced };
  } catch (error) {
    console.error(`チャット ${chatId} の同期中にエラーが発生しました:`, error);
    return { success: false, totalSynced: 0, error };
  }
}

// すべてのチャットの同期を実行する関数
export async function syncAllChats(): Promise<{
  success: boolean;
  results: { chatId: number; synced: number; error?: any }[];
}> {
  try {
    // IndexedDBから未同期のメッセージキーを全て取得し、チャットIDを抽出
    const allMessages = await getUnsyncedMessages(0); // 0はダミー、実際は全メッセージを取得
    
    // チャットIDのセットを作成
    const chatIds = new Set<number>();
    allMessages.forEach(({ key }) => {
      const match = key.match(/chat_(\d+)_msg_/);
      if (match && match[1]) {
        chatIds.add(parseInt(match[1]));
      }
    });
    
    // 各チャットを同期
    const results = [];
    // Setを配列に変換してから処理
    const chatIdArray = Array.from(chatIds);
    for (const chatId of chatIdArray) {
      try {
        const result = await syncChat(chatId);
        results.push({
          chatId,
          synced: result.totalSynced,
          error: result.error
        });
      } catch (error) {
        results.push({
          chatId,
          synced: 0,
          error
        });
      }
    }
    
    return {
      success: results.some(r => !r.error),
      results
    };
  } catch (error) {
    console.error('すべてのチャットの同期中にエラーが発生しました:', error);
    return {
      success: false,
      results: []
    };
  }
}