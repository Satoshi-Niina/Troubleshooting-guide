import { nanoid } from 'nanoid';

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

// 開発環境と本番環境のポート設定
//const DEV_PORT = '5001';
//const PROD_PORT = '3000';
const port = '5001';

export function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  //const port = process.env.NODE_ENV === 'development' ? DEV_PORT : PROD_PORT;
  const token = nanoid();

  const wsUrl = `${protocol}//${host}:${port}/ws?token=${token}`;
  console.log('WebSocket接続URL:', wsUrl);

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket接続が確立されました');
      reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocketメッセージを受信:', data);
        
        // メッセージタイプに応じた処理
        switch (data.type) {
          case 'system':
            console.log('システムメッセージ:', data.content);
            break;
          case 'chat':
            // チャットメッセージの処理
            break;
          default:
            console.log('未処理のメッセージタイプ:', data.type);
        }
      } catch (error) {
        console.error('WebSocketメッセージの処理中にエラー:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket接続が切断されました');
      ws = null;

      // 再接続の試行
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`${RECONNECT_DELAY}ms後に再接続を試みます (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(setupWebSocket, RECONNECT_DELAY);
      } else {
        console.error('最大再接続試行回数に達しました');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocketエラー:', error);
    };

    return ws;
  } catch (error) {
    console.error('WebSocket接続の確立中にエラー:', error);
    return null;
  }
}

export function closeWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function sendWebSocketMessage(message: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error('WebSocketが接続されていません');
  }
} 