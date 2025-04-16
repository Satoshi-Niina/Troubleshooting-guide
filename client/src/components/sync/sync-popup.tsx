import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle,
  X,
  CloudSun,
  Upload,
  AlertTriangle
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AnimatePresence, motion } from 'framer-motion';

interface SyncPopupProps {
  visible: boolean;
  onClose: () => void;
  totalItems: number;
  syncedItems: number;
  status: 'idle' | 'syncing' | 'success' | 'error' | 'partial'; 
  errorMessage?: string;
}

export const SyncPopup: React.FC<SyncPopupProps> = ({
  visible,
  onClose,
  totalItems,
  syncedItems,
  status,
  errorMessage
}) => {
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (totalItems > 0) {
      setProgress(Math.floor((syncedItems / totalItems) * 100));
    } else {
      setProgress(0);
    }
  }, [syncedItems, totalItems]);

  // 自動閉じるタイマー（成功時）
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'success' && visible) {
      timer = setTimeout(() => {
        onClose();
      }, 3000); // 3秒後に自動的に閉じる
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [status, visible, onClose]);

  const getStatusIcon = () => {
    switch (status) {
      case 'syncing':
        return <CloudSun className="h-6 w-6 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-6 w-6 text-red-500" />;
      case 'partial':
        return <AlertTriangle className="h-6 w-6 text-amber-500" />;
      default:
        return <Upload className="h-6 w-6 text-gray-500" />;
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'syncing':
        return '同期中...';
      case 'success':
        return '同期完了';
      case 'error':
        return '同期エラー';
      case 'partial':
        return '一部同期完了';
      default:
        return '同期準備中';
    }
  };

  const getStatusDescription = () => {
    switch (status) {
      case 'syncing':
        return `${totalItems}件中${syncedItems}件が同期されました...`;
      case 'success':
        return `${totalItems}件のデータがすべて同期されました`;
      case 'error':
        return errorMessage || '同期中にエラーが発生しました';
      case 'partial':
        return `${totalItems}件中${syncedItems}件のみ同期されました`;
      default:
        return '同期を開始します...';
    }
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-4 right-4 z-50"
        >
          <Card className="w-80 shadow-lg">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex gap-3 items-center">
                  {getStatusIcon()}
                  <div>
                    <h3 className="font-semibold text-sm">{getStatusTitle()}</h3>
                    <p className="text-xs text-gray-500">{getStatusDescription()}</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0" 
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              {status === 'syncing' && (
                <div className="mt-3">
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-right mt-1 text-gray-500">{progress}%</p>
                </div>
              )}
            </CardContent>
            
            {(status === 'error' || status === 'partial') && (
              <CardFooter className="p-3 pt-0 flex justify-end">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    // 再試行アクション
                    toast({
                      title: "同期を再試行しています",
                      description: "未同期のデータの同期を再試行します..."
                    });
                    // 実際の再試行ロジックはここに実装（親コンポーネントから渡すことも可能）
                  }}
                >
                  再試行
                </Button>
              </CardFooter>
            )}
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
};