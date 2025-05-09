import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useChat } from '@/context/chat-context';
import { useAuth } from '@/context/auth-context';
import { searchByText } from '@/lib/image-search';

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
  message?: string;
  content?: string; // contentフィールド追加
  title?: string;   // タイトルフィールド追加
  image?: string;
  imageUrl?: string;
  imageKeywords?: string[];
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
  const [searchResults, setSearchResults] = useState<any[]>([]);

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
      console.log('取得したトラブルシューティングデータ:', data);
      
      // データ形式を確認し、必要に応じて変換
      let formattedData = { ...data };
      
      // 最初のステップを設定
      if (data && data.steps && data.steps.length > 0) {
        // ステップデータの形式を標準化 (content → message への変換)
        const formattedSteps = data.steps.map((step: any) => {
          // 既に message がある場合はそのまま、無ければ content を message として使用
          return {
            ...step,
            message: step.message || step.content || '',
          };
        });
        
        formattedData.steps = formattedSteps;
        
        // 標準化されたデータを設定
        setFlowData(formattedData);
        setCurrentStep(formattedData.steps[0]);
      } else {
        setFlowData(data);
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
        window.location.href = `/emergency-guide/${event.detail.flowId}`;
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
    
    // 画像情報の追加
    if (currentStep.image || currentStep.imageUrl) {
      // 直接指定された画像がある場合
      guideContent += `\n**関連画像**: ${currentStep.image || currentStep.imageUrl}\n`;
    } else if (searchResults && searchResults.length > 0) {
      // 検索結果から画像情報を追加
      const firstResult = searchResults[0];
      guideContent += `\n**関連画像**: ${firstResult.file || firstResult.url}\n`;
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
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-xl">
            {/* フローのタイトルを表示 */}
            {flowData.title || '応急処置ガイド'}
          </CardTitle>
          <Badge variant="outline">{flowData.id}</Badge>
        </div>
        {/* ステップのタイトルがあれば表示 */}
        {currentStep.title && (
          <div className="mt-2">
            <span className="text-sm font-medium text-gray-500">手順: </span>
            <span className="font-semibold">{currentStep.title}</span>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {/* メッセージ */}
        <div className="mb-4">
          <p className="whitespace-pre-line">{currentStep.message}</p>
        </div>
        
        {/* 画像（直接指定された場合）- ここでの表示とチャットエリアの関係画像表示を連携させる */}
        {(currentStep.image || currentStep.imageUrl) && (
          <div className="mb-4 flex justify-center">
            {/* 画像読み込み中プレースホルダー - 常に表示して読み込み完了時に非表示化 */}
            <div className="relative flex justify-center items-center min-h-[200px] min-w-[200px] w-full max-w-md">
              <div className="loading-placeholder absolute inset-0 flex items-center justify-center z-0 bg-gray-100 rounded-md">
                <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
              </div>
              
              <img
                src={handleImagePath(currentStep.image || currentStep.imageUrl || '')}
                alt="応急処置ガイド図"
                className="max-h-80 object-contain rounded-md cursor-pointer z-10 relative"
                onLoad={(e) => {
                  setImageLoading(false);
                  
                  // 画像読み込みが完了したらプレースホルダーを非表示にする
                  const imgElement = e.currentTarget;
                  const parent = imgElement.parentElement;
                  if (parent) {
                    const placeholders = parent.querySelectorAll('.loading-placeholder');
                    placeholders.forEach(placeholder => {
                      placeholder.classList.add('hidden');
                    });
                  }
                  
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
                onError={(e) => {
                  setImageLoading(false);
                  
                  const imgElement = e.currentTarget;
                  const parent = imgElement.parentElement;
                  
                  // エラー時の表示
                  if (parent) {
                    // プレースホルダーを非表示
                    const placeholders = parent.querySelectorAll('.loading-placeholder');
                    placeholders.forEach(placeholder => {
                      placeholder.classList.add('hidden');
                    });
                    
                    // エラーメッセージを表示
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'absolute inset-0 flex items-center justify-center bg-red-50 text-red-600 rounded-md border border-red-200 z-20';
                    errorDiv.innerHTML = `
                      <div class="text-center p-4">
                        <p class="font-medium">画像を読み込めませんでした</p>
                        <p class="text-sm mt-2">別の方法でご確認ください</p>
                      </div>
                    `;
                    parent.appendChild(errorDiv);
                  }
                }}
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
          </div>
        )}
        
        {/* 検索結果から表示される画像（直接指定がない場合のみ） */}
        {!currentStep.image && !currentStep.imageUrl && searchResults && searchResults.length > 0 && (
          <div className="mb-4">
            {/* 検索結果ヘッダー */}
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium text-blue-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image inline-block mr-1"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                キーワードに基づく関連画像
              </p>
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                {searchResults.length}件の画像
              </span>
            </div>
            
            {/* 最初の検索結果を表示 */}
            <div className="flex justify-center">
              <div className="relative flex justify-center items-center min-h-[200px] min-w-[200px] w-full max-w-md">
                <img
                  src={handleImagePath(searchResults[0].file || searchResults[0].url)}
                  alt={searchResults[0].title || "関連画像"}
                  className="max-h-80 object-contain rounded-md cursor-pointer border border-blue-100 shadow-sm"
                  onClick={() => {
                    // Chat UIに通知
                    window.dispatchEvent(new CustomEvent('preview-image', { 
                      detail: { 
                        url: handleImagePath(searchResults[0].file || searchResults[0].url),
                        title: searchResults[0].title || '関連画像',
                        content: searchResults[0].description || currentStep.message
                      } 
                    }));
                  }}
                />
              </div>
            </div>
            
            {/* キーワード表示 */}
            {currentStep.imageKeywords && currentStep.imageKeywords.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {currentStep.imageKeywords.map((keyword, idx) => (
                  <span key={idx} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                    {keyword}
                  </span>
                ))}
              </div>
            )}
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
                onClick={() => handleOptionSelect(option)}
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
            
            {(currentStep.next || currentStep.nextStep || currentStep.end) && (
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