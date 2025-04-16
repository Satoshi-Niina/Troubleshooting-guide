import { openDB, IDBPDatabase } from 'idb';

/**
 * IndexedDBのデータベース定義
 */
interface SyncDB {
  unsyncedMessages: {
    key: number;
    value: {
      id?: number;
      localId: number;
      content: string;
      senderId: number | null;
      isAiResponse: boolean;
      timestamp: Date;
      chatId: number;
      synced: boolean;
    };
    indexes: { 'by-chat': number };
  };
  unsyncedMedia: {
    key: number;
    value: {
      id?: number;
      localId: number;
      messageId?: number;
      localMessageId: number;
      type: string;
      url: string;
      thumbnail?: string;
      synced: boolean;
    };
    indexes: { 'by-message': number };
  };
}

// データベース名とバージョン
const DB_NAME = 'chat-sync-db';
const DB_VERSION = 1;

/**
 * IndexedDBを開く
 */
async function openDatabase(): Promise<IDBPDatabase<SyncDB>> {
  return await openDB<SyncDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // 未同期メッセージ用のオブジェクトストア
      const messageStore = db.createObjectStore('unsyncedMessages', { 
        keyPath: 'localId',
        autoIncrement: true 
      });
      messageStore.createIndex('by-chat', 'chatId');
      
      // 未同期メディア用のオブジェクトストア
      const mediaStore = db.createObjectStore('unsyncedMedia', { 
        keyPath: 'localId',
        autoIncrement: true 
      });
      mediaStore.createIndex('by-message', 'localMessageId');
    }
  });
}

/**
 * 未同期メッセージをローカルストレージに保存
 */
export async function storeUnsyncedMessage(message: {
  content: string;
  senderId: number | null;
  isAiResponse: boolean;
  chatId: number;
}) {
  try {
    const db = await openDatabase();
    const tx = db.transaction('unsyncedMessages', 'readwrite');
    
    const localId = await tx.store.add({
      ...message,
      timestamp: new Date(),
      synced: false,
      localId: Date.now() // 一時的なローカルID
    });
    
    await tx.done;
    console.log('未同期メッセージをローカルに保存しました:', localId);
    return localId;
  } catch (error) {
    console.error('メッセージのローカル保存に失敗しました:', error);
    throw error;
  }
}

/**
 * 未同期メディアをローカルストレージに保存
 */
export async function storeUnsyncedMedia(media: {
  localMessageId: number;
  type: string;
  url: string;
  thumbnail?: string;
}) {
  try {
    const db = await openDatabase();
    const tx = db.transaction('unsyncedMedia', 'readwrite');
    
    const localId = await tx.store.add({
      ...media,
      synced: false,
      localId: Date.now() // 一時的なローカルID
    });
    
    await tx.done;
    console.log('未同期メディアをローカルに保存しました:', localId);
    return localId;
  } catch (error) {
    console.error('メディアのローカル保存に失敗しました:', error);
    throw error;
  }
}

/**
 * 特定のチャットの未同期メッセージを取得
 */
export async function getUnsyncedMessages(chatId: number) {
  try {
    const db = await openDatabase();
    const tx = db.transaction('unsyncedMessages', 'readonly');
    const index = tx.store.index('by-chat');
    
    const messages = await index.getAll(chatId);
    
    // メッセージに紐づくメディアも取得
    const messagesWithMedia = await Promise.all(
      messages.map(async (message) => {
        const mediaTx = db.transaction('unsyncedMedia', 'readonly');
        const mediaIndex = mediaTx.store.index('by-message');
        const media = await mediaIndex.getAll(message.localId);
        
        return {
          ...message,
          media: media.length > 0 ? media : undefined
        };
      })
    );
    
    await tx.done;
    return messagesWithMedia;
  } catch (error) {
    console.error('未同期メッセージの取得に失敗しました:', error);
    return [];
  }
}

/**
 * メッセージを同期済みにマーク
 */
export async function markMessageAsSynced(localId: number, serverId: number) {
  try {
    const db = await openDatabase();
    const tx = db.transaction('unsyncedMessages', 'readwrite');
    
    const message = await tx.store.get(localId);
    if (message) {
      message.synced = true;
      message.id = serverId;
      await tx.store.put(message);
    }
    
    await tx.done;
  } catch (error) {
    console.error('メッセージの同期状態の更新に失敗しました:', error);
    throw error;
  }
}

/**
 * メディアを同期済みにマーク
 */
export async function markMediaAsSynced(localId: number, serverId: number) {
  try {
    const db = await openDatabase();
    const tx = db.transaction('unsyncedMedia', 'readwrite');
    
    const media = await tx.store.get(localId);
    if (media) {
      media.synced = true;
      media.id = serverId;
      await tx.store.put(media);
    }
    
    await tx.done;
  } catch (error) {
    console.error('メディアの同期状態の更新に失敗しました:', error);
    throw error;
  }
}

/**
 * チャットが完全に同期されているか確認
 */
export async function isChatSynced(chatId: number): Promise<boolean> {
  try {
    const db = await openDatabase();
    const tx = db.transaction('unsyncedMessages', 'readonly');
    const index = tx.store.index('by-chat');
    
    const messages = await index.getAll(chatId);
    const hasUnsyncedMessages = messages.some(msg => !msg.synced);
    
    await tx.done;
    return !hasUnsyncedMessages;
  } catch (error) {
    console.error('同期状態の確認に失敗しました:', error);
    return false;
  }
}

/**
 * チャットの同期統計を取得
 */
export async function getChatSyncStats(chatId: number) {
  try {
    const db = await openDatabase();
    const tx = db.transaction('unsyncedMessages', 'readonly');
    const index = tx.store.index('by-chat');
    
    const messages = await index.getAll(chatId);
    const total = messages.length;
    const synced = messages.filter(msg => msg.synced).length;
    
    await tx.done;
    return {
      total,
      synced,
      pending: total - synced,
      isFullySynced: total === synced
    };
  } catch (error) {
    console.error('同期統計の取得に失敗しました:', error);
    return { total: 0, synced: 0, pending: 0, isFullySynced: true };
  }
}

/**
 * 画像DataURLを最適化（サイズ削減）
 */
export async function optimizeImageDataUrl(dataUrl: string, quality = 0.8, maxWidth = 1200) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      
      // 最大幅に合わせてサイズを調整
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = height * ratio;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('キャンバスコンテキストの取得に失敗しました'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // 最適化した画像を取得
      const optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(optimizedDataUrl);
    };
    
    img.onerror = () => {
      reject(new Error('画像の読み込みに失敗しました'));
    };
    
    img.src = dataUrl;
  });
}

/**
 * 同期済みのメッセージとメディアをクリーンアップ
 */
export async function cleanupSyncedData() {
  try {
    const db = await openDatabase();
    
    // 同期済みメッセージを削除
    const messageTx = db.transaction('unsyncedMessages', 'readwrite');
    const messages = await messageTx.store.getAll();
    
    for (const message of messages) {
      if (message.synced) {
        await messageTx.store.delete(message.localId);
      }
    }
    
    await messageTx.done;
    
    // 同期済みメディアを削除
    const mediaTx = db.transaction('unsyncedMedia', 'readwrite');
    const mediaItems = await mediaTx.store.getAll();
    
    for (const media of mediaItems) {
      if (media.synced) {
        await mediaTx.store.delete(media.localId);
      }
    }
    
    await mediaTx.done;
    
    console.log('同期済みデータのクリーンアップが完了しました');
  } catch (error) {
    console.error('同期済みデータのクリーンアップに失敗しました:', error);
  }
}