import { useEffect, useState } from "react";
import { useChat } from "@/context/chat-context";
import MessageBubble from "@/components/chat/message-bubble";
import MessageInput from "@/components/chat/message-input";
import TextSelectionControls from "@/components/chat/text-selection-controls";
import SearchResults from "@/components/chat/search-results";
import CameraModal from "@/components/chat/camera-modal";
import ImagePreviewModal from "@/components/chat/image-preview-modal";
import TroubleshootingSelector from "@/components/troubleshooting/troubleshooting-selector";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, AlertTriangle, Loader2, Trash2, LifeBuoy, Image, Hammer, Heart, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrientation } from "@/hooks/use-orientation";

export default function Chat() {
  const {
    messages,
    isLoading,
    selectedText,
    setSelectedText,
    searchBySelectedText,
    searchResults,
    clearSearchResults,
    exportChatHistory,
    lastExportTimestamp,
    isExporting,
    hasUnexportedMessages,
    draftMessage,
    clearChatHistory,
    isClearing,
    isRecording
  } = useChat();
  
  const [isEndChatDialogOpen, setIsEndChatDialogOpen] = useState(false);

  // Fetch messages for the current chat
  const { data, isLoading: messagesLoading } = useQuery({
    queryKey: ['/api/chats/1/messages'],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    // Handle text selection
    const handleSelection = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        setSelectedText(selection.toString().trim());
      } else {
        setSelectedText("");
      }
    };

    document.addEventListener("mouseup", handleSelection);
    return () => {
      document.removeEventListener("mouseup", handleSelection);
    };
  }, [setSelectedText]);

  // Show messages from the context or from the query
  // クリア処理中は空配列を表示し、それ以外の場合はmessagesまたはデータを表示
  const displayMessages = isClearing 
    ? [] 
    : (messages?.length > 0 ? messages : (data as any[] || []));
  
  // メッセージクリア時にデータも更新
  useEffect(() => {
    // メッセージが空になった場合（クリアされた場合）のハンドリング
    if (messages !== undefined && messages.length === 0) {
      const chatClearedTimestamp = localStorage.getItem('chat_cleared_timestamp');
      
      // キャッシュクリア処理（タイムスタンプの有無に関わらず実行）
      console.log('チャット履歴クリア後の状態を維持します');
      
      // ローカルストレージのクエリキャッシュをクリア
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('rq-/api/chats/')) {
          localStorage.removeItem(key);
        }
      }
      
      // クエリキャッシュを完全に削除
      queryClient.removeQueries({ queryKey: ['/api/chats/1/messages'] });
      
      // 空の配列を強制的にセット
      queryClient.setQueryData(['/api/chats/1/messages'], []);
      
      // React Queryのキャッシュ操作用にグローバル変数としてqueryClientを設定
      // @ts-ignore - これにより他のコンポーネントからもアクセス可能
      window.queryClient = queryClient;
      
      // 特殊パラメータを付けて明示的にサーバーにクリア要求を送信
      const fetchClearedData = async () => {
        try {
          // タイムスタンプパラメータを使用してキャッシュバスティング
          const clearUrl = `/api/chats/1/messages?clear=true&_t=${Date.now()}`;
          await fetch(clearUrl, {
            credentials: 'include',
            cache: 'no-cache',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          console.log('履歴クリアを確認するリクエストを送信しました');
        } catch (error) {
          console.error('クリア要求送信エラー:', error);
        }
      };
      
      fetchClearedData();
      
      // クリアフラグを削除（1度だけ実行するため）
      if (chatClearedTimestamp) {
        localStorage.removeItem('chat_cleared_timestamp');
        console.log('チャットクリアタイムスタンプをクリア');
      }
      
      // 少し間をおいて再確認
      const intervalId = setInterval(() => {
        queryClient.setQueryData(['/api/chats/1/messages'], []);
      }, 500);
      
      // 10秒後にクリア監視を終了
      setTimeout(() => {
        clearInterval(intervalId);
      }, 10000);
    }
  }, [messages, queryClient]);

  // woutorのLocationフックを取得
  const [, setLocation] = useLocation();
  
  // チャット終了確認ダイアログを表示
  const handleEndChat = () => {
    if (hasUnexportedMessages) {
      setIsEndChatDialogOpen(true);
    } else {
      // 未送信のメッセージがなければログイン画面に戻る
      // APIにログアウトリクエストを送信してからリダイレクト
      fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      })
      .then(() => {
        console.log("ログアウト成功 - ログイン画面に遷移します");
        // キャッシュをクリア
        queryClient.clear();
        // ローカルストレージのクエリキャッシュをクリア
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('rq-')) {
            localStorage.removeItem(key);
          }
        }
        
        // JavaScript直接のリダイレクトを使用（より確実なリダイレクト）
        window.location.href = "/login";
      })
      .catch(error => {
        console.error("ログアウトエラー:", error);
        // エラーが発生してもログイン画面に遷移
        window.location.href = "/login";
      });
    }
  };

  // チャットを送信して終了
  const handleSendAndEnd = async () => {
    try {
      await exportChatHistory();
      setIsEndChatDialogOpen(false);
      
      // 送信完了後、ログアウト処理を実行
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
      
      console.log("送信して終了: ログアウト成功 - ログイン画面に遷移します");
      
      // キャッシュをクリア
      queryClient.clear();
      // ローカルストレージのクエリキャッシュをクリア
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('rq-')) {
          localStorage.removeItem(key);
        }
      }
      
      // JavaScript直接のリダイレクトを使用（より確実なリダイレクト）
      window.location.href = "/login";
    } catch (error) {
      console.error("チャット終了エラー:", error);
      // エラーが発生してもログイン画面に遷移
      window.location.href = "/login";
    }
  };

  const isMobile = useIsMobile();
  const orientation = useOrientation();
  
  // スクロール挙動の最適化 (モバイル対応)
  useEffect(() => {
    // 基本スクロール設定を適用
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    
    // モバイル端末の場合、横向きの時に検索ボタンの位置を調整する
    const handleOrientationChange = () => {
      // 検索結果を表示するスライダーがあれば位置調整
      const searchSlider = document.getElementById('mobile-search-slider');
      const chatMessages = document.querySelector('.chat-messages-container') as HTMLElement;
      
      if (searchSlider) {
        // チャットエリアのスタイルを初期化
        if (chatMessages) {
          chatMessages.style.width = '';
          chatMessages.style.flex = '';
          chatMessages.style.maxWidth = '';
        }
        
        // 初期状態では検索パネルは非表示にする
        if (!searchResults || searchResults.length === 0) {
          searchSlider.style.display = 'none';
          return;
        } else {
          searchSlider.style.display = 'block';
        }
        
        // 横向きの場合でも検索パネルは表示しない（検索時のみ表示）
        // 初期状態では非表示
        searchSlider.style.transform = 'translateY(100%)';
        
        // 横向き・縦向き共通の設定
        if (orientation === 'landscape') {
          // 検索パネルを右側に配置
          searchSlider.style.position = 'fixed';
          searchSlider.style.maxHeight = '100vh';
          searchSlider.style.height = '100vh';
          searchSlider.style.top = '0';
          searchSlider.style.bottom = '0';
          searchSlider.style.width = '40%';
          searchSlider.style.right = '0';
          searchSlider.style.left = 'auto';
          searchSlider.style.transform = 'translateY(100%)'; // 検索ボタンが押された時のみ表示
          searchSlider.style.transition = 'transform 300ms ease-in-out';
          searchSlider.style.borderLeft = '1px solid #bfdbfe';
          searchSlider.style.zIndex = '10';
          searchSlider.style.backgroundColor = '#eff6ff';
          searchSlider.style.paddingTop = '0';
          searchSlider.style.overflowY = 'auto';
          
          // 横向きの場合は丸ボタンを非表示に
          const searchButton = document.querySelector('.mobile-search-button') as HTMLElement;
          if (searchButton) {
            searchButton.style.display = 'none';
          }
        } else {
          // 縦向きは従来通り下から表示
          searchSlider.style.maxHeight = '70vh';
          searchSlider.style.width = '100%';
          searchSlider.style.right = 'auto';
          searchSlider.style.left = '0';
          searchSlider.style.top = 'auto';
          searchSlider.style.position = 'fixed';
          searchSlider.style.bottom = '0';
          searchSlider.style.transform = 'translateY(100%)';
          searchSlider.style.transition = 'transform 300ms ease-in-out';
          searchSlider.style.borderLeft = 'none';
          searchSlider.style.borderTop = '1px solid #bfdbfe';
          
          // 丸ボタン位置を元に戻す
          const searchButton = document.querySelector('.mobile-search-button') as HTMLElement;
          if (searchButton) {
            searchButton.style.bottom = '20px';
            searchButton.style.right = '16px';
          }
        }
      }
    };
    
    // 初期実行
    handleOrientationChange();
    
    // イベントリスナー登録
    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
    
    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);
      
      // 検索結果エリアを元に戻す
      const chatMessages = document.querySelector('.chat-messages-container') as HTMLElement;
      if (chatMessages) {
        chatMessages.style.width = '';
        chatMessages.style.flex = '';
        chatMessages.style.maxWidth = '';
      }
    };
  }, [orientation, searchResults]);
  
  // 応急処置モーダルの状態管理
  const [emergencyGuideOpen, setEmergencyGuideOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");

  return (
    <div className="flex flex-col w-full h-full overflow-auto bg-blue-50 chat-layout-container overflow-scroll-container" style={{ maxWidth: '100vw', overflowX: 'hidden' }}>
      {/* ヘッダー - 12インチノートPC向けにコンパクト化 */}
      <div className="border-b border-blue-200 p-1 md:p-2 flex justify-between items-center bg-blue-100 mobile-landscape-header" style={{ minHeight: 'auto' }}>
        <div className="flex items-center">
          {/* タイトル表示を削除 */}
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          
          {/* チャット履歴送信ボタン - よりコンパクトに */}
          <Button 
            variant="outline"
            size="sm"
            onClick={exportChatHistory}
            disabled={isExporting || !hasUnexportedMessages}
            className="flex items-center gap-1 border-green-400 bg-green-50 hover:bg-green-100 text-green-700 text-xs h-7 py-0 px-2"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-green-600" />
                <span className="text-xs">送信中</span>
              </>
            ) : (
              <>
                <Send className="h-3 w-3 text-green-600" />
                <span className="text-xs">履歴送信</span>
              </>
            )}
          </Button>
          
          {/* チャット終了ボタン - よりコンパクトに */}
          <Button 
            variant="destructive"
            size="sm"
            onClick={handleEndChat}
            className="flex items-center gap-1 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white border-0 h-7 py-0 px-2"
          >
            <span className="text-xs">チャット終了</span>
          </Button>
        </div>
      </div>
      
      {/* 応急処置ガイドボタン - タブ前に配置して目立たせる */}
      <div className="w-full flex justify-center items-center p-2 bg-gradient-to-r from-blue-100 to-blue-50 border-b border-blue-200">
        <Button
          variant="default"
          size="lg"
          onClick={() => {
            // 現在のテキストボックスの内容を取得
            const messageInput = document.querySelector('textarea, input[type="text"]') as HTMLInputElement | HTMLTextAreaElement;
            if (messageInput) {
              const inputText = messageInput.value.trim();
              setSearchKeyword(inputText);
            } else {
              setSearchKeyword("");
            }
            setEmergencyGuideOpen(true);
          }}
          className="flex items-center gap-2 border-2 border-white bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 shadow-md rounded-lg"
        >
          <Heart className="h-6 w-6 text-white" />
          <span className="text-lg font-bold">応急処置ガイド</span>
        </Button>
      </div>
      
      <div className="flex-1 flex flex-col md:flex-row overflow-auto chat-layout-container" style={{ minHeight: '75vh' }}>
        {/* Chat Messages Area - 領域を2/3に縮小し、縦を元に戻す */}
        <div className="flex-1 flex flex-col h-full min-h-[75vh] overflow-auto md:w-2/3 bg-white chat-messages-container" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
          
          {/* Chat Messages - 高さを1.5倍に */}
          <div id="chatMessages" className="flex-1 overflow-y-auto p-2 sm:p-3 md:p-4 md:px-6 space-y-4 min-w-[300px]" style={{ minHeight: '60vh' }}>
            {messagesLoading || isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-blue-700">メッセージを読み込み中...</p>
              </div>
            ) : !displayMessages || displayMessages.length === 0 ? (
              <div className={`flex items-center justify-center h-full text-center ${isRecording ? 'hidden' : ''}`}>
                <div>
                  <p className="text-xl font-semibold mb-2 text-blue-800">会話を始めましょう</p>
                  <p className="text-sm text-blue-500">保守用車に関する質問を入力するか、マイクボタンをタップして話しかけてください。</p>
                </div>
              </div>
            ) : (
              <>
                {/* 通常のメッセージリスト */}
                {displayMessages.map((message: any, index: number) => (
                  <div key={index} className="w-full md:max-w-2xl mx-auto">
                    <MessageBubble message={message} />
                  </div>
                ))}
              </>
            )}
            
            {/* プレビュー用の一時メッセージ (録音中テキストと撮影した画像のプレビュー) */}
            {draftMessage && draftMessage.content && (
              <div className="w-full md:max-w-2xl mx-auto">
                <MessageBubble
                  message={{
                    id: -1, // 一時的なID
                    content: draftMessage.content,
                    senderId: 1, // 現在のユーザーID
                    isAiResponse: false,
                    timestamp: new Date(),
                    media: draftMessage.media?.map((m, idx) => ({
                      id: idx,
                      messageId: -1,
                      ...m
                    }))
                  }}
                  isDraft={true}
                />
              </div>
            )}
            
            {/* デバッグ表示 - ドラフトメッセージの状態を確認 */}
            <div className="hidden">
              <p>draftMessage: {draftMessage ? JSON.stringify(draftMessage) : 'null'}</p>
            </div>
            
          </div>

          {/* エクスポート状態表示 */}
          {hasUnexportedMessages && (
            <div className="bg-blue-50 p-2 text-sm text-blue-800 flex items-center justify-center border-t border-b border-blue-200">
              <AlertTriangle className="h-4 w-4 mr-2 text-blue-600" />
              <span>{lastExportTimestamp ? '前回の送信以降、新しいメッセージがあります。送信してください。' : 'まだチャット履歴が送信されていません。'}</span>
            </div>
          )}

          {/* Text Selection Controls - Only show when text is selected */}
          {selectedText && <TextSelectionControls text={selectedText} onSearch={searchBySelectedText} />}

          {/* Message Input */}
          <MessageInput />
        </div>

        {/* 関係画像エリア - 右側に1/3のスペースを確保して常に表示 */}
        <div className="hidden md:block md:w-1/3 border-l border-blue-200 bg-blue-50 overflow-y-auto search-results-panel" style={{ minHeight: '75vh' }}>
          <div className="w-full h-full">
            <div className="sticky top-0 bg-blue-600 text-white py-2 px-4 font-medium z-10">
              <h2 className="text-lg">関係画像</h2>
            </div>
            <div className="p-2">
              <SearchResults results={searchResults || []} onClear={clearSearchResults} />
            </div>
          </div>
        </div>
        
        {/* モバイル用検索結果スライダー - 縦向き表示の時のみフローティングボタンを表示 */}
        {searchResults && searchResults.length > 0 && isMobile && orientation === 'portrait' && (
          <div className="fixed bottom-20 right-4 md:hidden mobile-search-button">
            <Button
              onClick={() => {
                const slider = document.getElementById('mobile-search-slider');
                if (slider) {
                  // 縦向きの場合、下から表示
                  if (slider.classList.contains('search-panel-visible')) {
                    slider.classList.remove('search-panel-visible');
                    slider.style.transform = 'translateY(100%)';
                  } else {
                    slider.classList.add('search-panel-visible');
                    slider.style.transform = 'none';
                  }
                }
              }}
              className="rounded-full w-12 h-12 bg-blue-500 hover:bg-blue-600 shadow-lg flex items-center justify-center"
            >
              <span className="text-white font-bold">{searchResults.length}</span>
            </Button>
          </div>
        )}
        
        <div 
          id="mobile-search-slider" 
          className={`fixed transition-transform duration-300 ease-in-out md:hidden z-50 ${
            orientation === 'landscape' 
              ? 'landscape-search-panel inset-y-0 right-0 w-2/5' 
              : 'portrait-search-panel inset-x-0 bottom-0'
          }`}
          style={{ 
            display: searchResults && searchResults.length > 0 ? 'block' : 'none',
            transform: 'translateY(100%)' // 検索ボタンが押された時のみ表示
          }}
        >
          <div className={`bg-blue-50 overflow-y-auto ${
            orientation === 'landscape' 
              ? 'h-full border-l border-blue-200' 
              : 'border-t border-blue-200 rounded-t-xl'
          }`} style={{ maxHeight: orientation === 'landscape' ? '100vh' : '70vh' }}>
            {/* モバイル用タイトルバー */}
            <div className="sticky top-0 bg-blue-600 text-white py-2 px-4 z-10 flex justify-between items-center">
              <h2 className="text-lg font-medium">関係画像</h2>
              <button 
                onClick={() => {
                  // 結果を閉じるのみでクリアはしない
                  const slider = document.getElementById('mobile-search-slider');
                  if (slider) {
                    slider.classList.remove('search-panel-visible');
                    // 横向き・縦向き問わず閉じる
                    slider.style.transform = 'translateY(100%)';
                  }
                }}
                className="text-white hover:text-blue-200 text-xl"
              >
                {orientation === 'portrait' ? '✕' : ''}
              </button>
            </div>
            <div className="search-results-wrapper p-2">
              {/* 直接画像を表示 - 重複フォーム対策 */}
              <div className="flex flex-col gap-4">
                {searchResults.map((result) => (
                  <div 
                    key={result.id} 
                    className="thumbnail-item rounded-lg overflow-hidden bg-transparent shadow-sm w-full hover:bg-blue-50 transition-colors"
                    onClick={() => {
                      // イメージプレビューモーダルを表示
                      window.dispatchEvent(new CustomEvent('preview-image', { 
                        detail: { 
                          url: result.url,
                          pngFallbackUrl: result.pngFallbackUrl, 
                          title: result.title,
                          content: result.content,
                          metadata_json: result.metadata_json,
                          all_slides: result.all_slides
                        } 
                      }));
                    }}
                  >
                    {result.url ? (
                      <div className="flex justify-center items-center w-full bg-transparent border border-blue-200 rounded-lg">
                        <div className="relative w-full h-24 flex-shrink-0">
                          <img 
                            src={result.url} 
                            alt={result.title || "応急処置サポート"} 
                            className="w-full h-full object-contain bg-white p-1"
                            loading="eager"
                            decoding="async"
                            onError={(e) => {
                              const imgElement = e.currentTarget;
                              if (result.pngFallbackUrl && result.url !== result.pngFallbackUrl) {
                                console.log('SVG読み込みエラー、PNG代替に切り替え:', result.url, '->', result.pngFallbackUrl);
                                imgElement.src = result.pngFallbackUrl;
                              }
                            }}
                          />
                          {/* 説明テキストは非表示 */}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-24 w-full bg-transparent border border-blue-200 rounded-lg">
                        <div className="relative w-24 h-24 flex-shrink-0 flex items-center justify-center bg-blue-50">
                          <div className="h-12 w-12 text-blue-600">📄</div>
                        </div>
                        <div className="flex-1 p-2 flex flex-col justify-center">
                          <h3 className="text-sm font-bold text-blue-700">{result.title || "ドキュメント"}</h3>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 未送信のチャット履歴がある場合の警告ダイアログ */}
      <Dialog open={isEndChatDialogOpen} onOpenChange={setIsEndChatDialogOpen}>
        <DialogContent className="bg-blue-50 border border-blue-200">
          <DialogHeader className="border-b border-blue-200 pb-3">
            <DialogTitle className="text-blue-800 text-lg font-bold">チャット履歴が未送信です</DialogTitle>
            <DialogDescription className="text-blue-700">
              まだ送信されていないチャット履歴があります。このまま終了すると、履歴が保存されません。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-between mt-4">
            <Button 
              variant="outline" 
              onClick={() => setIsEndChatDialogOpen(false)}
              className="border-blue-300 text-blue-700 hover:bg-blue-100"
            >
              キャンセル
            </Button>
            <div className="flex gap-2">
              <Button 
                variant="destructive" 
                onClick={() => {
                  setIsEndChatDialogOpen(false);
                  // 直接ログアウト処理を実行
                  fetch("/api/auth/logout", {
                    method: "POST",
                    credentials: "include"
                  })
                  .then(() => {
                    console.log("送信せずに終了: ログアウト成功");
                    queryClient.clear();
                    // ローカルストレージのクエリキャッシュをクリア
                    for (const key of Object.keys(localStorage)) {
                      if (key.startsWith('rq-')) {
                        localStorage.removeItem(key);
                      }
                    }
                    // JavaScript直接のリダイレクトを使用（より確実なリダイレクト）
                    window.location.href = "/login";
                  })
                  .catch((error) => {
                    console.error("送信せずに終了: ログアウトエラー:", error);
                    // エラーが発生してもログイン画面に遷移
                    window.location.href = "/login";
                  });
                }}
                className="bg-red-500 hover:bg-red-600"
              >
                送信せずに終了
              </Button>
              <Button 
                variant="default" 
                onClick={handleSendAndEnd}
                disabled={isExporting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>送信中...</span>
                  </>
                ) : (
                  <span>送信して終了</span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      <CameraModal />
      <ImagePreviewModal />
      
      {/* 応急処置ガイドモーダル（モバイル・デスクトップ共通） */}
      <Dialog open={emergencyGuideOpen} onOpenChange={setEmergencyGuideOpen}>
        <DialogContent className={`bg-blue-50 border border-blue-200 ${isMobile ? 'w-[95%] max-w-md' : 'max-w-3xl'}`}>
          <DialogHeader className="border-b border-blue-200 pb-3">
            <DialogTitle className="text-blue-800 text-lg font-bold flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              <span>応急処置ガイド</span>
            </DialogTitle>
            <DialogDescription className="text-blue-700">
              症状を選択するか、キーワードで検索してください
            </DialogDescription>
          </DialogHeader>
          <div className={`overflow-y-auto py-2 ${isMobile ? 'max-h-[70vh]' : 'max-h-[75vh]'}`}>
            <TroubleshootingSelector initialSearchKeyword={searchKeyword} />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEmergencyGuideOpen(false)}
              className="w-full border-blue-300 text-blue-700 hover:bg-blue-100"
            >
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
