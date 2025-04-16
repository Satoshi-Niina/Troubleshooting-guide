import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useChat } from '@/context/chat-context';
import { useAuth } from '@/context/auth-context';

interface TroubleshootingStep {
  id?: string;
  message: string;
  image?: string;
  imageUrl?: string; // imageUrlも追加
  options?: {
    text?: string;
    label?: string;
    next: string;
  }[];
  next?: string;
  checklist?: string[];
  end?: boolean;
}

interface TroubleshootingFlowProps {
  id: string;
  onComplete?: () => void;
  onExit?: () => void;
}

export default function TroubleshootingFlow({ id, onComplete, onExit }: TroubleshootingFlowProps) {
  const { toast } = useToast();
  const { sendEmergencyGuide } = useChat(); // ChatContextからsendEmergencyGuideを取得
  const { user } = useAuth(); // 認証状態を取得
  const [loading, setLoading] = useState(true);
  const [flowData, setFlowData] = useState<{
    id: string;
    steps: TroubleshootingStep[];
  } | null>(null);
  const [currentStep, setCurrentStep] = useState<TroubleshootingStep | null>(null);
  const [stepHistory, setStepHistory] = useState<string[]>([]);
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>({});
  const [imageLoading, setImageLoading] = useState(false);

  // フローデータを取得
  const fetchFlowData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/troubleshooting/${id}`, {
        credentials: 'include',
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setFlowData(data);
      
      // 最初のステップを設定
      if (data && data.steps && data.steps.length > 0) {
        setCurrentStep(data.steps[0]);
      }
    } catch (error) {
      console.error('トラブルシューティングデータの取得に失敗しました:', error);
      toast({
        title: 'エラー',
        description: 'トラブルシューティングデータの取得に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  // コンポーネントマウント時にデータを取得
  useEffect(() => {
    fetchFlowData();
  }, [fetchFlowData]);

  // チェックリストアイテム状態を管理
  useEffect(() => {
    if (currentStep?.checklist) {
      const initialState: Record<string, boolean> = {};
      currentStep.checklist.forEach((item, index) => {
        initialState[`${index}`] = false;
      });
      setChecklistItems(initialState);
    }
  }, [currentStep]);

  // 次のステップに進む
  const goToNextStep = useCallback((nextStepId: string) => {
    if (!flowData) return;

    // 現在のステップIDがあれば履歴に追加
    if (currentStep?.id) {
      setStepHistory(prev => [...prev, currentStep.id!]);
    }

    // 次のステップを探す
    const nextStep = flowData.steps.find(step => step.id === nextStepId);
    if (nextStep) {
      setCurrentStep(nextStep);
      // チェックリストをリセット
      setChecklistItems({});
    } else {
      toast({
        title: 'エラー',
        description: `次のステップ「${nextStepId}」が見つかりません`,
        variant: 'destructive',
      });
    }
  }, [currentStep, flowData, toast]);

  // 前のステップに戻る
  const goToPreviousStep = useCallback(() => {
    if (stepHistory.length === 0 || !flowData) return;
    
    // 履歴から最後のステップIDを取得
    const prevStepHistory = [...stepHistory];
    const prevStepId = prevStepHistory.pop();
    setStepHistory(prevStepHistory);
    
    // 前のステップを設定
    if (prevStepId) {
      const prevStep = flowData.steps.find(step => step.id === prevStepId);
      if (prevStep) {
        setCurrentStep(prevStep);
        setChecklistItems({});
      }
    } else {
      // 履歴にない場合は最初のステップに戻る
      setCurrentStep(flowData.steps[0]);
      setChecklistItems({});
    }
  }, [stepHistory, flowData]);

  // チェックリスト項目のトグル
  const toggleChecklistItem = (index: string) => {
    setChecklistItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // すべてのチェックリスト項目が完了しているか確認
  const isChecklistComplete = useCallback(() => {
    if (!currentStep?.checklist) return true;
    return Object.values(checklistItems).every(checked => checked);
  }, [currentStep, checklistItems]);

  // フローが完了した場合
  const handleComplete = useCallback(() => {
    toast({
      title: '完了',
      description: 'トラブルシューティングが完了しました',
    });
    onComplete?.();
  }, [toast, onComplete]);

  // オプション選択時の処理
  const handleOptionSelect = (next: string) => {
    goToNextStep(next);
  };

  // 次へボタンクリック時の処理
  const handleNextStep = () => {
    if (!currentStep) return;
    
    // 終了フラグがある場合は完了処理
    if (currentStep.end) {
      handleComplete();
      return;
    }
    
    // 次のステップIDがある場合はそのステップへ
    if (currentStep.next) {
      goToNextStep(currentStep.next);
    }
  };

  // トラブルシューティングを終了して戻る
  // トラブルシューティングの内容をチャットに送信
  const sendTroubleshootingToChat = useCallback(() => {
    if (!flowData || !currentStep) return;
    
    // ユーザーがログインしているか確認
    if (!user) {
      toast({
        title: '通知',
        description: 'ログインしていないため、ガイド内容をチャットに送信できません',
        variant: 'default',
        duration: 3000,
      });
      return;
    }
    
    // ガイドタイトルを設定
    const guideTitle = flowData.id.replace(/_/g, ' ');
    
    // 現在表示中の手順のみを送信するようにコンテンツを作成
    let guideContent = `**${guideTitle} - 現在の手順**\n\n`;
    
    // 現在のステップの内容を追加
    guideContent += `${currentStep.message}\n\n`;
    
    // チェックリストがある場合は追加
    if (currentStep.checklist && currentStep.checklist.length > 0) {
      guideContent += '**確認項目**：\n';
      currentStep.checklist.forEach((item) => {
        // チェックボックスの状態に基づいてチェック済みかどうかを示す
        const index = currentStep.checklist?.indexOf(item);
        const isChecked = index !== undefined && checklistItems[`${index}`] === true;
        const checkMark = isChecked ? '✓ ' : '• ';
        guideContent += `${checkMark}${item}\n`;
      });
    }
    
    // 画像がある場合は画像へのリンクも追加
    if (currentStep.image || currentStep.imageUrl) {
      guideContent += `\n**関連画像**: ${currentStep.image || currentStep.imageUrl}\n`;
    }
    
    // チャットへガイドを送信
    sendEmergencyGuide(guideTitle, guideContent);
    
    // 送信完了メッセージ
    toast({
      title: '送信完了',
      description: '現在表示中の手順をチャットに送信しました',
      duration: 3000,
    });
    
    // ガイドを表示後、トラブルシューティング画面を閉じる
    onExit?.();
  }, [flowData, currentStep, sendEmergencyGuide, onExit, user, toast]);

  // トラブルシューティングを終了して戻る
  // 終了時に応急処置ガイドの内容をチャットに自動的に送信
  const handleExit = useCallback(() => {
    // データがある場合かつユーザーがログインしている場合のみチャットに送信
    if (flowData && currentStep && user) {
      sendTroubleshootingToChat();
    } else if (flowData && currentStep && !user) {
      // ユーザーがログインしていない場合はガイド送信をスキップして通知
      toast({
        title: '通知',
        description: 'ログインしていないため、ガイド内容をチャットに送信できません',
        duration: 3000,
      });
    }
    onExit?.();
  }, [flowData, currentStep, sendTroubleshootingToChat, onExit, user, toast]);

  // ローディング中の表示
  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // データが見つからない場合
  if (!flowData || !currentStep) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>エラー</CardTitle>
        </CardHeader>
        <CardContent>
          <p>トラブルシューティングデータが見つかりませんでした。</p>
        </CardContent>
        <CardFooter>
          <Button onClick={handleExit} variant="outline">戻る</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-xl">応急処置ガイド</CardTitle>
          <Badge variant="outline">{flowData.id}</Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* メッセージ */}
        <div className="mb-4">
          <p className="whitespace-pre-line">{currentStep.message}</p>
        </div>
        
        {/* 画像（ある場合）- ここでの表示とチャットエリアの関係画像表示を連携させる */}
        {(currentStep.image || currentStep.imageUrl) && (
          <div className="mb-4 flex justify-center">
            {imageLoading && (
              <div className="animate-pulse h-48 w-48 bg-gray-200 rounded-md"></div>
            )}
            <img
              src={currentStep.image || currentStep.imageUrl}
              alt="トラブルシューティング図"
              className={`max-h-80 object-contain rounded-md ${imageLoading ? 'hidden' : 'block'} cursor-pointer`}
              onLoad={() => {
                setImageLoading(false);
                // 関係画像エリアにこの画像を表示するためのイベントを発火
                const imageTitle = flowData?.id || "応急処置ガイド";
                window.dispatchEvent(new CustomEvent('preview-image', { 
                  detail: { 
                    url: currentStep.image || currentStep.imageUrl,
                    title: imageTitle,
                    content: currentStep.message || "トラブルシューティング画像"
                  } 
                }));
              }}
              onError={() => setImageLoading(false)}
              // クリックでもプレビューを表示
              onClick={() => {
                const imageTitle = flowData?.id || "応急処置ガイド";
                window.dispatchEvent(new CustomEvent('preview-image', { 
                  detail: { 
                    url: currentStep.image || currentStep.imageUrl,
                    title: imageTitle,
                    content: currentStep.message || "トラブルシューティング画像"
                  } 
                }));
              }}
            />
          </div>
        )}
        
        {/* 選択肢（ある場合） */}
        {currentStep.options && currentStep.options.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="font-medium mb-2">状態を選択してください：</p>
            {currentStep.options.map((option, index) => (
              <Button
                key={index}
                variant="outline"
                className="w-full text-left justify-start h-auto py-2 mb-2"
                onClick={() => handleOptionSelect(option.next)}
              >
                {option.label || option.text}
              </Button>
            ))}
          </div>
        )}
        
        {/* チェックリスト（ある場合） */}
        {currentStep.checklist && currentStep.checklist.length > 0 && (
          <div className="mb-4 space-y-3">
            <p className="font-medium mb-2">確認項目：</p>
            {currentStep.checklist.map((item, index) => (
              <div key={index} className="flex items-start space-x-2">
                <Checkbox
                  id={`checklist-${index}`}
                  checked={checklistItems[`${index}`] || false}
                  onCheckedChange={() => toggleChecklistItem(`${index}`)}
                />
                <label
                  htmlFor={`checklist-${index}`}
                  className="text-sm cursor-pointer"
                >
                  {item}
                </label>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex flex-col gap-3">
        <div className="flex justify-between w-full">
          <Button
            variant="ghost"
            onClick={handleExit}
          >
            閉じる
          </Button>
          
          <div className="flex space-x-2">
            {stepHistory.length > 0 && (
              <Button
                variant="outline"
                onClick={goToPreviousStep}
              >
                戻る
              </Button>
            )}
            
            {(currentStep.next || currentStep.end) && (
              <Button
                onClick={handleNextStep}
                disabled={currentStep.checklist && !isChecklistComplete()}
              >
                {currentStep.end ? '完了' : '次へ'}
              </Button>
            )}
          </div>
        </div>
        
        {/* チャットに送信ボタン */}
        <Button 
          variant="secondary" 
          className="w-full" 
          onClick={sendTroubleshootingToChat}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square mr-2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          チャットに送信
        </Button>
      </CardFooter>
    </Card>
  );
}