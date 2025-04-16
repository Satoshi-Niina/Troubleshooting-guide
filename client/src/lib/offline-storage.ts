import localforage from 'localforage';

// データベースのストア名定義
const STORES = {
  UNSYNCED_MESSAGES: 'unsynced-messages',
  UNSYNCED_MEDIA: 'unsynced-media',
  SYNC_STATUS: 'sync-status'
};

// チャットデータ用のストレージ
const messageStore = localforage.createInstance({
  name: 'chat-app',
  storeName: STORES.UNSYNCED_MESSAGES
});

// メディア（画像）用のストレージ
const mediaStore = localforage.createInstance({
  name: 'chat-app',
  storeName: STORES.UNSYNCED_MEDIA
});

// 同期ステータス用のストレージ
const syncStatusStore = localforage.createInstance({
  name: 'chat-app',
  storeName: STORES.SYNC_STATUS
});

// 未同期メッセージを保存
export async function storeUnsyncedMessage(chatId: number, message: any): Promise<void> {
  const key = `chat_${chatId}_msg_${message.id || Date.now()}`;
  await messageStore.setItem(key, message);
  await updateSyncStatus(chatId, false);
}

// 未同期メディアを保存
export async function storeUnsyncedMedia(chatId: number, messageId: number, media: any): Promise<void> {
  const key = `chat_${chatId}_msg_${messageId}_media_${media.id || Date.now()}`;
  await mediaStore.setItem(key, media);
  await updateSyncStatus(chatId, false);
}

// 同期ステータスを更新
async function updateSyncStatus(chatId: number, synced: boolean): Promise<void> {
  await syncStatusStore.setItem(`chat_${chatId}_synced`, synced);
}

// 特定チャットの未同期メッセージを取得
export async function getUnsyncedMessages(chatId: number): Promise<any[]> {
  const keys = await messageStore.keys();
  const chatMessages: any[] = [];
  
  for (const key of keys) {
    if (key.startsWith(`chat_${chatId}_msg_`)) {
      const message = await messageStore.getItem(key);
      if (message) {
        chatMessages.push({ key, message });
      }
    }
  }
  
  return chatMessages;
}

// 特定チャットの未同期メディアを取得
export async function getUnsyncedMedia(chatId: number, messageId?: number): Promise<any[]> {
  const keys = await mediaStore.keys();
  const chatMedia: any[] = [];
  
  const prefix = messageId 
    ? `chat_${chatId}_msg_${messageId}_media_`
    : `chat_${chatId}_msg_`;
  
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      const media = await mediaStore.getItem(key);
      if (media) {
        chatMedia.push({ key, media });
      }
    }
  }
  
  return chatMedia;
}

// メッセージとメディアを同期済みとしてマーク（ローカルストレージから削除）
export async function markAsSynced(keys: string[]): Promise<void> {
  for (const key of keys) {
    if (key.includes('_media_')) {
      await mediaStore.removeItem(key);
    } else if (key.includes('_msg_')) {
      await messageStore.removeItem(key);
    }
  }
}

// チャットの同期ステータスを取得
export async function isChatSynced(chatId: number): Promise<boolean> {
  const status = await syncStatusStore.getItem(`chat_${chatId}_synced`);
  return status === true;
}

// サイズを最適化してデータURLを作成（画像圧縮）
export async function optimizeImageDataUrl(dataUrl: string, maxWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // サイズが大きすぎる場合はリサイズ
      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = height * ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context could not be created'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // JPEGとして圧縮して出力（品質75%）
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = dataUrl;
  });
}

// データURLからBlobを作成
export function dataURLtoBlob(dataURL: string): Blob {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
}

// メッセージのバッチ取得（指定数ごとに分割）
export function getMessageBatches(messages: any[], batchSize = 10): any[][] {
  const batches = [];
  for (let i = 0; i < messages.length; i += batchSize) {
    batches.push(messages.slice(i, i + batchSize));
  }
  return batches;
}