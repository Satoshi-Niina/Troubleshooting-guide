// Service Worker for background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'chat-sync') {
    event.waitUntil(syncChatData());
  }
});

// メッセージ同期のためのイベント通知用チャネル
const messageChannel = new BroadcastChannel('chat-sync-channel');

// チャットデータを同期する関数
async function syncChatData() {
  console.log('バックグラウンド同期を開始します...');
  
  try {
    // クライアントに同期開始を通知
    messageChannel.postMessage({
      type: 'sync-started'
    });
    
    // クライアントアプリに同期処理を依頼
    // （IndexedDBへの直接アクセスはService Workerではなくクライアントサイドで行う）
    const clients = await self.clients.matchAll({ type: 'window' });
    
    if (clients.length > 0) {
      // アクティブなクライアントがある場合はメッセージを送信
      clients[0].postMessage({
        type: 'perform-chat-sync'
      });
    } else {
      // アクティブなクライアントがない場合は定期的に同期を試みる
      messageChannel.postMessage({
        type: 'sync-no-client',
        message: 'No active clients found, will retry when app reopens.'
      });
    }
    
    // 成功を返す（実際の同期はクライアントサイドで行われる）
    return true;
  } catch (error) {
    console.error('同期中にエラーが発生しました:', error);
    
    // エラーを通知
    messageChannel.postMessage({
      type: 'sync-error',
      error: error.message
    });
    
    // エラーを投げて再試行を促す
    throw error;
  }
}

// プッシュ通知の受信
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.body || 'メッセージの同期が必要です',
    icon: '/icon-192x192.png',
    badge: '/icon-badge.png',
    data: data
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || '同期状態の通知', 
      options
    )
  );
});

// 通知がクリックされたときの処理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

// インストール時の処理
self.addEventListener('install', (event) => {
  console.log('Service Workerをインストールしました。');
  self.skipWaiting();
});

// アクティベーション時の処理
self.addEventListener('activate', (event) => {
  console.log('Service Workerがアクティベートされました。');
  event.waitUntil(self.clients.claim());
});