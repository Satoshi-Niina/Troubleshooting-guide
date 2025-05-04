import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useChat } from '@/context/chat-context';
import { useAuth } from '@/context/auth-context';
import { searchByText } from '@/lib/image-search';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { RefreshCw, Plus } from 'lucide-react';

// 画像パスを修正するヘルパー関数
function handleImagePath(imagePath: string): string {
  if (!imagePath) return '';
  
  // すでに絶対URLの場合はそのまま返す
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // 相対パスの場合、先頭の/を削除してoriginを追加
  // replit環境では、先頭の/を含む相対パスが正しく解決されないことがある
  let path = imagePath;
  if (path.startsWith('/')) {
    path = path.substring(1);
  }
  
  // 現在のオリジンと結合
  const baseUrl = window.location.origin;
  return `${baseUrl}/${path}`;
}

interface TroubleshootingStep {
  id?: string;
  message: string;
  image?: string;
  imageUrl?: string; // imageUrlも追加
  imageKeywords?: string[]; // 検索キーワードの配列を追加
  options?: {
    text?: string;
    label?: string;
    next?: string;
    nextStep?: string;
  }[];
  next?: string;
  nextStep?: string;
  checklist?: string[];
  end?: boolean;
}

interface TroubleshootingFlowProps {
  id: string;
  onComplete?: () => void;
  onExit?: () => void;
}

interface FlowData {
  id?: string;
  title: string;
  description?: string;
  fileName?: string;
  nodes?: any[];
  edges?: any[];
  steps?: TroubleshootingStep[];
}

function TroubleshootingFlow({ id, onComplete, onExit }: TroubleshootingFlowProps) {
  const { toast } = useToast();
  const { sendEmergencyGuide } = useChat(); // ChatContextからsendEmergencyGuideを取得
  const { user } = useAuth(); // 認証状態を取得
  const [loading, setLoading] = useState(true);
  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [currentStep, setCurrentStep] = useState<TroubleshootingStep | null>(null);
  const [stepHistory, setStepHistory] = useState<string[]>([]);
  const [checklistItems, setChecklistItems] = useState<Record<string, boolean>>({});
  const [imageLoading, setImageLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [characterDesignTab, setCharacterDesignTab] = useState('new');
  const [flowList, setFlowList] = useState<any[]>([]);
  const [isLoadingFlowList, setIsLoadingFlowList] = useState(false);

  // フローリストを取得
  const fetchFlowList = useCallback(async () => {
    setIsLoadingFlowList(true);
    try {
      const response = await fetch('/api/troubleshooting/list', {
        credentials: 'include',
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setFlowList(data);
    } catch (error) {
      console.error('フローリストの取得に失敗しました:', error);
      toast({
        title: 'エラー',
        description: 'フローリストの取得に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingFlowList(false);
    }
  }, [toast]);

  // 新規フロー作成
  const handleCreateNewFlow = useCallback(() => {
    window.location.href = '/troubleshooting/editor';
  }, []);

  // フローデータを取得
  const fetchFlowData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tech-support/metadata/flows/${id}`, {
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
        setCurrentStep(data.steps[0] || null);
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
  
  // チャットからのフロー選択イベントを受け取るリスナー
  useEffect(() => {
    // チャットから送信されたメッセージ内容からフローIDを取得するイベントリスナー
    const handleSelectFlow = (event: CustomEvent) => {
      if (event.detail && event.detail.flowId) {
        console.log('チャットからフローIDを受信:', event.detail.flowId);
        
        // 自動表示フラグがある場合（検索結果が1件のみの場合）
        const autoDisplay = event.detail.autoDisplay === true;
        
        if (event.detail.flowId === id) {
          console.log('既に同じフローを表示中です');
          return;
        }
        
        // 検索結果が複数ある場合は選択リストを表示
        if (event.detail.results && event.detail.results.length > 1 && !autoDisplay) {
          // 複数の選択肢がある場合、選択リストを表示するイベントを発火
          window.dispatchEvent(new CustomEvent('show-troubleshooting-list', { 
            detail: { 
              results: event.detail.results,
              searchText: event.detail.searchText || '検索結果'
            }
          }));
          return;
        }
        
        // 自動表示フラグがある場合、または検索結果が1つだけの場合は直接リダイレクト
        window.location.href = `/knowledge-base/data/metadata/flows/${event.detail.flowId}`;
      }
    };
    
    // イベントリスナーを登録
    window.addEventListener('select-troubleshooting-flow', handleSelectFlow as EventListener);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('select-troubleshooting-flow', handleSelectFlow as EventListener);
    };
  }, [id]);

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
  
  // 画像キーワードが変わったときに検索を実行
  useEffect(() => {
    if (!currentStep) return;
    
    // 画像検索を実行
    const performImageSearch = async () => {
      // 1. ステップに直接画像URLが指定されている場合は検索しない
      if (currentStep.image || currentStep.imageUrl) {
        console.log('ステップに直接画像が指定されているため検索は実行しません', currentStep.image || currentStep.imageUrl);
        return;
      }
      
      // 2. キーワード検索の実行
      if (currentStep.imageKeywords && currentStep.imageKeywords.length > 0) {
        console.log('画像キーワードによる検索を実行:', currentStep.imageKeywords);
        try {
          // キーワードを文字列に結合して検索
          const searchText = currentStep.imageKeywords.join(' ');
          const results = await searchByText(searchText);
          
          console.log('検索結果:', results);
          setSearchResults(results);
          
          // 検索結果があれば、最初の画像を表示（Chat UIとの連携）
          if (results && results.length > 0) {
            const firstResult = results[0];
            // パスを正しく解決
            const imageUrl = handleImagePath(firstResult.file || firstResult.url);
            console.log('画像表示: キーワード検索結果の画像を表示', imageUrl);
            
            // ブラウザのイベントディスパッチを使用してChat UIに通知
            window.dispatchEvent(new CustomEvent('preview-image', { 
              detail: { 
                url: imageUrl,
                title: firstResult.title || '関連画像',
                content: firstResult.description || currentStep.message
              } 
            }));
          }
        } catch (error) {
          console.error('画像検索実行エラー:', error);
        }
      } else {
        // キーワードがない場合は現在のステップの内容を使って検索
        console.log('キーワードがないため、ステップのメッセージから検索を実行');
        try {
          const results = await searchByText(currentStep.message);
          setSearchResults(results);
          
          // 検索結果があれば、最初の画像を表示
          if (results && results.length > 0) {
            const firstResult = results[0];
            // パスを正しく解決
            const imageUrl = handleImagePath(firstResult.file || firstResult.url);
            console.log('画像表示: メッセージからの検索結果の画像を表示', imageUrl);
            
            window.dispatchEvent(new CustomEvent('preview-image', { 
              detail: { 
                url: imageUrl,
                title: firstResult.title || '関連画像',
                content: firstResult.description || currentStep.message
              } 
            }));
          }
        } catch (error) {
          console.error('メッセージを使った画像検索エラー:', error);
        }
      }
    };
    
    // 検索実行
    performImageSearch();
  }, [currentStep]);

  // 次のステップに進む
  const goToNextStep = useCallback((nextStepId: string) => {
    if (!flowData) return;

    // 現在のステップIDがあれば履歴に追加
    if (currentStep?.id) {
      setStepHistory(prev => [...prev, currentStep.id!]);
    }

    // 次のステップを探す
    const nextStep = flowData.steps?.find(step => step.id === nextStepId);
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
      const prevStep = flowData.steps?.find(step => step.id === prevStepId);
      if (prevStep) {
        setCurrentStep(prevStep);
        setChecklistItems({});
      }
    } else {
      // 履歴にない場合は最初のステップに戻る
      setCurrentStep(flowData.steps?.[0]);
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
      description: '応急処置ガイドの手順が完了しました',
    });
    onComplete?.();
  }, [toast, onComplete]);

  // オプション選択時の処理
  const handleOptionSelect = (option: { next?: string, nextStep?: string }) => {
    // nextStepを優先的に使用し、なければnextを使用
    const nextStepId = option.nextStep || option.next;
    if (!nextStepId) {
      toast({
        title: 'エラー',
        description: '次のステップが指定されていません',
        variant: 'destructive',
      });
      return;
    }
    goToNextStep(nextStepId);
  };

  // 次へボタンクリック時の処理
  const handleNextStep = () => {
    if (!currentStep) return;
    
    // 終了フラグがある場合は完了処理
    if (currentStep.end) {
      handleComplete();
      return;
    }
    
    // 次のステップIDがある場合はそのステップへ（nextStepを優先）
    const nextStepId = currentStep.nextStep || currentStep.next;
    if (nextStepId) {
      goToNextStep(nextStepId);
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
    const guideTitle = flowData.id?.replace(/_/g, ' ') || '';
    
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
    
    // 画像情報の追加
    if (currentStep.image || currentStep.imageUrl) {
      // 直接指定された画像がある場合
      guideContent += `\n**関連画像**: /knowledge-base/media/images/${currentStep.image || currentStep.imageUrl}\n`;
    } else if (searchResults && searchResults.length > 0) {
      // 検索結果から画像情報を追加
      const firstResult = searchResults[0];
      guideContent += `\n**関連画像**: /knowledge-base/media/images/${firstResult.file || firstResult.url}\n`;
      guideContent += `\n**画像説明**: ${firstResult.title || '関連画像'}\n`;
      
      // 他の検索結果があれば、追加情報として表示
      if (searchResults.length > 1) {
        guideContent += `\n**その他の関連画像**: ${searchResults.length - 1}件\n`;
      }
      
      // キーワード情報も追加
      if (currentStep.imageKeywords && currentStep.imageKeywords.length > 0) {
        guideContent += `\n**検索キーワード**: ${currentStep.imageKeywords.join(', ')}\n`;
      }
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
  }, [flowData, currentStep, sendEmergencyGuide, onExit, user, toast, searchResults]);

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
  }, [flowData, currentStep, sendTroubleshootingToChat, onExit, user, toast, searchResults]);

  // メモ化されたフローデータの処理
  const processFlowData = useCallback((jsonData: any) => {
    if (!jsonData) {
      return {
        title: '無効なデータ',
        description: 'データが正しく読み込めませんでした',
        nodes: [{
          id: 'start',
          type: 'start',
          position: { x: 250, y: 50 },
          data: { label: '開始' }
        }],
        edges: []
      };
    }

    // ... existing processFlowData code ...
  }, []);

  // メモ化されたフロー保存ハンドラー
  const handleSaveFlow = useCallback(async (data: any) => {
    try {
      console.log("保存するフローデータ:", data);
      const response = await fetch('/api/tech-support/metadata/flows/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('フローの保存に失敗しました');
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "保存成功",
          description: "トラブルシューティングフローが保存されました",
        });
        
        fetchFlowList();
        
        setFlowData({
          title: '',
          description: '',
          fileName: '',
          nodes: [
            {
              id: 'start',
              type: 'start',
              position: { x: 250, y: 50 },
              data: { label: '開始' }
            }
          ],
          edges: []
        });
        setCharacterDesignTab('file');
      } else {
        throw new Error(result.error || 'フローの保存に失敗しました');
      }
    } catch (error) {
      console.error('保存エラー:', error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "フローの保存に失敗しました",
        variant: "destructive",
      });
    }
  }, [toast, fetchFlowList]);

  // メモ化されたフローリストの表示
  const renderFlowList = useMemo(() => {
    if (isLoadingFlowList) {
      return <div className="py-4 text-center text-gray-500">読込中...</div>;
    }
    
    if (flowList.length === 0) {
      return <div className="py-4 text-center text-gray-500">保存済みのデータはありません</div>;
    }
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {flowList.map(flow => (
          <Card key={flow.id} className="overflow-hidden">
            {/* ... existing card content ... */}
          </Card>
        ))}
      </div>
    );
  }, [flowList, isLoadingFlowList]);

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
          <p>応急処置ガイドのデータが見つかりませんでした。</p>
        </CardContent>
        <CardFooter>
          <Button onClick={handleExit} variant="outline">戻る</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full h-screen max-h-[calc(100vh-120px)] overflow-auto">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl">応急処置ガイド</CardTitle>
            <Badge variant="outline">{flowData.id}</Badge>
          </div>
        </CardHeader>
        
        <CardContent className="overflow-y-auto pb-24">
          <Tabs defaultValue="new" value={characterDesignTab} onValueChange={setCharacterDesignTab}>
            <TabsContent value="new" className="h-full">
              {/* ... existing content ... */}
            </TabsContent>
            <TabsContent value="file" className="h-full">
              <div className="space-y-4">
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium">保存データ一覧</h3>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={fetchFlowList} disabled={isLoadingFlowList}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        更新
                      </Button>
                      <Button variant="default" size="sm" onClick={handleCreateNewFlow}>
                        <Plus className="mr-2 h-4 w-4" />
                        新規作成
                      </Button>
                    </div>
                  </div>
                  
                  {renderFlowList}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* ... existing alert dialog ... */}
    </>
  );
}

export default React.memo(TroubleshootingFlow);
