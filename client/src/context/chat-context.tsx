import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
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
  lastExportTimestamp: Date | null;
  isExporting: boolean;
  hasUnexportedMessages: boolean;
  sendEmergencyGuide: (guideTitle: string, guideContent: string) => Promise<void>;
  draftMessage: { content: string, media?: { type: string, url: string, thumbnail?: string }[] } | null;
  clearChatHistory: () => void;
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
        usePerplexity: false // Perplexity APIを一時的に無効化
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
      // 現在のメディア状態を保持
      const currentMedia = draftMessage?.media || [];
      
      // まずブラウザの標準音声認識を試す（マイク許可ダイアログが確実に表示される）
      startBrowserSpeechRecognition(
        (text: string) => {
          // 認識されたテキストをセット
          setRecordedText(text);
          
          // 音声認識の内容をリアルタイムでドラフトメッセージとして表示
          // 既存のメディアは保持する
          if (text.trim()) {
            setDraftMessage({
              content: text,
              media: currentMedia
            });
          }
        },
        (error: string) => {
          console.log('ブラウザ音声認識エラー:', error);
          
          // エラー時はAzure Speech APIをフォールバックとして使用
          toast({
            title: 'ブラウザ音声認識が使用できません',
            description: 'Azure音声認識を使用します',
            duration: 2000,
          });
          
          // Azure Speech APIを使用して音声認識を開始
          startSpeechRecognition(
            (text: string) => {
              setRecordedText(text);
              
              // Azure音声認識の内容もリアルタイムでドラフトメッセージとして表示
              // 既存のメディアは保持する
              if (text.trim()) {
                setDraftMessage({
                  content: text,
                  media: currentMedia
                });
              }
            }, 
            (error: string) => {
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
  }, [toast, draftMessage]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    stopSpeechRecognition();
    stopBrowserSpeechRecognition();
    
    // 録音停止時にdraftMessageはクリアしない（送信ボタンを押すまでバブル表示を維持）
    // 録音テキストがない場合は、ドラフトメッセージをクリア
    if (!recordedText.trim()) {
      setDraftMessage(null);
    }
  }, [recordedText]);

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
  
  // 最後のエクスポート履歴を取得
  const fetchLastExport = useCallback(async () => {
    if (!chatId) return;
    
    try {
      const response = await apiRequest('GET', `/api/chats/${chatId}/last-export`);
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
      const userMessageText = `「${guideTitle}」の応急処置手順を教えてください。`;
      
      const userMessageResponse = await apiRequest('POST', `/api/chats/${currentChatId}/messages/system`, { 
        content: userMessageText,
        isUserMessage: true
      });
      
      if (!userMessageResponse.ok) {
        throw new Error('応急処置ガイドの表示に失敗しました');
      }
      
      const userMessageData = await userMessageResponse.json();
      
      // AI応答メッセージを作成
      const aiMessageResponse = await apiRequest('POST', `/api/chats/${currentChatId}/messages/system`, { 
        content: guideContent,
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
        description: `${guideTitle}の対応手順が表示されました`,
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
    try {
      setIsClearing(true);
      
      // UIからメッセージをクリア
      setMessages([]);
      setSearchResults([]);
      setTempMedia([]);
      setDraftMessage(null);
      
      // クエリキャッシュのキーを定義
      const chatKey = chatId ? `/api/chats/${chatId}/messages` : '/api/chats/1/messages';
      
      // サーバーにクリア要求を送信
      try {
        await apiRequest('POST', `/api/chats/${chatId || 1}/clear`);
        console.log('サーバーサイドキャッシュクリア要求が成功しました');
        // サーバーからクリア指示を受信したのでローカルも完全にクリア
        console.log('サーバーからキャッシュクリア指示を受信');
      } catch (serverError) {
        console.error('サーバーサイドキャッシュクリアに失敗:', serverError);
      }
      
      // React Queryのキャッシュを強制的に無効化する
      queryClient.invalidateQueries({ queryKey: [chatKey] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats/1/messages'] });
      
      // リアクトクエリのキャッシュを完全にリセット
      queryClient.removeQueries({ queryKey: [chatKey] });
      queryClient.removeQueries({ queryKey: ['/api/chats/1/messages'] });
      
      // 新しい空の配列をキャッシュに明示的に設定
      queryClient.setQueryData([chatKey], []);
      queryClient.setQueryData(['/api/chats/1/messages'], []);
      
      // LocalStorageのリアクトクエリキャッシュをクリア
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('rq-')) {
          localStorage.removeItem(key);
        }
      }
      
      // クリアマーカーを設定 (10秒間有効なフラグ)
      localStorage.setItem('chat_cleared_timestamp', Date.now().toString());
      
      // メッセージを強制的に空にする
      setMessages([]);
      
      // 成功メッセージ表示
      toast({
        title: 'チャット履歴をクリアしました',
        description: '履歴を完全にクリアしました。新しいメッセージを送信できます。',
      });
      
      // クリア後にページをリロードする代わりに、URL に timestamp パラメータを追加
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('t', Date.now().toString());
      window.history.replaceState({}, '', currentUrl.toString());
      
      // サーバーからの再取得をブロックする (長めの期間でブロック)
      const checkAndBlockRefetch = () => {
        const shouldBlockRefetch = localStorage.getItem('chat_cleared_timestamp');
        if (shouldBlockRefetch) {
          // 10秒以内のクリアなら再取得をブロック
          const clearTime = parseInt(shouldBlockRefetch);
          const now = Date.now();
          if (now - clearTime < 15000) {
            console.log('クエリキャッシュクリア直後のためメッセージを空にします');
            queryClient.setQueryData([chatKey], []);
            queryClient.setQueryData(['/api/chats/1/messages'], []);
            return true;
          } else {
            localStorage.removeItem('chat_cleared_timestamp');
          }
        }
        return false;
      };
      
      // 長時間にわたって複数回クエリキャッシュをクリアし続ける
      const intervals = [500, 1000, 2000, 3000, 5000, 7000, 10000, 15000];
      intervals.forEach(time => {
        setTimeout(() => {
          checkAndBlockRefetch();
        }, time);
      });
      
      // メッセージクエリのデフォルト値として空の配列を優先的に使用
      // queryClient.setDefaultQueryData([chatKey], blockRefetch); // この関数は利用不可
      // 代わりに直接空配列を設定
      queryClient.setQueryData([chatKey], []);
      
      // キャッシュ削除を安全に行うため、3秒間隔で3回試行
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          queryClient.setQueryData([chatKey], []);
          queryClient.removeQueries({ queryKey: [chatKey] });
        }, i * 3000); // 0秒, 3秒, 6秒でリセット
      }
      
    } catch (error) {
      console.error('チャット履歴クリアエラー:', error);
      toast({
        title: 'エラー',
        description: 'チャット履歴のクリアに失敗しました。ページをリロードしてみてください。',
        variant: 'destructive',
      });
    } finally {
      // クリア状態を解除 (10秒待ってから)
      setTimeout(() => {
        localStorage.removeItem('chat_cleared_timestamp');
        setIsClearing(false);
      }, 10000);
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
