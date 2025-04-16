/**
 * Service Workerを登録する
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workerはこのブラウザではサポートされていません');
    return null;
  }
  
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Workerが登録されました:', registration.scope);
    return registration;
  } catch (error) {
    console.error('Service Workerの登録に失敗しました:', error);
    return null;
  }
}

/**
 * バックグラウンド同期をリクエスト
 */
export async function requestBackgroundSync(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workerはこのブラウザではサポートされていません');
    return false;
  }
  
  try {
    // Service Workerが準備できるまで待機
    const registration = await getServiceWorkerRegistration();
    if (!registration) {
      console.warn('Service Workerの登録が見つかりません');
      return false;
    }
    
    // 'sync'がサポートされているか確認
    if (!('sync' in registration)) {
      console.warn('バックグラウンド同期APIはこのブラウザではサポートされていません');
      return false;
    }
    
    // 同期タグを登録
    if (registration.sync) {
      await registration.sync.register('chat-sync');
    }
    console.log('バックグラウンド同期が登録されました');
    return true;
  } catch (error) {
    console.error('バックグラウンド同期の登録に失敗しました:', error);
    return false;
  }
}

/**
 * 現在のService Worker登録を取得
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  
  try {
    // 登録済みのService Workerを取得
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) {
      // 登録されていない場合は新規登録
      return await registerServiceWorker();
    }
    
    // 最初の登録を返す
    return registrations[0];
  } catch (error) {
    console.error('Service Worker登録の取得に失敗しました:', error);
    return null;
  }
}

/**
 * 同期タグが登録されているか確認
 */
export async function hasSyncRegistered(): Promise<boolean> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return false;
  }
  
  if (!('sync' in registration)) {
    return false;
  }
  
  try {
    if (registration.sync) {
      const tags = await registration.sync.getTags();
      return tags.includes('chat-sync');
    }
    return false;
  } catch (error) {
    console.error('同期タグの確認中にエラーが発生しました:', error);
    return false;
  }
}

/**
 * Service Workerのステータス通知を設定
 */
export function setupServiceWorkerMessages() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  
  // Service Workerからのメッセージリスナー
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    if (type === 'sync-status') {
      // 同期状態の更新イベントを発火
      window.dispatchEvent(new CustomEvent('sync-status-update', {
        detail: data
      }));
    }
  });
}

/**
 * モバイルデバイスかどうかを判定
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * iPadかどうかを判定
 */
export function isIPadDevice(): boolean {
  return /iPad/i.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * ネットワークの状態を取得
 */
export function getNetworkInfo(): { online: boolean, effectiveType?: string } {
  const online = navigator.onLine;
  // @ts-ignore - TS2339: effectiveTypeプロパティがConnection型に存在しない
  const effectiveType = navigator.connection?.effectiveType;
  
  return {
    online,
    effectiveType
  };
}