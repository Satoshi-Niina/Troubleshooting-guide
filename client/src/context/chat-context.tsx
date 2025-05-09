import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  startSpeechRecognition, 
  stopSpeechRecognition,
  startBrowserSpeechRecognition,
  stopBrowserSpeechRecognition
} from '@/lib/azure-speech';
// import the searchByText function and cancelSearch correctly
import * as ImageSearch from '@/lib/image-search';
import { searchByText, cancelSearch } from '@/lib/image-search';

// オフライン同期機能のインポート
import { 
  storeUnsyncedMessage, 
  storeUnsyncedMedia, 
  getUnsyncedMessages,
  optimizeImageDataUrl 
} from '@/lib/offline-storage';
import { syncChat } from '@/lib/sync-api';
import { registerServiceWorker, requestBackgroundSync } from '@/lib/service-worker';
// トラブルシューティングフロー検索機能
import { searchTroubleshootingFlow, searchTroubleshootingFlows, SearchResult, japaneseGuideTitles } from '../lib/troubleshooting-search';
import { openDatabase } from "@/lib/indexed-db";

interface Media {
  id: number;
  messageId: number;
  type: string;
  url: string;
  thumbnail?: string;
}

interface Message {
  id: number;
  content: string;
  senderId: number | null;
  isAiResponse: boolean;
  timestamp: Date;
  chatId: number;
  media?: Media[];
}

interface ChatContextValue {
  messages: Message[];
  isLoading: boolean;
  searching: boolean;
  searchResults: any[];
  selectedText: string;
  setSelectedText: (text: string) => void;
  sendMessage: (content: string, mediaUrls?: { type: string, url: string, thumbnail?: string }[]) => Promise<void>;
  startRecording: () => void;
  stopRecording: () => void;
  isRecording: boolean;
  recordedText: string;
  searchBySelectedText: (text: string) => Promise<void>;
  clearSearchResults: () => void;
  captureImage: (imageData: string, type: 'image' | 'video') => Promise<void>;
  exportChatHistory: () => Promise<void>;
  exportFormattedData: () => Promise<object>;
  lastExportTimestamp: Date | null;
  isExporting: boolean;
  hasUnexportedMessages: boolean;
  sendEmergencyGuide: (guideTitle: string, guideContent: string) => Promise<void>;
  draftMessage: { content: string, media?: { type: string, url: string, thumbnail?: string }[] } | null;
  clearChatHistory: () => Promise<void>;
  isClearing: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === null) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedText, setRecordedText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [lastExportTimestamp, setLastExportTimestamp] = useState<Date | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [hasUnexportedMessages, setHasUnexportedMessages] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [tempMedia, setTempMedia] = useState<{ type: string, url: string, thumbnail?: string }[]>([]);
  // プレビュー用一時メッセージ（まだ送信していないがユーザー入力前に表示するためのメッセージ）
  const [draftMessage, setDraftMessage] = useState<{
    content: string,
    media?: { type: string, url: string, thumbnail?: string }[]
  } | null>(null);
  const { toast } = useToast();
  const lastSentTextsRef = useRef<string[]>([]); // 直近の送信内容を記録
  
  // チャットの初期化
  const initializeChat = useCallback(async () => {
    try {
      setIsInitializing(true);
      
      // 既存のチャットを取得する
      const chatsResponse = await apiRequest('GET', '/api/chats');
      
      if (!chatsResponse.ok) {
        // 認証エラーなどの場合は処理を中断
        throw new Error('チャットの取得に失敗しました');
      }
      
      const chats = await chatsResponse.json();
      
      // チャットが存在する場合は最初のチャットを使用
      if (chats && chats.length > 0) {
        setChatId(chats[0].id);
        return chats[0].id;
      }
      
      // チャットが存在しない場合は新しいチャットを作成
      const createResponse = await apiRequest('POST', '/api/chats', {
        title: '保守用車ナレッジチャット'
      });
      
      const newChat = await createResponse.json();
      setChatId(newChat.id);
      return newChat.id;
    } catch (error) {
      console.error('Failed to initialize chat:', error);
      // 401エラーの場合はトーストを表示しない（未ログイン時）
      if (!(error instanceof Error && error.message.includes('401'))) {
        toast({
          title: 'チャット初期化エラー',
          description: 'チャットの初期化に失敗しました。',
          variant: 'destructive',
        });
      }
      return null;
    } finally {
      setIsInitializing(false);
    }
  }, [toast]);
  
  // コンポーネントマウント時にチャットを初期化
  useEffect(() => {
    initializeChat();
  }, [initializeChat]);

  // チャットメッセージの初期読み込み
  useEffect(() => {
    const loadMessages = async () => {
      if (!chatId) return;
      
      try {
        const response = await apiRequest('GET', `/api/chats/${chatId}/messages`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })));
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };
    
    if (chatId) {
      loadMessages();
    }
  }, [chatId]);

  const sendMessage = async (content: string, mediaUrls?: { type: string, url: string, thumbnail?: string }[]) => {
    try {
      if (!chatId) {
        // チャットが初期化されていない場合は初期化
        const newChatId = await initializeChat();
        if (!newChatId) {
          throw new Error('チャットの初期化に失敗しました');
        }
      }
      
      setIsLoading(true);
      
      // ドラフトメッセージをクリア
      setDraftMessage(null);
      
      const currentChatId = chatId || 1;
      
      // ユーザー設定からAIモードを取得
      const useOnlyKnowledgeBase = localStorage.getItem('useOnlyKnowledgeBase') !== 'false';
      // Perplexity APIキーが設定されるまでは無効化
      const usePerplexity = false; // localStorage.getItem('usePerplexity') === 'true';
      console.log('送信時設定: ナレッジベースのみを使用=', useOnlyKnowledgeBase, ', Perplexity使用=', usePerplexity);
      
      const response = await apiRequest('POST', `/api/chats/${currentChatId}/messages`, { 
        content,
        useOnlyKnowledgeBase,
        usePerplexity: false
      });
      if (!response.ok) {
        throw new Error('メッセージの送信に失敗しました');
      }
      
      const data = await response.json();
      
      // 一時保存されたメディアとパラメータで渡されたメディアを結合
      const allMedia = [
        ...(tempMedia || []),
        ...(mediaUrls || [])
      ];
      
      // ユーザーメッセージとAI応答を同時に追加（ユーザーメッセージが重複しないよう1回のみ追加）
      setMessages(prev => [
        ...prev, 
        { 
          ...data.userMessage, 
          timestamp: new Date(data.userMessage.timestamp),
          media: allMedia.length > 0 ? allMedia.map((media, idx) => ({
            id: Date.now() + idx,
            messageId: data.userMessage.id,
            ...media
          })) : []
        },
        {
          ...data.aiMessage,
          timestamp: new Date(data.aiMessage.timestamp)
        }
      ]);
      
      // 一時メディアをクリア
      setTempMedia([]);
      
      setRecordedText('');
      
      // メッセージ送信後に自動的に画像検索を実行
      searchBySelectedText(content);
    } catch (error) {
      toast({
        title: 'メッセージ送信エラー',
        description: 'メッセージを送信できませんでした。',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = useCallback(() => {
    setIsRecording(true);
    setRecordedText(''); // 録音開始時にテキストをクリア
    try {
      const currentMedia = draftMessage?.media || [];
      const isIOSDevice = () => {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      };
      // 音声認識結果をリアルタイム送信するコールバック
      const handleRealtimeSend = (text: string) => {
        const trimmed = text.trim();
        // 2文字以下は送信しない
        if (trimmed.length <= 2) return;
        // 直近5件に同じ内容があれば送信しない
        if (lastSentTextsRef.current.includes(trimmed)) return;
        // 送信
        sendMessage(trimmed, currentMedia);
        // 直近5件に追加（最大5件まで）
        lastSentTextsRef.current = [trimmed, ...lastSentTextsRef.current].slice(0, 5);
      };
      if (isIOSDevice()) {
        startSpeechRecognition(
          (text: string) => {
            handleRealtimeSend(text);
          },
          (error: string) => {
            console.error('Azure音声認識エラー:', error);
            toast({
              title: '音声認識エラー',
              description: error,
              variant: 'destructive',
            });
            setIsRecording(false);
          }
        );
        return;
      }
      startBrowserSpeechRecognition(
        (text: string) => {
          handleRealtimeSend(text);
        },
        (error: string) => {
          toast({
            title: 'ブラウザ音声認識が使用できません',
            description: 'Azure音声認識を使用します',
            duration: 2000,
          });
          startSpeechRecognition(
            (text: string) => {
              handleRealtimeSend(text);
            },
            (error: string) => {
              console.error('Azure音声認識エラー:', error);
              toast({
                title: '音声認識エラー',
                description: error,
                variant: 'destructive',
              });
              setIsRecording(false);
            }
          );
        }
      );
    } catch (error) {
      console.error('音声認識初期化エラー:', error);
      toast({
        title: '音声認識エラー',
        description: '音声認識の初期化に失敗しました',
        variant: 'destructive',
      });
      setIsRecording(false);
    }
  }, [toast, draftMessage, sendMessage]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    stopSpeechRecognition();
    stopBrowserSpeechRecognition();
    setDraftMessage(null); // draftMessageのみクリア
    // recordedTextやsendMessageは呼ばない
  }, [setDraftMessage]);

  const searchBySelectedText = async (text: string) => {
    // すでに検索中の場合は処理をスキップ
    if (searching) {
      console.log("すでに検索処理中のため、この検索リクエストはスキップします");
      return;
    }
    
    try {
      setSearching(true);
      
      // テキスト内に特定のキーワードが含まれているか確認（検索の補助用）
      const engineRelatedWords = ['エンジン', 'engine', '故障', '停止', '冷却', '出力'];
      const frameRelatedWords = ['フレーム', '車体', '構造', 'シャーシ', '台車', '車両'];
      const cabinRelatedWords = ['運転室', 'キャビン', '操作', 'コックピット', '計器', 'メーター'];
      
      // キーワードタイプの判定（複数カテゴリに対応）
      const hasEngineKeyword = engineRelatedWords.some(word => text.toLowerCase().includes(word.toLowerCase()));
      const hasFrameKeyword = frameRelatedWords.some(word => text.toLowerCase().includes(word.toLowerCase()));
      const hasCabinKeyword = cabinRelatedWords.some(word => text.toLowerCase().includes(word.toLowerCase()));
      
      console.log("検索キーワード:", text);
      console.log("キーワードタイプ:", 
                  hasEngineKeyword ? "エンジン関連あり" : "", 
                  hasFrameKeyword ? "車体関連あり" : "",
                  hasCabinKeyword ? "運転室関連あり" : "");
      
      // 検索結果を取得する (検索結果が表示されたら自動的に検索を停止)
      const results = await ImageSearch.searchByText(text, true);
      
      // 検索結果が見つかったら検索を停止（サムネイル点滅防止）
      if (results.length > 0) {
        ImageSearch.cancelSearch();
        console.log("検索結果が見つかったため画像検索を停止します");
      }
      
      console.log("検索結果数:", results.length);
      
      // 検索結果がない場合にキーワードに応じた画像を提示
      if (results.length === 0) {
        if (hasEngineKeyword) {
          console.log("エンジン関連キーワードを検出しました。関連画像を表示します。");
          
          // エンジン関連の画像を表示
          results.push({
            id: "engine_related",
            title: "保守用車のエンジン",
            type: "svg-image",
            url: "/knowledge-base/images/mc_1744105287766_001.svg",
            pngFallbackUrl: "/knowledge-base/images/mc_1744105287766_001.png",
            content: "軌道モータカーのエンジンは高トルクが出せるディーゼルエンジンを使用しています。エンジン故障時は点検が必要です。",
            relevance: 80
          });
        }
        
        if (hasFrameKeyword) {
          console.log("車体関連キーワードを検出しました。関連画像を表示します。");
          
          // 車体関連の画像を表示
          results.push({
            id: "frame_related",
            title: "車体フレーム構造",
            type: "svg-image",
            url: "/knowledge-base/images/mc_1744105287766_003.svg",
            pngFallbackUrl: "/knowledge-base/images/mc_1744105287766_003.png",
            content: "保守用車の車体フレーム構造は、強度と軽量性を両立した設計です。各部材の点検は定期的に行いましょう。",
            relevance: 80
          });
        }
        
        if (hasCabinKeyword) {
          console.log("運転室関連キーワードを検出しました。関連画像を表示します。");
          
          // 運転室関連の画像を表示
          results.push({
            id: "cabin_related",
            title: "運転キャビン配置図",
            type: "svg-image",
            url: "/knowledge-base/images/mc_1744105287766_004.svg",
            pngFallbackUrl: "/knowledge-base/images/mc_1744105287766_004.png",
            content: "運転キャビン内の各操作機器は人間工学に基づいて配置されています。定期的に各機器の点検を行いましょう。",
            relevance: 80
          });
        }
      } else if (results.length < 2) {
        // 検索結果が1件しかない場合、もう1件追加（ただしカテゴリに応じて）
        console.log("検索結果が少ないため、追加の画像を表示します");
        
        // 一般的な保守用車の画像を追加
        results.push({
          id: "default_help",
          title: "保守用車サポート",
          type: "svg-image",
          url: "/knowledge-base/images/mc_1744105287766_001.svg",
          pngFallbackUrl: "/knowledge-base/images/mc_1744105287766_001.png", // PNG代替を追加
          content: "保守用車の基本情報です。具体的なキーワードで検索するとより詳細な情報が表示されます。",
          relevance: 60
        });
        
        // 2枚目のデフォルト画像も追加
        results.push({
          id: "default_help_2",
          title: "保守車両点検マニュアル",
          type: "svg-image",
          url: "/knowledge-base/images/mc_1744105287766_002.svg",
          pngFallbackUrl: "/knowledge-base/images/mc_1744105287766_002.png", // PNG代替を追加
          content: "保守用車両の点検手順と安全確認事項です。緊急時は必ず安全を確保してください。",
          relevance: 55
        });
      }
      
      // URL形式が正しいことを確認
      const processedResults = results.map(result => {
        // メインURLの処理
        if (result.url && !result.url.startsWith('http') && !result.url.startsWith('/')) {
          result.url = '/' + result.url;
          console.log('画像パス修正:', result.url);
        }
        
        // PNG代替URLの処理
        if (result.pngFallbackUrl && !result.pngFallbackUrl.startsWith('http') && !result.pngFallbackUrl.startsWith('/')) {
          result.pngFallbackUrl = '/' + result.pngFallbackUrl;
          console.log('PNG代替パス修正:', result.pngFallbackUrl);
        }
        
        return result;
      });
      
      setSearchResults(processedResults);
      
      // 検索結果がある場合、コンソールに表示
      if (processedResults.length > 0) {
        console.log("処理済み検索結果:", processedResults.length, "件");
        console.log("最初の結果:", processedResults[0]);
      } else {
        console.log("「" + text + "」に関する検索結果はありませんでした");
      }
    } catch (error) {
      console.error('検索エラー:', error);
      toast({
        title: '検索エラー',
        description: '検索に失敗しました。',
        variant: 'destructive',
      });
    } finally {
      setSearching(false);
    }
  };

  const clearSearchResults = () => {
    setSearchResults([]);
  };

  const captureImage = async (imageData: string, type: 'image' | 'video') => {
    try {
      // 一時的にメディアを保存
      const newMedia = {
        type,
        url: imageData,
        thumbnail: type === 'video' ? imageData : undefined
      };
      
      setTempMedia(prev => [...prev, newMedia]);
      
      // プレビュー用のドラフトメッセージを作成（左側のチャットに表示）
      setDraftMessage({
        content: "",
        media: [{
          type,
          url: imageData,
          thumbnail: type === 'video' ? imageData : undefined
        }]
      });
      
      // プレビュー用のイベントを発火
      window.dispatchEvent(new CustomEvent('preview-image', { 
        detail: { 
          url: imageData,
          isTemp: true 
        }
      }));
      
      toast({
        title: `${type === 'image' ? '画像' : '動画'}がキャプチャされました`,
        description: 'メッセージを入力して送信してください。',
      });
    } catch (error) {
      toast({
        title: 'キャプチャエラー',
        description: 'メディアのキャプチャに失敗しました。',
        variant: 'destructive',
      });
    }
  };
  
  // チャット履歴をエクスポートする関数
  const exportChatHistory = async () => {
    if (!chatId) return;
    
    try {
      setIsExporting(true);
      
      // 最後のエクスポートタイムスタンプを送信
      const response = await apiRequest(
        'POST', 
        `/api/chats/${chatId}/export`, 
        `/api/tech-support/chats/${chatId}/export`, 
        { lastExportTimestamp: lastExportTimestamp ? lastExportTimestamp.toISOString() : null }
      );
      
      const result = await response.json();
      
      if (result.success) {
        // 新しいエクスポートタイムスタンプを設定
        const exportTime = new Date(result.exportTimestamp);
        setLastExportTimestamp(exportTime);
        setHasUnexportedMessages(false);
        
        // エクスポート成功時に履歴を画面からクリア
        // エクスポート時間より前のメッセージのみをクリア
        const newMessages = messages.filter(msg => 
          new Date(msg.timestamp) > exportTime
        );
        setMessages(newMessages);
        
        toast({
          title: 'チャット履歴を送信しました',
          description: `${result.messageCount}件のメッセージが正常に送信されました。`,
        });
      }
    } catch (error) {
      // エラーがエクスポートテーブル未作成の場合は、テーブルがないためのエラーとして処理
      const errorMsg = error instanceof Error ? error.message : '';
      if (errorMsg.includes('relation "chat_exports" does not exist')) {
        toast({
          title: '履歴送信機能が準備中',
          description: 'エクスポート機能がまだ完全に設定されていません。チャット履歴は保存されています。',
          variant: 'default',
        });
      } else {
        toast({
          title: '履歴送信エラー',
          description: 'チャット履歴の送信に失敗しました。',
          variant: 'destructive',
        });
      }
    } finally {
      setIsExporting(false);
    }
  };
  
  // 外部AI分析システム向けにフォーマット済みデータを取得する関数
  const exportFormattedData = async (): Promise<object> => {
    if (!chatId) {
      throw new Error('チャットが初期化されていません');
    }
    
    try {
      // フォーマット済みデータを取得するAPIを呼び出し
      const response = await apiRequest(
        'GET', 
        `/api/chats/${chatId}/export-formatted`
      );
      
      if (!response.ok) {
        throw new Error('フォーマット済みデータの取得に失敗しました');
      }
      
      const formattedData = await response.json();
      
      // 成功トースト通知
      toast({
        title: 'データを取得しました',
        description: '外部システム向けのフォーマット済みデータを取得しました。',
      });
      
      return formattedData;
    } catch (error) {
      console.error('Error exporting formatted data:', error);
      toast({
        title: 'データ取得エラー',
        description: '外部システム向けデータの取得に失敗しました。',
        variant: 'destructive',
      });
      throw error;
    }
  };
  
  // 最後のエクスポート履歴を取得
  const fetchLastExport = useCallback(async () => {
    if (!chatId) return;
    
    try {
      const response = await apiRequest('GET', `/api/tech-support/chats/${chatId}/last-export`);
      const data = await response.json();
      
      if (data.timestamp) {
        setLastExportTimestamp(new Date(data.timestamp));
      }
    } catch (error) {
      console.error('Failed to fetch last export:', error);
    }
  }, [chatId]);
  
  // コンポーネントがマウントされたときに最後のエクスポート履歴を取得
  useEffect(() => {
    fetchLastExport();
  }, [fetchLastExport]);
  
  // メッセージが追加されたときに、未エクスポートのメッセージがあることを示す
  useEffect(() => {
    if (messages.length > 0 && lastExportTimestamp) {
      // 最後のエクスポート以降のメッセージがあるかチェック
      const hasNewMessages = messages.some(msg => new Date(msg.timestamp) > lastExportTimestamp);
      setHasUnexportedMessages(hasNewMessages);
    } else if (messages.length > 0) {
      // まだエクスポートしていない場合は、メッセージがあれば未エクスポート状態
      setHasUnexportedMessages(true);
    }
  }, [messages, lastExportTimestamp]);
  
  // 応急処置ガイドをチャットメッセージとして送信する関数
  const sendEmergencyGuide = async (guideTitle: string, guideContent: string) => {
    try {
      setIsLoading(true);
      
      // japaneseGuideTitlesからインポートした日本語タイトルのマッピングを使用
      // 英語ファイル名を日本語に変換
      const japaneseGuideTitle = japaneseGuideTitles[guideTitle.toLowerCase()] || guideTitle;
      
      // 日本語タイトルでチャットメッセージを送信
      if (japaneseGuideTitle !== guideTitle) {
        console.log(`ガイドタイトルを変換しました: ${guideTitle} → ${japaneseGuideTitle}`);
      }
      
      // チャットテキストからトラブルシューティングフローを検索
      // チャットから応急処置ガイドを起動した場合、チャットのテキストをキーワードにして
      // 関連性の高いトラブルシューティングフローID（手順ID）を取得
      let matchingResults: SearchResult[] = [];
      try {
        // チャットのテキストを使ってフロー検索（複数結果を取得）
        matchingResults = await searchTroubleshootingFlows(guideContent);
        
        if (matchingResults.length > 0) {
          console.log('チャットテキストから関連フロー検出:', matchingResults.length, '件');
          
          // 検索結果が1件のみの場合は自動的に表示
          if (matchingResults.length === 1) {
            const bestMatchingFlowId = matchingResults[0].id;
            console.log('チャットテキストから最適なフローID検出（自動表示）:', bestMatchingFlowId);
            
            // 関連フローIDをカスタムイベントで通知して自動的に表示
            window.dispatchEvent(new CustomEvent('select-troubleshooting-flow', { 
              detail: { 
                flowId: bestMatchingFlowId,
                autoDisplay: true // 自動表示フラグ
              }
            }));
          } else if (matchingResults.length > 1) {
            // 複数の検索結果がある場合、最も関連性の高いものを送信（自動表示はしない）
            const bestMatchingFlowId = matchingResults[0].id;
            console.log('チャットテキストから最適なフローID検出（選択肢あり）:', bestMatchingFlowId);
            
            // 関連フローIDをカスタムイベントで通知（選択肢あり）
            window.dispatchEvent(new CustomEvent('select-troubleshooting-flow', { 
              detail: { 
                flowId: bestMatchingFlowId,
                results: matchingResults,
                autoDisplay: false
              }
            }));
          }
        }
      } catch (flowSearchError) {
        console.warn('フロー検索エラー:', flowSearchError);
      }
      
      // チャットID取得またはチャット初期化
      let currentChatId = chatId;
      
      if (!currentChatId) {
        try {
          // チャット一覧を取得して最初のチャットIDを使用
          const chatsResponse = await apiRequest('GET', '/api/chats');
          
          if (chatsResponse.ok) {
            const chats = await chatsResponse.json();
            if (chats && chats.length > 0) {
              currentChatId = chats[0].id;
              setChatId(currentChatId);
            } else {
              // チャットが存在しない場合は新規作成
              const createResponse = await apiRequest('POST', '/api/chats', {
                title: '保守用車ナレッジチャット'
              });
              
              if (createResponse.ok) {
                const newChat = await createResponse.json();
                currentChatId = newChat.id;
                setChatId(currentChatId);
              } else {
                throw new Error('チャットの作成に失敗しました');
              }
            }
          } else if (chatsResponse.status === 401) {
            throw new Error('認証エラー: ログインが必要です');
          } else {
            throw new Error(`チャット取得エラー: ${chatsResponse.status}`);
          }
        } catch (initError: any) {
          console.error('チャット初期化エラー:', initError);
          throw new Error(initError.message || 'チャットの初期化に失敗しました');
        }
      }
      
      // チャットIDが取得できなかった場合
      if (!currentChatId) {
        throw new Error('有効なチャットIDが取得できませんでした');
      }
      
      // ユーザーメッセージを作成
      const userMessageText = `「${japaneseGuideTitle}」の応急処置手順を教えてください。`;
      
      const userMessageResponse = await apiRequest('POST', `/api/chats/${currentChatId}/messages/system`, { 
        content: userMessageText,
        isUserMessage: true
      });
      
      if (!userMessageResponse.ok) {
        throw new Error('応急処置ガイドの表示に失敗しました');
      }
      
      const userMessageData = await userMessageResponse.json();
      
      // 応急処置ガイドの内容を日本語に変換
      const translateGuideContent = (content: string): string => {
        // 英語から日本語への変換マッピング
        const translationMap: Record<string, string> = {
          // ガイドタイトルと見出し
          "Brake Spring Lock Emergency Procedure": "ブレーキスプリングロック緊急対応手順",
          "Emergency Response": "緊急対応",
          "Safety Precautions": "安全上の注意",
          "Required Tools": "必要な工具",
          "Procedure": "作業手順",
          "Follow-up Actions": "事後対応",
          "Reporting": "報告",
          
          // エンジン関連
          "engine trouble": "エンジン故障",
          "Engine Trouble": "エンジン故障",
          "engine_001": "エンジン_001",
          "engine_002": "エンジン_002",
          "engine_003": "エンジン_003",
          "starter motor": "スターターモーター",
          "starter does not rotate": "スターターが回転しない",
          "engine does not start": "エンジンが始動しない",
          "Is the starter motor rotating?": "スターターモーターが回転していますか？",
          "Check the battery connection": "バッテリー接続を確認してください",
          "Check fuel supply": "燃料供給を確認してください",
          "current procedure": "現在の手順",
          "Related images": "関連画像",
          
          // ブレーキ関連
          "brake spring lock": "ブレーキスプリングロック",
          "Brake System": "ブレーキシステム",
          "brake_001": "ブレーキ_001",
          "brake_002": "ブレーキ_002",
          "brake_003": "ブレーキ_003",
          
          // 共通フレーズ
          "Never attempt to operate": "絶対に操作しないでください",
          "Contact technical support": "技術サポートに連絡してください",
          "Do not attempt to release manually": "手動で解除しようとしないでください",
          "Emergency brake system": "緊急ブレーキシステム",
          "Lock mechanism": "ロック機構",
          "Safety system": "安全システム",
          "Maintenance vehicle": "保守用車",
          "Technical assistance": "技術的支援",
          "Hydraulic pressure": "油圧",
          "Mechanical override": "機械的な解除",
          
          // ファイル参照関連の翻訳
          "/knowledge-base/images/engine_": "/knowledge-base/images/エンジン_",
          "/knowledge-base/images/brake_": "/knowledge-base/images/ブレーキ_",
          "/knowledge-base/images/hydraulic_": "/knowledge-base/images/油圧_",
          ".svg": ".svg",
          ".png": ".png"
        };
        
        // 翻訳マッピングを適用（単純な置換）
        let translatedContent = content;
        Object.entries(translationMap).forEach(([english, japanese]) => {
          // 大文字・小文字を区別しない正規表現で置換
          const regex = new RegExp(english, 'gi');
          translatedContent = translatedContent.replace(regex, japanese);
        });
        
        return translatedContent;
      };
      
      // 日本語に変換したコンテンツ
      const translatedContent = translateGuideContent(guideContent);
      
      // AI応答メッセージを作成（翻訳後のコンテンツを使用）
      const aiMessageResponse = await apiRequest('POST', `/api/chats/${currentChatId}/messages/system`, { 
        content: translatedContent,
        isUserMessage: false
      });
      
      if (!aiMessageResponse.ok) {
        throw new Error('応急処置ガイドの表示に失敗しました');
      }
      
      const aiMessageData = await aiMessageResponse.json();
      
      // メッセージを画面に表示
      setMessages(prev => [
        ...prev, 
        { 
          ...userMessageData,
          timestamp: new Date(userMessageData.timestamp)
        },
        {
          ...aiMessageData,
          timestamp: new Date(aiMessageData.timestamp)
        }
      ]);
      
      // 応急処置ガイドに関連する画像検索を実行
      // トラブルシューティングフローで選択した画像は既に関係画像エリアに表示されているため
      // 必要に応じて追加の画像検索を実行
      searchBySelectedText(guideTitle);
      
      // 検索結果をクリアして新しい検索のみを表示する場合は以下をコメント解除
      // clearSearchResults(); // 既存の検索結果をクリア
      // searchBySelectedText(guideTitle); // 新しい検索を実行
      
      toast({
        title: '応急処置ガイドを表示しました',
        description: `${japaneseGuideTitle}の対応手順が表示されました`,
        duration: 3000,
      });
    } catch (error) {
      console.error('応急処置ガイド表示エラー:', error);
      toast({
        title: 'エラー',
        description: '応急処置ガイドの表示に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // チャット履歴をクリアする関数
  const clearChatHistory = async () => {
    if (!chatId) return;
    
    try {
      setIsClearing(true);
      console.log('チャット履歴のクリアを開始:', chatId);
      
      // クリアタイムスタンプを保存
      const timestamp = Date.now().toString();
      localStorage.setItem('chat_cleared_timestamp', timestamp);
      console.log('クリアタイムスタンプを保存:', timestamp);
      
      // サーバーにクリアリクエストを送信
      const response = await apiRequest(
        'POST',
        `/api/chats/${chatId}/clear`
      );
      
      if (response.ok) {
        console.log('サーバー側のクリアが成功');
        
        // メッセージをクリア
        setMessages([]);
        console.log('クライアント側のメッセージをクリア');
        
        // エクスポート関連の状態をリセット
        setLastExportTimestamp(null);
        setHasUnexportedMessages(false);
        console.log('エクスポート状態をリセット');
        
        // ローカルストレージのクエリキャッシュをクリア
        let clearedCacheCount = 0;
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith('rq-/api/chats/')) {
            localStorage.removeItem(key);
            clearedCacheCount++;
          }
        }
        console.log(`ローカルストレージのキャッシュをクリア: ${clearedCacheCount}件`);
        
        // クエリキャッシュを完全に削除
        queryClient.removeQueries({ queryKey: ['/api/chats/1/messages'] });
        queryClient.setQueryData(['/api/chats/1/messages'], []);
        console.log('React Queryのキャッシュをクリア');
        
        // IndexedDBのメッセージをクリア
        try {
          const db = await openDatabase();
          const tx = db.transaction('unsyncedMessages', 'readwrite');
          const index = tx.store.index('by-chat');
          const messages = await index.getAll(chatId);
          let clearedMessageCount = 0;
          
          for (const message of messages) {
            await tx.store.delete(message.localId);
            clearedMessageCount++;
          }
          await tx.done;
          console.log(`IndexedDBのメッセージをクリア: ${clearedMessageCount}件`);
        } catch (dbError) {
          console.error('IndexedDBクリアエラー:', dbError);
        }
        
        // 特殊パラメータを付けて明示的にサーバーにクリア要求を送信
        const clearUrl = `/api/chats/${chatId}/messages?clear=true&_t=${timestamp}`;
        const clearResponse = await fetch(clearUrl, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
        if (clearResponse.ok) {
          console.log('キャッシュクリアリクエストが成功');
        } else {
          console.warn('キャッシュクリアリクエストが失敗:', clearResponse.status);
        }
        
        // クリア成功のトースト通知
        toast({
          title: 'チャット履歴をクリアしました',
          description: 'すべてのメッセージが削除されました',
        });
      } else {
        throw new Error('チャット履歴のクリアに失敗しました');
      }
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      toast({
        title: 'エラー',
        description: 'チャット履歴のクリアに失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsClearing(false);
      console.log('チャット履歴のクリア処理が完了');
    }
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        isLoading,
        searching,
        searchResults,
        selectedText,
        setSelectedText,
        sendMessage,
        startRecording,
        stopRecording,
        isRecording,
        recordedText,
        searchBySelectedText,
        clearSearchResults,
        captureImage,
        exportChatHistory,
        exportFormattedData,
        lastExportTimestamp,
        isExporting,
        hasUnexportedMessages,
        draftMessage,
        clearChatHistory,
        isClearing,
        sendEmergencyGuide,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
