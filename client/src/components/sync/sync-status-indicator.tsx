import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, CloudOff, CloudSun, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { isChatSynced } from '@/lib/offline-storage';
import { syncChat } from '@/lib/sync-api';

interface SyncStatusIndicatorProps {
  chatId: number;
  className?: string;
  onComplete?: () => void;
}

type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error' | 'pending';

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  chatId,
  className,
  onComplete
}) => {
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [progress, setProgress] = useState(100);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasPendingMessages, setHasPendingMessages] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { toast } = useToast();

  // オンライン状態を監視
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: 'オンラインに戻りました',
        description: 'ネットワーク接続が復旧しました。自動的に同期を開始します。',
        variant: 'default'
      });
      checkSyncStatus();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        title: 'オフラインになりました',
        description: 'ネットワーク接続が切断されました。接続が復旧すると自動的に同期します。',
        variant: 'destructive'
      });
      setStatus('offline');
    };

    const handleSyncStatusUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { type, error } = customEvent.detail;

      if (type === 'sync-started') {
        setStatus('syncing');
        setProgress(20);
      } else if (type === 'sync-complete') {
        setStatus('synced');
        setProgress(100);
        setHasPendingMessages(false);
        toast({
          title: '同期完了',
          description: 'すべてのメッセージが正常に同期されました。',
          variant: 'default'
        });
        if (onComplete) onComplete();
      } else if (type === 'sync-error') {
        setStatus('error');
        setSyncError(error);
        toast({
          title: '同期エラー',
          description: `同期中にエラーが発生しました: ${error}`,
          variant: 'destructive'
        });
      } else if (type === 'sync-progress') {
        setProgress(customEvent.detail.progress);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sync-status-update', handleSyncStatusUpdate);

    // 初期状態を確認
    checkSyncStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sync-status-update', handleSyncStatusUpdate);
    };
  }, [chatId, toast, onComplete]);

  // 同期状態を確認
  const checkSyncStatus = async () => {
    try {
      const synced = await isChatSynced(chatId);
      if (synced) {
        setStatus('synced');
        setHasPendingMessages(false);
      } else {
        setStatus('pending');
        setHasPendingMessages(true);
        
        if (isOnline) {
          // オンラインの場合は自動的に同期を開始
          handleManualSync();
        }
      }
    } catch (error) {
      console.error('同期状態の確認中にエラーが発生しました:', error);
    }
  };

  // 手動同期
  const handleManualSync = async () => {
    if (!isOnline) {
      toast({
        title: 'オフライン状態です',
        description: 'ネットワーク接続がありません。接続が復旧すると自動的に同期します。',
        variant: 'destructive'
      });
      return;
    }

    setStatus('syncing');
    setProgress(10);

    try {
      // 同期開始イベントを発火
      window.dispatchEvent(new CustomEvent('sync-status-update', {
        detail: { type: 'sync-started' }
      }));

      // 同期実行
      const result = await syncChat(chatId);

      if (result.success) {
        // 完了イベント
        window.dispatchEvent(new CustomEvent('sync-status-update', {
          detail: { 
            type: 'sync-complete',
            totalSynced: result.totalSynced
          }
        }));
        
        if (result.totalSynced > 0) {
          toast({
            title: '同期完了',
            description: `${result.totalSynced}件のメッセージが同期されました。`,
            variant: 'default'
          });
        } else {
          // 既に同期済み
          setStatus('synced');
        }
      } else {
        // エラーイベント
        window.dispatchEvent(new CustomEvent('sync-status-update', {
          detail: { 
            type: 'sync-error',
            error: result.error ? (result.error as Error).message : '同期に失敗しました'
          }
        }));
      }
    } catch (error: any) {
      // エラーイベント
      window.dispatchEvent(new CustomEvent('sync-status-update', {
        detail: { 
          type: 'sync-error',
          error: error?.message || '同期中にエラーが発生しました'
        }
      }));
    }
  };

  // ステータスに応じたアイコンとテキスト
  const getStatusInfo = () => {
    switch (status) {
      case 'synced':
        return {
          icon: <CheckCircle className="w-4 h-4 text-green-500" />,
          text: '同期済み',
          color: 'text-green-500'
        };
      case 'syncing':
        return {
          icon: <CloudSun className="w-4 h-4 text-blue-500 animate-spin" />,
          text: '同期中...',
          color: 'text-blue-500'
        };
      case 'offline':
        return {
          icon: <WifiOff className="w-4 h-4 text-amber-500" />,
          text: 'オフライン',
          color: 'text-amber-500'
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-4 h-4 text-red-500" />,
          text: '同期エラー',
          color: 'text-red-500'
        };
      case 'pending':
        return {
          icon: <CloudOff className="w-4 h-4 text-amber-500" />,
          text: '未同期',
          color: 'text-amber-500'
        };
      default:
        return {
          icon: <Wifi className="w-4 h-4" />,
          text: '接続中',
          color: 'text-gray-500'
        };
    }
  };

  const statusInfo = getStatusInfo();

  // コンパクト表示（アイコンのみ）
  if (!hasPendingMessages && status === 'synced') {
    return (
      <div className={cn("flex items-center", className)} title="同期済み">
        {statusInfo.icon}
      </div>
    );
  }

  // 詳細表示（ステータスと操作ボタン）
  return (
    <Card className={cn("w-full", className)}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {statusInfo.icon}
            <span className={cn("text-sm font-medium", statusInfo.color)}>
              {statusInfo.text}
            </span>
            {status === 'syncing' && (
              <Progress
                value={progress}
                className="h-2 w-20"
              />
            )}
          </div>
          
          {(status === 'error' || status === 'pending' || status === 'offline') && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={!isOnline}
            >
              再同期
            </Button>
          )}
        </div>
        
        {syncError && (
          <p className="text-xs text-red-500 mt-1">
            エラー: {syncError}
          </p>
        )}
      </CardContent>
    </Card>
  );
};