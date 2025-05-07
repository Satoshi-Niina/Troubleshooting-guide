export const openDatabase = async () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('chat-app', 1);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // 未同期メッセージ用のストアを作成
      if (!db.objectStoreNames.contains('unsyncedMessages')) {
        const store = db.createObjectStore('unsyncedMessages', { keyPath: 'localId', autoIncrement: true });
        store.createIndex('by-chat', 'chatId', { unique: false });
      }
    };
  });
}; 