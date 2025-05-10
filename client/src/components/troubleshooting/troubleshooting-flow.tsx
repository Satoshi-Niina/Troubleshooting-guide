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
  description?: string; // descriptionフィールド追加
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
  // トラブルシューティングステップでメッセージまたはコンテンツを取得するヘルパー関数
  const getStepText = (step: TroubleshootingStep) => {
    // 優先順位：message → content → description → 空文字列
    return step.message || step.content || step.description || "";
  };
  const { toast } = useToast();
  const { sendEmergencyGuide } = useChat(); // ChatContextからsendEmergencyGuideを取得
  const { user } = useAuth(); // 認証状態を取得
  const [loading, setLoading] = useState(true);
  const [flowData, setFlowData] = useState<{
    id: string;
    title?: string;
    description?: string;
    keywords?: string[];
    createdAt?: string;
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
    
    // ステップの内容から関連キーワードを抽出して画像検索する
    const extractKeywordsFromText = (text: string) => {
      // 日本語の重要なキーワードを抽出（名詞を中心に）
      // 簡易的な実装として、2文字以上の単語を抽出
      const words = text.match(/[一-龠]+|[ぁ-ん]+|[ァ-ヴー]+|[a-zA-Z0-9]+/g) || [];
      
      // 助詞や助動詞などの一般的な語を除外
      const stopWords = ['した', 'します', 'ます', 'です', 'ない', 'する', 'なる', 'いる', 'ある', 'れる', 'られる', 
        'ので', 'から', 'より', 'また', 'および', 'または', 'など', 'して', 'として', 'について', 'により'];
      
      return words
        .filter(word => word.length >= 2) // 2文字以上の単語のみ
        .filter(word => !stopWords.includes(word)) // ストップワードを除外
        .slice(0, 5); // 最大5単語まで
    };
    
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
          
          // 検索結果があれば、最初の画像を表示
          if (results && results.length > 0) {
            const firstResult = results[0];
            // パスを正しく解決
            const imageUrl = handleImagePath(firstResult.file || firstResult.url);
            console.log('画像表示: キーワード検索結果の画像を表示', imageUrl);
            
            // ブラウザのイベントディスパッチを使用してプレビュー表示のみ実行
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
          // ステップからメッセージを取得し、キーワードを抽出
          const message = currentStep.message || currentStep.content || '';
          // メッセージからキーワードを抽出
          const keywords = extractKeywordsFromText(message);
          console.log('テキストから抽出したキーワード:', keywords);
          
          // 抽出したキーワードで検索
          const searchText = keywords.join(' ');
          console.log('検索キーワード:', searchText);
          console.log('キーワードタイプ:', typeof searchText, searchText.length, Array.isArray(searchText));
          
          if (!searchText.trim()) {
            console.log('検索テキストが空のため検索をスキップします');
            return;
          }
          
          const results = await searchByText(searchText);
          setSearchResults(results);
          
          // 検索結果があれば、最初の画像を表示
          if (results && results.length > 0) {
            const firstResult = results[0];
            // パスを正しく解決
            const imageUrl = handleImagePath(firstResult.file || firstResult.url);
            console.log('画像表示: メッセージからの検索結果の画像を表示', imageUrl);
            
            // プレビュー表示のみ実行
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
      // ステップが見つからない場合のフォールバック処理
      // 1. 類似のIDを探す (例: "step2a" が見つからない場合、"step2"から始まるIDを探す)
      const similarIdStep = flowData.steps.find(step => 
        step.id && (nextStepId.startsWith(step.id) || step.id.startsWith(nextStepId))
      );
      
      if (similarIdStep) {
        console.log(`元のステップ「${nextStepId}」が見つからなかったため、類似ステップ「${similarIdStep.id}」に移動します`);
        setCurrentStep(similarIdStep);
        setChecklistItems({});
        return;
      }
      
      // 2. 現在のステップの次のステップを探す
      if (currentStep && currentStep.id) {
        const currentIndex = flowData.steps.findIndex(step => step.id === currentStep.id);
        if (currentIndex !== -1 && currentIndex < flowData.steps.length - 1) {
          const fallbackStep = flowData.steps[currentIndex + 1];
          console.log(`指定されたステップ「${nextStepId}」が見つからなかったため、次のステップ「${fallbackStep.id}」に移動します`);
          setCurrentStep(fallbackStep);
          setChecklistItems({});
          return;
        }
      }
      
      // フォールバックも失敗した場合は警告表示（エラーではなく警告に変更）
      toast({
        title: '警告',
        description: `次のステップ「${nextStepId}」が見つかりません`,
        variant: 'default',
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
  const handleOptionSelect = (option: { next?: string, nextStep?: string, text?: string }) => {
    // nextStepを優先的に使用し、なければnextを使用
    const nextStepId = option.nextStep || option.next;
    if (!nextStepId) {
      // 次のステップIDがない場合は、エラーを表示せずにデフォルトの次のステップを探す
      if (flowData && currentStep) {
        const currentIndex = flowData.steps.findIndex(step => step.id === currentStep.id);
        if (currentIndex !== -1 && currentIndex < flowData.steps.length - 1) {
          // 配列内の次のステップへ
          const nextStep = flowData.steps[currentIndex + 1];
          const generatedNextStepId = nextStep.id || `step_${currentIndex + 1}`;
          goToNextStep(generatedNextStepId);
          return;
        }
      }
      
      toast({
        title: '注意',
        description: `選択肢「${option.text || ''}」の次のステップが指定されていません`,
        variant: 'default',
      });
      return;
    }
    goToNextStep(nextStepId);
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
    const guideTitle = flowData.title || flowData.id.replace(/_/g, ' ');
    
    // 現在表示中の手順のみを送信するようにコンテンツを作成
    let guideContent = `**${guideTitle} - 現在の手順**\n\n`;
    
    // 現在のステップの内容を追加
    const message = currentStep.message || currentStep.content || '';
    guideContent += `${message}\n\n`;
    
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
    sendEmergencyGuide({ title: guideTitle, content: guideContent });
    
    // 送信完了メッセージ
    toast({
      title: '送信完了',
      description: '現在表示中の手順をチャットに送信しました',
      duration: 3000,
    });
    
    // ガイドを表示後、トラブルシューティング画面を閉じる
    onExit?.();
  }, [flowData, currentStep, sendEmergencyGuide, onExit, user, toast, searchResults, checklistItems]);

  // トラブルシューティングを終了して戻る
  // ユーザーの要求により、チャットへの自動送信は行わない
  const handleExit = useCallback(() => {
    // 処理済み内容は自動的にチャットに送信しない
    console.log('応急処置ガイド処理を終了します。チャットへの自動送信はスキップします。');
    
    // 単純に終了処理を呼び出す
    onExit?.();
  }, [onExit]);

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
          {/* ファイル名（ID）を非表示にする */}
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
          <p className="whitespace-pre-line">{getStepText(currentStep)}</p>
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
                  // プレビューのみ表示し、チャットへの送信は行わない
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
                // クリックでプレビュー表示する（チャットには送信しない）
                onClick={() => {
                  // プレビューのみ表示する
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
                    // プレビューのみ表示する
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
          </div>
        </div>
        {/* チャットに送信ボタン - 条件分岐ですべての表示したフローを送信 */}
        <Button 
          variant="secondary" 
          className="w-full" 
          onClick={() => {
            // これまでに表示したすべてのステップ（履歴を含めて）をチャットに送信
            if (currentStep && flowData) {
              try {
                const guideTitle = flowData.title || flowData.id.replace(/_/g, ' ');
                let guideContent = `**${guideTitle} - 処理履歴**\n\n`;
                
                // 履歴ステップを取得
                const displayedStepIds = [...stepHistory, currentStep.id].filter(Boolean) as string[];
                const displayedSteps = displayedStepIds.map(stepId => 
                  flowData.steps.find(step => step.id === stepId)
                ).filter(Boolean) as TroubleshootingStep[];
                
                // シンプルな日本語テキストでステップの詳細な流れを構築
                let flowDetails = [];
                
                // 各ステップでの選択内容と結果を記録
                displayedSteps.forEach((step, index) => {
                  // ステップの基本情報
                  const stepTitle = step.title || `ステップ ${index + 1}`;
                  const stepDescription = step.message || step.content || '';
                  
                  // 各ステップの詳細を作成
                  let stepDetail = {
                    title: stepTitle,
                    description: stepDescription,
                    selected: null,
                    result: null
                  };
                  
                  // 次のステップがある場合、このステップでの選択内容を記録
                  if (index < displayedSteps.length - 1) {
                    const nextStep = displayedSteps[index + 1];
                    
                    // 現在のステップに選択肢がある場合
                    if (step.options && step.options.length > 0) {
                      // 次のステップに繋がる選択肢を特定
                      const selectedOption = step.options.find(opt => 
                        (opt.next === nextStep.id) || (opt.nextStep === nextStep.id)
                      );
                      
                      // 選択肢が見つかったら記録
                      if (selectedOption) {
                        stepDetail.selected = selectedOption.text || selectedOption.label || '次へ';
                        stepDetail.result = nextStep.title;
                      }
                    }
                  }
                  
                  // 詳細をリストに追加
                  flowDetails.push(stepDetail);
                });
                
                // フローのサマリーを作成（簡易表示用）
                let flowSummary = '';
                displayedSteps.forEach((step, index) => {
                  const stepTitle = step.title || `ステップ ${index + 1}`;
                  
                  if (index === 0) {
                    flowSummary = stepTitle;
                  } else {
                    flowSummary += ` → ${stepTitle}`;
                  }
                });
                
                // 現在の状態を確認
                const currentStepDescription = currentStep.message || currentStep.content || '';
                
                // メッセージを組み立て（詳細な日本語テキスト形式）
                guideContent = `■ ${guideTitle}\n\n`;
                
                // 手順の詳細を表示
                guideContent += `【実施した手順の詳細】\n`;
                flowDetails.forEach((detail, index) => {
                  // ステップ番号と名前
                  guideContent += `${index + 1}. ${detail.title}\n`;
                  
                  // 短い説明を追加（あれば）
                  if (detail.description) {
                    const shortDesc = detail.description.length > 50 
                      ? detail.description.substring(0, 50) + '...' 
                      : detail.description;
                    guideContent += `   ${shortDesc}\n`;
                  }
                  
                  // 選択内容と結果を追加（あれば）
                  if (detail.selected) {
                    guideContent += `   選択: 「${detail.selected}」 → ${detail.result}\n`;
                  }
                  
                  // ステップ間に空行を追加
                  guideContent += '\n';
                });
                
                // 簡易フロー概要を追加
                guideContent += `【フロー概要】\n${flowSummary}\n\n`;
                
                // 現在の状態を追加
                guideContent += `【現在の状態】\n${currentStep.title || '手順完了'}`;
                if (currentStepDescription) {
                  // 説明文を短く
                  const shortCurrentDesc = currentStepDescription.length > 100 
                    ? currentStepDescription.substring(0, 100) + '...' 
                    : currentStepDescription;
                  guideContent += `\n${shortCurrentDesc}`;
                }
                
                // 現在のステップの確認項目があれば追加（現在のステップのみ）
                if (currentStep.checklist && currentStep.checklist.length > 0) {
                  guideContent += `\n\n【確認項目】\n`;
                  currentStep.checklist.forEach((item) => {
                    const index = currentStep.checklist?.indexOf(item);
                    const isChecked = index !== undefined && checklistItems[`${index}`] === true;
                    const checkMark = isChecked ? '✓' : '□';
                    guideContent += `- [${checkMark}] ${item}\n`;
                  });
                }
                
                // チャットへガイドを送信
                console.log('表示履歴を含めたステップをチャットに送信します');
                
                // 現在のチャットIDを取得（通常は1）
                const chatId = localStorage.getItem('currentChatId') || '1';
                console.log('応急処置ガイド: チャットID', chatId, 'にデータを送信します');
                
                // 送信前にメッセージを表示
                toast({
                  title: '送信中',
                  description: 'チャットに送信しています...',
                  duration: 2000,
                });
                
                // 標準のチャットAPIを使用してユーザーメッセージを送信
                fetch(`/api/chats/${chatId}/messages`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    content: guideContent,
                    isUserMessage: true
                  }),
                })
                .then(response => {
                  if (!response.ok) {
                    throw new Error(`エラーが発生しました (${response.status})`);
                  }
                  return response.json();
                })
                .then(result => {
                  console.log('ユーザーメッセージ送信結果:', result);
                  
                  // 送信完了メッセージ
                  toast({
                    title: '送信完了',
                    description: '表示した手順をチャットに送信しました',
                    duration: 3000,
                  });
                  
                  // チャット画面に自動リダイレクト
                  setTimeout(() => {
                    window.location.href = '/chat';
                  }, 1500);
                })
                .catch(error => {
                  console.error('チャット送信エラー:', error);
                  toast({
                    title: 'エラー',
                    description: 'チャットへの送信中にエラーが発生しました',
                    variant: 'destructive',
                    duration: 5000,
                  });
                });
              } catch (error) {
                console.error('緊急ガイド送信エラー:', error);
                toast({
                  title: 'エラー',
                  description: 'チャットへの送信中にエラーが発生しました',
                  variant: 'destructive',
                  duration: 5000,
                });
              }
            }
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-square mr-2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          表示した手順をチャットに送信
        </Button>
      </CardFooter>
    </Card>
  );
}