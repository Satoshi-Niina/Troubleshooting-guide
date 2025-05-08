import { useState, useRef, useEffect } from "react";
import { useChat } from "@/context/chat-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Send, Camera, Mic, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export default function MessageInput() {
  const [message, setMessage] = useState("");
  const { 
    sendMessage, 
    isLoading, 
    recordedText, 
    selectedText, 
    searchBySelectedText,
    startRecording,
    stopRecording,
    isRecording
  } = useChat();
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 選択されたテキストが変更されたら入力欄に反映
  useEffect(() => {
    if (selectedText) {
      setMessage(selectedText);
      if (isMobile && textareaRef.current) {
        textareaRef.current.focus();
      } else if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }, [selectedText, isMobile]);
  
  // 録音テキストをリアルタイムで入力欄とチャットエリアの両方に反映する
  useEffect(() => {
    if (isRecording && recordedText) {
      // 入力欄に反映
      setMessage(recordedText);
      
      // chat-context のドラフトメッセージも更新し、チャットエリア（左側）にも表示
      if (recordedText.trim()) {
        // チャットエリア側にドラフトメッセージを設定
        const setDraftMessage = async () => {
          // ドラフトメッセージの更新イベントを発火
          window.dispatchEvent(new CustomEvent('update-draft-message', { 
            detail: { content: recordedText }
          }));
        };
        setDraftMessage();
      }
    }
  }, [recordedText, isRecording]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const textToSend = recordedText.trim() || message.trim();
    if (!textToSend || isLoading) return;
    
    // メッセージを送信
    await sendMessage(textToSend);
    
    // メッセージと同じテキストで画像検索を自動実行
    try {
      // 送信したメッセージを使って画像検索を実行
      await searchBySelectedText(textToSend);
      
      // モバイルで検索結果パネルを表示
      if (isMobile) {
        const slider = document.getElementById('mobile-search-slider');
        if (slider) {
          slider.classList.add('search-panel-visible');
          const orientation = window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
          
          if (orientation === 'landscape') {
            // 横向きの場合は右から表示
            slider.style.transform = 'translateX(0)';
          } else {
            // 縦向きの場合は下から表示
            slider.style.transform = 'translateY(0)';
          }
        }
      }
    } catch (error) {
      console.error('自動画像検索エラー:', error);
    }
    
    // 入力欄をクリア
    setMessage("");
    
    // フォーカス処理
    if (isMobile && textareaRef.current) {
      textareaRef.current.focus();
      // モバイルでキーボードが消えないように少し遅延
      setTimeout(() => {
        textareaRef.current?.blur();
      }, 100);
    } else if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleCameraClick = () => {
    // カメラモーダルを開く
    window.dispatchEvent(new CustomEvent('open-camera'));
  };

  const handleMicClick = () => {
    // マイク録音機能の切り替え - ChatContextの関数を使用
    if (!isRecording) {
      // 録音開始
      console.log('録音開始');
      startRecording();
    } else {
      // 録音停止
      console.log('録音停止');
      stopRecording();
      
      // 録音停止時も入力欄に反映する
      if (recordedText.trim()) {
        setMessage(recordedText.trim());
      }
    }
  };
  
  // テキスト入力欄をクリアする
  const handleClearText = () => {
    setMessage("");
    if (isMobile && textareaRef.current) {
      textareaRef.current.focus();
    } else if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-t border-blue-200 p-2 message-input-container">
      <form onSubmit={handleSubmit} className="flex items-center">
        {/* モバイル向けマイクボタン - 左配置 - コンパクト化 */}
        <div className="md:hidden flex flex-col items-center mr-2">
          <span className="text-xs font-medium text-orange-700 mb-0.5">マイク</span>
          <Button 
            type="button" 
            onClick={handleMicClick}
            size="icon"
            variant={isRecording ? "default" : "ghost"}
            className={`p-2 h-10 w-10 rounded-full ${isRecording 
              ? "bg-gradient-to-r from-red-500 to-pink-500" 
              : "bg-gradient-to-r from-amber-100 to-orange-100 hover:from-amber-200 hover:to-orange-200 border border-orange-300"}`}
          >
            <Mic className={`h-5 w-5 ${isRecording ? "text-white" : "text-orange-600"}`} />
          </Button>
        </div>
        
        {/* デスクトップ向けマイクボタン - 左配置 - コンパクト化 */}
        <div className="hidden md:flex md:flex-col md:items-center md:mr-2">
          <span className="text-xs font-medium text-orange-700 mb-0.5">マイク</span>
          <Button 
            type="button" 
            onClick={handleMicClick}
            size="icon"
            variant={isRecording ? "default" : "ghost"}
            className={`p-2 h-10 w-10 rounded-full ${isRecording 
              ? "bg-gradient-to-r from-red-500 to-pink-500" 
              : "bg-gradient-to-r from-amber-100 to-orange-100 hover:from-amber-200 hover:to-orange-200 border border-orange-300"}`}
          >
            <Mic className={`h-5 w-5 ${isRecording ? "text-white" : "text-orange-600"}`} />
          </Button>
        </div>
        
        {/* 入力エリア - 小さめ固定高さでオーバーフロー時はスクロール */}
        <div className="flex-1 flex items-center bg-white border border-blue-200 rounded-full px-3 py-1 shadow-inner">
          {isMobile ? (
            /* モバイル用テキストエリア（より小さく） */
            <div className="flex-1 relative h-[32px]"> {/* 高さを小さく */}
              <Textarea
                ref={textareaRef}
                className="absolute inset-0 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-1 overflow-y-auto text-sm"
                placeholder={isRecording ? "話しかけてください..." : "メッセージを入力..."}
                value={message}
                onChange={handleInputChange}
                disabled={isLoading}
                rows={1}
                style={{ lineHeight: '1.2' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              {/* テキストがある場合にのみクリアボタンを表示 */}
              {message.trim() && (
                <button
                  type="button"
                  onClick={handleClearText}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ) : (
            /* デスクトップ用インプット（より小さく） */
            <div className="flex-1 h-[32px] flex items-center relative"> {/* 高さを小さく */}
              <Input
                ref={inputRef}
                type="text"
                className="w-full h-full bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
                placeholder={isRecording ? "話しかけてください..." : "メッセージを入力..."}
                value={message}
                onChange={handleInputChange}
                disabled={isLoading}
              />
              {/* テキストがある場合にのみクリアボタンを表示 */}
              {message.trim() && (
                <button
                  type="button"
                  onClick={handleClearText}
                  className="absolute right-1 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          <Button 
            type="submit" 
            disabled={isLoading || (!message.trim() && !recordedText.trim())}
            size="icon"
            variant="ghost"
            className="ml-1 p-1 min-w-[28px] min-h-[28px] h-7 w-7 bg-gradient-to-r from-sky-100 to-blue-100 hover:from-sky-200 hover:to-blue-200 rounded-full border border-blue-300"
          >
            <Send className="h-4 w-4 text-blue-600" />
          </Button>
        </div>
        
        {/* モバイル向けカメラボタン - 右配置 - コンパクト化 */}
        <div className="md:hidden flex flex-col items-center ml-2">
          <span className="text-xs font-medium text-indigo-700 mb-0.5">カメラ</span>
          <Button 
            type="button" 
            onClick={handleCameraClick}
            size="icon"
            variant="ghost"
            className="p-2 h-10 w-10 rounded-full bg-gradient-to-r from-indigo-100 to-cyan-100 hover:from-indigo-200 hover:to-cyan-200 border border-indigo-300"
          >
            <Camera className="h-5 w-5 text-indigo-600" />
          </Button>
        </div>
        
        {/* デスクトップ向けのカメラボタン - 右配置 - コンパクト化 */}
        <div className="hidden md:flex md:flex-col md:items-center md:ml-2">
          <span className="text-xs font-medium text-indigo-700 mb-0.5">カメラ</span>
          <Button 
            type="button" 
            onClick={handleCameraClick}
            size="icon"
            variant="ghost"
            className="p-2 h-10 w-10 rounded-full bg-gradient-to-r from-indigo-100 to-cyan-100 hover:from-indigo-200 hover:to-cyan-200 border border-indigo-300"
          >
            <Camera className="h-5 w-5 text-indigo-600" />
          </Button>
        </div>
      </form>
    </div>
  );
}