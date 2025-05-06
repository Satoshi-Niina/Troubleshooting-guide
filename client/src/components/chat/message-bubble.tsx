import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useChat } from "@/context/chat-context";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Copy, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { speakText, stopSpeaking } from "@/lib/text-to-speech";

interface MessageBubbleProps {
  message: {
    id: number;
    content: string;
    senderId: number | null;
    isAiResponse: boolean;
    timestamp: Date;
    media?: {
      id: number;
      type: string;
      url: string;
      thumbnail?: string;
    }[];
  };
  isDraft?: boolean;
}

export default function MessageBubble({ message, isDraft = false }: MessageBubbleProps) {
  const { user } = useAuth();
  const { setSelectedText } = useChat();
  const [localSelectedText, setLocalSelectedText] = useState("");
  const [showCopyButton, setShowCopyButton] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { toast } = useToast();
  
  const isUserMessage = !message.isAiResponse;
  const formattedTime = format(
    new Date(message.timestamp), 
    "HH:mm", 
    { locale: ja }
  );

  // Handle text selection within this message
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const selectedTextValue = selection.toString().trim();
      setLocalSelectedText(selectedTextValue);
      setShowCopyButton(true);
    } else {
      setLocalSelectedText("");
      setShowCopyButton(false);
    }
  };
  
  // テキストをメッセージ入力欄にコピーする
  const copyToInput = () => {
    if (localSelectedText) {
      setSelectedText(localSelectedText);
      toast({
        title: "テキストをコピーしました",
        description: "選択したテキストが入力欄にコピーされました。",
      });
      setShowCopyButton(false);
    }
  };
  
  // テキストを音声で読み上げる
  const handleTextToSpeech = async () => {
    if (isSpeaking) {
      // 読み上げ中なら停止
      stopSpeaking();
      setIsSpeaking(false);
      toast({
        title: "音声読み上げを停止しました",
        duration: 2000,
      });
    } else {
      // AIの回答のみ読み上げ可能
      if (!isUserMessage && message.content) {
        setIsSpeaking(true);
        toast({
          title: "音声読み上げを開始します",
          duration: 2000,
        });
        
        try {
          await speakText(message.content, {
            rate: 1.0,
            pitch: 1.0,
            lang: 'ja-JP'
          });
        } catch (error) {
          toast({
            title: "音声読み上げエラー",
            description: error instanceof Error ? error.message : "音声の読み上げに失敗しました",
            variant: "destructive",
          });
        } finally {
          setIsSpeaking(false);
        }
      }
    }
  };

  // HTMLコンテンツを安全に表示する関数
  const renderContent = (content: string) => {
    // HTMLエスケープされたコンテンツを安全に表示
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  };

  return (
    <div 
      className={`flex items-end mb-4 ${isUserMessage ? "" : "flex-row-reverse"} min-w-[250px]`}
      onMouseUp={handleMouseUp}
    >
      <div className={`mx-2 flex flex-col ${isUserMessage ? "items-start" : "items-end"} max-w-[70%] min-w-[230px]`}>
        <div className="flex items-center gap-2 mb-1">
          {/* AIメッセージの場合に音声読み上げボタンを表示 */}
          {!isUserMessage && (
            <button
              onClick={handleTextToSpeech}
              className={`w-8 h-8 flex items-center justify-center rounded-full shadow-sm 
                ${isSpeaking 
                  ? "bg-indigo-600 text-white animate-pulse" 
                  : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}
              title={isSpeaking ? "音声読み上げを停止" : "音声読み上げ"}
            >
              <Volume2 size={16} />
            </button>
          )}
        </div>
        
        <div className={`rounded-lg p-3 ${
          isUserMessage 
            ? "bg-blue-100 text-gray-800" 
            : "bg-indigo-100 text-gray-800"
        }`}>
          {renderContent(message.content)}
        </div>
        
        {/* メディアの表示 */}
        {message.media && message.media.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.media.map((media) => (
              <div key={media.id} className="relative">
                {media.type === 'image' && (
                  <img
                    src={media.url}
                    alt="添付画像"
                    className="max-w-full rounded-lg"
                  />
                )}
                {media.type === 'video' && (
                  <video
                    src={media.url}
                    controls
                    className="max-w-full rounded-lg"
                    poster={media.thumbnail}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="text-xs text-gray-500 mt-1">
          {formattedTime}
        </div>
      </div>
      <div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isUserMessage ? "bg-blue-500" : "bg-indigo-600"
        }`}>
          <span className={`material-icons text-white text-sm ${
            isUserMessage ? "" : ""
          }`}>
            {isUserMessage ? "person" : "smart_toy"}
          </span>
        </div>
      </div>
    </div>
  );
}
