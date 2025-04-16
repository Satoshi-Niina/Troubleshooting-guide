import { apiRequest } from '@/lib/queryClient';
import { 
  getUnsyncedMessages, 
  markMessageAsSynced,
  markMediaAsSynced, 
  getChatSyncStats, 
  optimizeImageDataUrl 
} from './offline-storage';

/**
 * データURLをBlobに変換
 */
function dataURLtoBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
}

/**
 * Base64のデータURLからFileオブジェクトを作成
 */
function dataURLtoFile(dataUrl: string, filename: string): File {
  const blob = dataURLtoBlob(dataUrl);
  return new File([blob], filename, { type: blob.type });
}

/**
 * 指定されたチャットの未同期メッセージを同期
 */
export async function syncChat(chatId: number) {
  try {
    // 未同期メッセージを取得
    const messages = await getUnsyncedMessages(chatId);
    
    if (messages.length === 0) {
      console.log('同期するメッセージがありません');
      return { success: true, totalSynced: 0 };
    }
    
    console.log(`${messages.length}件のメッセージを同期します`);
    
    // メッセージを1件ずつ同期
    let syncedCount = 0;
    
    for (const message of messages) {
      // 既に同期済みの場合はスキップ
      if (message.synced) {
        continue;
      }
      
      try {
        // メッセージを送信
        const response = await apiRequest('POST', `/api/chats/${chatId}/messages`, {
          content: message.content,
          senderId: message.senderId,
          isAiResponse: message.isAiResponse
        });
        
        if (!response.ok) {
          console.error('メッセージの同期に失敗しました:', await response.text());
          continue;
        }
        
        const data = await response.json();
        
        // メッセージを同期済みとしてマーク
        await markMessageAsSynced(message.localId, data.id);
        
        // メディアがある場合は同期
        if (message.media && message.media.length > 0) {
          for (const media of message.media) {
            if (media.synced) continue;
            
            // 画像の場合は最適化
            let mediaUrl = media.url;
            if (media.type === 'image' && mediaUrl.startsWith('data:')) {
              try {
                mediaUrl = await optimizeImageDataUrl(mediaUrl, 0.8);
              } catch (err) {
                console.warn('画像の最適化に失敗しました:', err);
              }
            }
            
            // メディアデータを送信
            const formData = new FormData();
            
            if (mediaUrl.startsWith('data:')) {
              // データURLの場合はファイルに変換
              const file = dataURLtoFile(
                mediaUrl, 
                `media_${Date.now()}.${media.type === 'image' ? 'jpg' : 'mp4'}`
              );
              formData.append('file', file);
            } else {
              // 既存のURLはそのまま送信
              formData.append('url', mediaUrl);
            }
            
            formData.append('type', media.type);
            formData.append('messageId', data.id.toString());
            
            if (media.thumbnail) {
              formData.append('thumbnail', media.thumbnail);
            }
            
            const mediaResponse = await fetch(`/api/messages/${data.id}/media`, {
              method: 'POST',
              body: formData,
              credentials: 'include'
            });
            
            if (!mediaResponse.ok) {
              console.error('メディアの同期に失敗しました:', await mediaResponse.text());
              continue;
            }
            
            const mediaData = await mediaResponse.json();
            
            // メディアを同期済みとしてマーク
            await markMediaAsSynced(media.localId, mediaData.id);
          }
        }
        
        syncedCount++;
        
        // 進捗状況を通知
        window.dispatchEvent(new CustomEvent('sync-status-update', {
          detail: { 
            type: 'sync-progress',
            progress: Math.round((syncedCount / messages.length) * 100),
            syncedCount,
            totalCount: messages.length
          }
        }));
        
      } catch (error) {
        console.error('メッセージの同期処理中にエラーが発生しました:', error);
      }
    }
    
    // 同期結果を返す
    const stats = await getChatSyncStats(chatId);
    
    return { 
      success: true, 
      totalSynced: syncedCount,
      stats
    };
  } catch (error) {
    console.error('同期処理中にエラーが発生しました:', error);
    return { 
      success: false, 
      totalSynced: 0,
      error
    };
  }
}