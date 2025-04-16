import { Workbox, messageSW } from 'workbox-window';

// Service Worker インスタンス
let wb: Workbox | null = null;
// 同期チャネル
let syncChannel: BroadcastChannel | null = null;

// Service Worker の登録
export async function registerServiceWorker(): Promise<void> {
  if ('serviceWorker' in navigator) {
    wb = new Workbox('/sw.js');
    
    // Service Worker のイベントハンドラ
    wb.addEventListener('installed', (event) => {
      console.log('Service Worker がインストールされました:', event);
    });
    
    wb.addEventListener('activated', (event) => {
      console.log('Service Worker がアクティブになりました:', event);
    });
    
    // Service Worker からのメッセージハンドラ
    wb.addEventListener('message', (event) => {
      console.log('Service Worker からメッセージを受信:', event.data);
      
      if (event.data.type === 'perform-chat-sync') {
        // バックグラウンド同期の実行を通知
        const syncEvent = new CustomEvent('perform-chat-sync');
        window.dispatchEvent(syncEvent);
      }
    });
    
    // Service Worker の登録
    try {
      await wb.register();
      console.log('Service Worker が正常に登録されました');
      
      // 同期チャネルの初期化
      initSyncChannel();
      
      return true;
    } catch (error) {
      console.error('Service Worker の登録中にエラーが発生しました:', error);
      return false;
    }
  } else {
    console.warn('このブラウザは Service Worker をサポートしていません');
    return false;
  }
}

// 同期チャネルの初期化
function initSyncChannel() {
  try {
    syncChannel = new BroadcastChannel('chat-sync-channel');
    
    syncChannel.addEventListener('message', (event) => {
      console.log('同期チャネルからメッセージを受信:', event.data);
      
      // 同期ステータスの更新イベントを送信
      const syncStatusEvent = new CustomEvent('sync-status-update', {
        detail: event.data
      });
      window.dispatchEvent(syncStatusEvent);
    });
    
    console.log('同期チャネルを初期化しました');
  } catch (error) {
    console.error('同期チャネルの初期化中にエラーが発生しました:', error);
  }
}

// バックグラウンド同期のリクエスト
export async function requestBackgroundSync(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
    console.warn('このブラウザはバックグラウンド同期をサポートしていません');
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register('chat-sync');
    console.log('バックグラウンド同期が登録されました');
    return true;
  } catch (error) {
    console.error('バックグラウンド同期の登録中にエラーが発生しました:', error);
    return false;
  }
}

// Service Worker へのメッセージ送信
export async function sendMessageToSW(message: any): Promise<void> {
  if (!wb) {
    console.warn('Service Worker が登録されていません');
    return;
  }
  
  try {
    await messageSW(wb.controller, message);
  } catch (error) {
    console.error('Service Worker へのメッセージ送信中にエラーが発生しました:', error);
  }
}

// Service Worker の状態確認
export async function checkServiceWorkerStatus(): Promise<{
  registered: boolean;
  syncing: boolean;
}> {
  if (!('serviceWorker' in navigator)) {
    return { registered: false, syncing: false };
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncing = await isSyncRegistered(registration);
    
    return {
      registered: !!registration.active,
      syncing
    };
  } catch (error) {
    console.error('Service Worker の状態確認中にエラーが発生しました:', error);
    return { registered: false, syncing: false };
  }
}

// 同期が登録されているか確認
async function isSyncRegistered(registration: ServiceWorkerRegistration): Promise<boolean> {
  if (!('sync' in registration)) {
    return false;
  }
  
  try {
    const tags = await registration.sync.getTags();
    return tags.includes('chat-sync');
  } catch (error) {
    console.error('同期タグの確認中にエラーが発生しました:', error);
    return false;
  }
}