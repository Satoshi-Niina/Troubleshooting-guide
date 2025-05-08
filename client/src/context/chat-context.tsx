import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { startSpeechRecognition, stopSpeechRecognition, startBrowserSpeechRecognition, stopBrowserSpeechRecognition } from '../lib/azure-speech';
import { Message } from '@shared/schema';

// 十分な文とみなす最小文字数
const MIN_TEXT_LENGTH = 5;
// 最大文字数（これを超えたら自動的に送信）
const MAX_TEXT_LENGTH = 50;

// チャットコンテキストの型定義
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
  captureImage: () => Promise<void>;
  exportChatHistory: () => Promise<void>;
  exportFormattedData: () => Promise<any>;
  lastExportTimestamp: Date | null;
  isExporting: boolean;
  hasUnexportedMessages: boolean;
  sendEmergencyGuide: (guideData: any) => Promise<void>;
  draftMessage: { content: string, media?: { type: string, url: string, thumbnail?: string }[] } | null;
  setDraftMessage: (message: { content: string, media?: { type: string, url: string, thumbnail?: string }[] } | null) => void;
  clearChatHistory: () => Promise<void>;
  isClearing: boolean;
}

// チャットコンテキストの作成
const ChatContext = createContext<ChatContextValue | null>(null);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === null) {
    console.error("ChatContext is null - this likely means useChat was called outside of the ChatProvider");
    // 代替として最小限のデフォルト値を返し、アプリがクラッシュするのを防ぐ
    return {
      messages: [],
      isLoading: false,
      searching: false,
      searchResults: [],
      selectedText: '',
      setSelectedText: () => {},
      sendMessage: async () => {},
      startRecording: () => {},
      stopRecording: () => {},
      isRecording: false,
      recordedText: '',
      searchBySelectedText: async () => {},
      clearSearchResults: () => {},
      captureImage: async () => {},
      exportChatHistory: async () => {},
      exportFormattedData: async () => ({}),
      lastExportTimestamp: null,
      isExporting: false,
      hasUnexportedMessages: false,
      sendEmergencyGuide: async () => {},
      draftMessage: null,
      setDraftMessage: () => {},
      clearChatHistory: async () => {},
      isClearing: false
    } as unknown as ChatContextValue;
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
  
  // 最後に送信したテキストを保存する変数（重複送信防止用）
  const [lastSentText, setLastSentText] = useState<string>('');
  // 音声認識による送信を防止するタイマー
  const [sendTimeoutId, setSendTimeoutId] = useState<NodeJS.Timeout | null>(null);
  // 十分な文とみなす最小文字数
  const MIN_TEXT_LENGTH = 5;
  // 最大文字数（これを超えたら自動的に送信）
  const MAX_TEXT_LENGTH = 50;
  // 音声認識テキストの完了度を追跡するための変数
  const [recognitionPhrases, setRecognitionPhrases] = useState<string[]>([]);
  // 音声認識テキストの送信をブロックするフラグ
  const [blockSending, setBlockSending] = useState<boolean>(false);
  // 最後に音声認識を受信した時間（沈黙検出用）
  const [lastRecognitionTime, setLastRecognitionTime] = useState<number>(0);
  // 沈黙が検出されたかどうか
  const [silenceDetected, setSilenceDetected] = useState<boolean>(false);
  
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
  
  // 認識テキストの類似度を確認する関数（部分文字列か判定）
  const isSubstringOrSimilar = (text1: string, text2: string): boolean => {
    if (!text1 || !text2) return false;
    const lowerText1 = text1.toLowerCase().trim();
    const lowerText2 = text2.toLowerCase().trim();
    
    // 完全一致または部分文字列かチェック
    if (lowerText1 === lowerText2 || lowerText1.includes(lowerText2) || lowerText2.includes(lowerText1)) {
      return true;
    }
    
    // より厳格な類似性判定 - 先頭部分が同じかチェック
    const minLength = Math.min(lowerText1.length, lowerText2.length);
    if (minLength > 3) {
      // 短い方の文字列の長さの70%以上が先頭から一致する場合は類似とみなす
      const matchLength = Math.floor(minLength * 0.7);
      if (lowerText1.substring(0, matchLength) === lowerText2.substring(0, matchLength)) {
        return true;
      }
    }
    
    // 80%以上の単語が一致するかチェック
    const words1 = lowerText1.split(/\s+/);
    const words2 = lowerText2.split(/\s+/);
    
    // 単語数が少ない場合は直接比較
    if (words1.length <= 2 || words2.length <= 2) {
      return lowerText1.length > 0 && lowerText2.length > 0 && 
        (lowerText1.includes(lowerText2) || lowerText2.includes(lowerText1));
    }
    
    // 共通する単語の数をカウント
    const commonWords = words1.filter(word => words2.includes(word));
    const similarityRatio = commonWords.length / Math.max(words1.length, words2.length);
    
    return similarityRatio >= 0.7; // 70%以上一致に緩和
  };
  
  // ドラフトメッセージ更新のイベントリスナー
  useEffect(() => {
    // ドラフトメッセージ更新のイベントリスナーを設定
    const handleUpdateDraftMessage = (event: CustomEvent) => {
      console.log('ドラフトメッセージ更新イベント受信:', event.detail);
      
      if (event.detail && typeof event.detail.content === 'string') {
        const { content } = event.detail;
        // 既存のメディアは保持する
        const currentMedia = draftMessage?.media || [];
        
        // ドラフトメッセージを更新（空でない場合のみ）
        if (content.trim()) {
          console.log('ドラフトメッセージを更新:', content);
          setDraftMessage({
            content,
            media: currentMedia
          });
        } else {
          // 空の場合はドラフトメッセージをクリア
          setDraftMessage(null);
        }
      }
    };

    // カメラで撮影した画像をドラフトメッセージに追加するイベントリスナー
    const handleCameraCapture = (event: CustomEvent) => {
      if (event.detail && event.detail.imageUrl) {
        const currentContent = draftMessage?.content || '';
        const currentMedia = draftMessage?.media || [];
        
        // 既存のメディア配列に新しい画像を追加
        setDraftMessage({
          content: currentContent,
          media: [
            ...currentMedia, 
            {
              type: 'image',
              url: event.detail.imageUrl,
              thumbnail: event.detail.thumbnailUrl || event.detail.imageUrl
            }
          ]
        });
      }
    };

    // ドラフトメッセージ送信イベントのハンドラー
    const handleSendDraftMessage = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.content) {
        console.log('ドラフトメッセージ送信イベント受信:', customEvent.detail);
        const content = customEvent.detail.content;
        
        // メッセージを送信し、ドラフトメッセージをクリア
        if (content.trim()) {
          sendMessage(content);
          setDraftMessage(null);
        }
      }
    };
    
    // TypeScriptにカスタムイベントを認識させるための型アサーション
    window.addEventListener('update-draft-message', handleUpdateDraftMessage as EventListener);
    window.addEventListener('camera-capture', handleCameraCapture as EventListener);
    window.addEventListener('send-draft-message', handleSendDraftMessage as EventListener);
    
    // ドラフトメッセージクリア用のイベントリスナー
    const handleClearDraftMessage = (event: Event) => {
      console.log('クリアドラフトメッセージイベント受信');
      setDraftMessage(null);
      setRecordedText('');
      setLastSentText('');
    };
    
    // clear-draft-messageイベントリスナーを追加
    window.addEventListener('clear-draft-message', handleClearDraftMessage as EventListener);
    
    // カスタムイベント発火によるデバッグ
    console.log('ドラフトメッセージイベントリスナーをセットアップしました');
    
    // クリーンアップ関数
    return () => {
      // イベントリスナーの解除
      window.removeEventListener('update-draft-message', handleUpdateDraftMessage as EventListener);
      window.removeEventListener('camera-capture', handleCameraCapture as EventListener);
      window.removeEventListener('clear-draft-message', handleClearDraftMessage as EventListener);
      window.removeEventListener('send-draft-message', handleSendDraftMessage as EventListener);
    };
  }, [draftMessage]);
  
  // 選択テキストで検索する関数
  const searchBySelectedText = useCallback(async (text: string) => {
    try {
      if (!text) return;
      console.log('検索キーワード:', text);
      
      // カンマやスペースで区切られた複数のキーワード対応
      const keywords = text.split(/[,\s]+/).map(k => k.trim()).filter(Boolean);
      const keywordType = keywords.map(k => {
        // 特定のパターンに基づいてキーワードタイプを判断
        if (/^[A-Z0-9]{2,}-\d+$/.test(k)) return 'model';
        if (/部品|装置|ユニット|モジュール/.test(k)) return 'component';
        return '';
      });
      
      console.log('キーワードタイプ:', ...keywordType);
      
      setSearching(true);
      
      console.log('画像検索開始:', text);
      
      // 画像検索APIを呼び出す
      const response = await apiRequest('POST', '/api/tech-support/image-search', { 
        query: text,
        count: 10
      });
      
      if (!response.ok) {
        throw new Error('画像検索に失敗しました');
      }
      
      const results = await response.json();
      console.log('検索結果数:', results.images?.length || 0);
      
      if (!results.images || results.images.length === 0) {
        console.log(`「${text}」に関する検索結果はありませんでした`);
        setSearchResults([]);
      } else {
        setSearchResults(results.images.map((img: any) => ({
          ...img,
          src: img.url || img.file,
          alt: img.title || img.description || '画像',
          title: img.title || '',
          description: img.description || ''
        })));
      }
    } catch (error) {
      console.error('検索エラー:', error);
      toast({
        title: '検索エラー',
        description: '画像の検索に失敗しました。',
        variant: 'destructive',
      });
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [toast]);
  
  // 検索結果をクリアする関数
  const clearSearchResults = useCallback(() => {
    setSearchResults([]);
  }, []);
  
  // カメラで画像を撮影する関数
  const captureImage = useCallback(async () => {
    try {
      // カスタムイベントでカメラモーダルを開く
      const cameraEvent = new Event('open-camera');
      window.dispatchEvent(cameraEvent);
      
      return Promise.resolve();
    } catch (error) {
      console.error('カメラエラー:', error);
      toast({
        title: 'カメラエラー',
        description: 'カメラを開けませんでした。',
        variant: 'destructive',
      });
      return Promise.resolve();
    }
  }, [toast]);
  
  // メッセージ送信関数
  const sendMessage = useCallback(async (content: string, mediaUrls?: { type: string, url: string, thumbnail?: string }[]) => {
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
  }, [chatId, initializeChat, searchBySelectedText, tempMedia, toast]);
  
  // 録音開始関数
  const startRecording = useCallback(() => {
    setIsRecording(true);
    setRecordedText(''); // 録音開始時にテキストをクリア
    setLastSentText(''); // 録音開始時に最後に送信したテキストもクリア
    setRecognitionPhrases([]); // 認識フレーズをクリア
    setBlockSending(false); // 送信ブロックを解除
    
    try {
      // 現在のメディア状態を保持
      const currentMedia = draftMessage?.media || [];
      
      // まずAzure Speech APIを試す（精度が高い）
      startSpeechRecognition(
        async (text: string) => {
          // 認識されたテキストをセット（内部状態のみ）
          setRecordedText(text);
          
          // テキストが一定の条件を満たす場合には直接送信
          // 1. 文末の句読点で終わる（完全な文とみなす）
          // 2. あるいは10文字以上あり、かつMIN_TEXT_LENGTH(5文字)以上ある
          const isCompleteSentence = /[。！？!?]$/.test(text.trim());
          const isLongEnough = text.length >= 10 && text.length >= MIN_TEXT_LENGTH;
          
          if (isCompleteSentence || isLongEnough) {
            // 完成した文章は直接メッセージとして送信
            console.log('完成した文章なので、メッセージとして送信:', text);
            
            // ブロックフラグが立っていなければ送信
            if (!blockSending) {
              sendMessage(text);
              setBlockSending(true); // 送信後はブロック
              // 3秒後にブロックを解除
              setTimeout(() => setBlockSending(false), 3000);
            } else {
              console.log('ブロック中のため送信をスキップ:', text);
            }
          } else {
            // メモリ内にのみ保持し、表示も送信もしない
            console.log('未完成の文章はメモリ内にのみ保持:', text);
            // recordedTextには保存するがドラフトメッセージには表示しない
            setRecordedText(text);
          }
          
          // 空のテキストは処理しない
          if (!text.trim()) return;
          
          // 最後の認識時間を更新
          const currentTime = Date.now();
          setLastRecognitionTime(currentTime);
          setSilenceDetected(false); // 音声入力があったのでサイレンス状態をリセット
          
          // 現在の認識フレーズを保存
          setRecognitionPhrases(prev => {
            // すでに類似したフレーズがあるかチェック
            const similarExists = prev.some(phrase => isSubstringOrSimilar(phrase, text));
            if (!similarExists) {
              return [...prev, text];
            }
            return prev;
          });
          
          // ブロックフラグが立っていたら送信しない
          if (blockSending) {
            console.log('送信ブロック中のため送信をスキップします:', text);
            return;
          }
          
          // 既存のタイマーをクリア
          if (sendTimeoutId) {
            clearTimeout(sendTimeoutId);
          }
          
          // 沈黙検出用のタイマー（2秒間隔でチェック）
          const silenceCheckId = setTimeout(() => {
            // 最後の音声認識から2秒経過したかチェック
            if (Date.now() - lastRecognitionTime >= 2000 && !silenceDetected) {
              console.log('沈黙を検出しました - 現在の認識テキストを送信します');
              setSilenceDetected(true);
              
              // 沈黙を検出したら、現在の認識結果を送信
              // 最長の認識フレーズを選択（通常は最も完全な文章）
              const bestPhrase = recognitionPhrases
                .sort((a, b) => b.length - a.length)[0] || text;
              
              console.log('沈黙検出時の送信フレーズ:', bestPhrase);
              
              // 短すぎるフレーズを送信しないようにする（2文字以下はスキップ）
              if (bestPhrase.trim().length <= 2) {
                console.log('沈黙検出: フレーズが短すぎるため送信をスキップします:', bestPhrase);
                return;
              }
              
              // 前回の送信テキストとの重複チェック
              if (bestPhrase && !isSubstringOrSimilar(bestPhrase, lastSentText)) {
                // 送信をブロック
                setBlockSending(true);
                
                // 最後に送信したテキストを更新
                setLastSentText(bestPhrase);
                
                // メッセージを送信
                sendMessage(bestPhrase).then(() => {
                  // 認識フレーズをリセット
                  setRecognitionPhrases([]);
                  console.log('沈黙検出: メッセージを送信しました:', bestPhrase);
                }).catch(error => {
                  console.error('沈黙検出: メッセージ送信エラー:', error);
                }).finally(() => {
                  // 3秒後にブロックを解除
                  setTimeout(() => {
                    setBlockSending(false);
                  }, 3000);
                });
              } else {
                console.log('沈黙検出: 類似テキストが既に送信されているため送信をスキップします');
              }
            }
          }, 2000); // 2秒の沈黙を検出するためのタイマー
          
          // タイマーIDを保存
          setSendTimeoutId(silenceCheckId);
        },
        (error: string) => {
          console.log('Azure音声認識エラー:', error);
          
          // エラー時はブラウザの標準音声認識APIをフォールバックとして使用
          toast({
            title: 'AzureからブラウザAPIに切り替えます',
            description: 'ブラウザの音声認識を初期化中...',
            duration: 3000,
          });
          
          // Azure音声認識を完全に停止
          stopSpeechRecognition();
          
          // 状態をリセット
          setRecordedText('');
          setLastSentText('');
          setRecognitionPhrases([]);
          setBlockSending(false);
          
          // ブラウザの標準音声認識APIを使用
          startBrowserSpeechRecognition(
            async (text: string) => {
              // 認識されたテキストをセット（内部状態のみ）
              setRecordedText(text);
              
              // テキストが一定の条件を満たす場合には直接送信
              // 1. 文末の句読点で終わる（完全な文とみなす）
              // 2. あるいは10文字以上あり、かつMIN_TEXT_LENGTH(5文字)以上ある
              const isCompleteSentence = /[。！？!?]$/.test(text.trim());
              const isLongEnough = text.length >= 10 && text.length >= MIN_TEXT_LENGTH;
              
              if (isCompleteSentence || isLongEnough) {
                // 完成した文章は直接メッセージとして送信
                console.log('ブラウザ: 完成した文章なので、メッセージとして送信:', text);
                
                // ブロックフラグが立っていなければ送信
                if (!blockSending) {
                  sendMessage(text);
                  setBlockSending(true); // 送信後はブロック
                  // 3秒後にブロックを解除
                  setTimeout(() => setBlockSending(false), 3000);
                } else {
                  console.log('ブラウザ: ブロック中のため送信をスキップ:', text);
                }
              } else {
                // メモリ内にのみ保持し、表示も送信もしない
                console.log('ブラウザ: 未完成の文章はメモリ内にのみ保持:', text);
                // recordedTextには保存するがドラフトメッセージには表示しない
                setRecordedText(text);
              }
              
              // 空のテキストは処理しない
              if (!text.trim()) return;
              
              // 最後の認識時間を更新
              const currentTime = Date.now();
              setLastRecognitionTime(currentTime);
              setSilenceDetected(false); // 音声入力があったのでサイレンス状態をリセット
              
              // 現在の認識フレーズを保存
              setRecognitionPhrases(prev => {
                // すでに類似したフレーズがあるかチェック
                const similarExists = prev.some(phrase => isSubstringOrSimilar(phrase, text));
                if (!similarExists) {
                  return [...prev, text];
                }
                return prev;
              });
              
              // ブロックフラグが立っていたら送信しない
              if (blockSending) {
                console.log('送信ブロック中のため送信をスキップします:', text);
                return;
              }
              
              // 既存のタイマーをクリア
              if (sendTimeoutId) {
                clearTimeout(sendTimeoutId);
              }
              
              // 沈黙検出用のタイマー（2秒間隔でチェック）
              const silenceCheckId = setTimeout(() => {
                // 最後の音声認識から2秒経過したかチェック
                if (Date.now() - lastRecognitionTime >= 2000 && !silenceDetected) {
                  console.log('ブラウザ: 沈黙を検出しました - 現在の認識テキストを送信します');
                  setSilenceDetected(true);
                  
                  // 沈黙を検出したら、現在の認識結果を送信
                  // 最長の認識フレーズを選択（通常は最も完全な文章）
                  const bestPhrase = recognitionPhrases
                    .sort((a, b) => b.length - a.length)[0] || text;
                  
                  console.log('ブラウザ: 沈黙検出時の送信フレーズ:', bestPhrase);
                  
                  // 短すぎるフレーズを送信しないようにする（2文字以下はスキップ）
                  if (bestPhrase.trim().length <= 2) {
                    console.log('ブラウザ: 沈黙検出: フレーズが短すぎるため送信をスキップします:', bestPhrase);
                    return;
                  }
                  
                  // 前回の送信テキストとの重複チェック
                  if (bestPhrase && !isSubstringOrSimilar(bestPhrase, lastSentText)) {
                    // 送信をブロック
                    setBlockSending(true);
                    
                    // 最後に送信したテキストを更新
                    setLastSentText(bestPhrase);
                    
                    // メッセージを送信
                    sendMessage(bestPhrase).then(() => {
                      // 認識フレーズをリセット
                      setRecognitionPhrases([]);
                      console.log('ブラウザ: 沈黙検出: メッセージを送信しました:', bestPhrase);
                    }).catch(error => {
                      console.error('ブラウザ: 沈黙検出: メッセージ送信エラー:', error);
                    }).finally(() => {
                      // 3秒後にブロックを解除
                      setTimeout(() => {
                        setBlockSending(false);
                      }, 3000);
                    });
                  } else {
                    console.log('ブラウザ: 沈黙検出: 類似テキストが既に送信されているため送信をスキップします');
                  }
                }
              }, 2000); // 2秒の沈黙を検出するためのタイマー
              
              // タイマーIDを保存
              setSendTimeoutId(silenceCheckId);
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
      
      // リアルタイムプレビュー用のイベント発火（完全に無効化）
      // TypeScriptエラーを回避するために、型指定を完全に省略
      window.addEventListener('update-draft-message', function(e: any) {
        console.log('録音中のテキスト（イベントは無視）:', e.detail.content);
        // ドラフトメッセージの更新はしない（重複送信を防止）
      });
    } catch (error) {
      console.error('音声認識開始エラー:', error);
      setIsRecording(false);
      toast({
        title: '音声認識エラー',
        description: '音声認識を開始できませんでした。',
        variant: 'destructive',
      });
    }
  }, [blockSending, draftMessage?.media, isSubstringOrSimilar, lastRecognitionTime, lastSentText, recognitionPhrases, sendMessage, sendTimeoutId, silenceDetected, toast]);
  
  // 録音停止関数
  const stopRecording = useCallback(() => {
    setIsRecording(false);
    
    // 録音テキストとドラフトメッセージを確実にクリア
    setRecordedText('');
    setDraftMessage(null);
    
    // 前回のメッセージとの類似チェック用の情報もリセット
    setLastSentText('');
    
    // 音声認識を停止
    console.log('録音停止');
    console.log('録音停止：関数から直接ドラフトメッセージを設定:', '');
    console.log('録音停止時のテキストをチャット側のみに表示:', '');
    
    stopSpeechRecognition();
    stopBrowserSpeechRecognition();
    
    // 沈黙検出用のタイマーをクリア
    if (sendTimeoutId) {
      clearTimeout(sendTimeoutId);
      setSendTimeoutId(null);
    }
  }, [sendTimeoutId, setDraftMessage, setRecordedText, setLastSentText]);
  
  // チャット履歴をエクスポートする関数
  const exportChatHistory = useCallback(async () => {
    try {
      if (!chatId) return;
      
      setIsExporting(true);
      
      const response = await apiRequest('POST', `/api/chats/${chatId}/export`);
      
      if (!response.ok) {
        throw new Error('チャット履歴のエクスポートに失敗しました');
      }
      
      const data = await response.json();
      
      toast({
        title: 'エクスポート完了',
        description: 'チャット履歴が正常にエクスポートされました。',
      });
      
      // 最後のエクスポート履歴を更新
      setLastExportTimestamp(new Date());
      setHasUnexportedMessages(false);
      
      return data;
    } catch (error) {
      console.error('エクスポートエラー:', error);
      toast({
        title: 'エクスポートエラー',
        description: 'チャット履歴のエクスポートに失敗しました。',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsExporting(false);
    }
  }, [chatId, toast]);
  
  // 外部システム連携用に形式化されたデータをエクスポートする
  const exportFormattedData = useCallback(async () => {
    try {
      if (!chatId) return {};
      
      const response = await apiRequest('GET', `/api/chats/${chatId}/formatted-export`);
      
      if (!response.ok) {
        throw new Error('フォーマット済みデータの取得に失敗しました');
      }
      
      return await response.json();
    } catch (error) {
      console.error('フォーマット済みデータの取得エラー:', error);
      return {};
    }
  }, [chatId]);
  
  // 緊急ガイドデータを送信する関数
  const sendEmergencyGuide = useCallback(async (guideData: any) => {
    try {
      if (!chatId) return;
      
      setIsLoading(true);
      
      const response = await apiRequest('POST', `/api/emergency-guide/send`, {
        chatId,
        guideData,
      });
      
      if (!response.ok) {
        throw new Error('緊急ガイドの送信に失敗しました');
      }
      
      const data = await response.json();
      
      // メッセージリストに追加
      setMessages(prev => [
        ...prev,
        { 
          ...data.userMessage, 
          timestamp: new Date(data.userMessage.timestamp)
        },
        {
          ...data.aiMessage,
          timestamp: new Date(data.aiMessage.timestamp)
        }
      ]);
      
      // 関連する画像検索も実行
      if (guideData.title) {
        searchBySelectedText(guideData.title);
      }
      
      return data;
    } catch (error) {
      console.error('緊急ガイド送信エラー:', error);
      toast({
        title: '緊急ガイド送信エラー',
        description: '緊急ガイドの送信に失敗しました。',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [chatId, searchBySelectedText, toast]);
  
  // チャット履歴を全て削除する関数
  const clearChatHistory = useCallback(async () => {
    try {
      if (!chatId) return;
      
      setIsClearing(true);
      
      const response = await apiRequest('POST', `/api/chats/${chatId}/clear`);
      
      if (!response.ok) {
        throw new Error('チャット履歴の削除に失敗しました');
      }
      
      // メッセージリストをクリア
      setMessages([]);
      setSearchResults([]);
      setHasUnexportedMessages(false);
      setLastExportTimestamp(null);
      
      // ドラフトメッセージも確実にクリア（音声認識テキストなど）
      setDraftMessage(null);
      setRecordedText('');
      // lastSentTextもクリア
      setLastSentText('');
      
      // カスタムイベントを発行してUIにも反映
      if (typeof window !== 'undefined') {
        // ドラフトクリアイベントを発行
        window.dispatchEvent(new CustomEvent('clear-draft-message'));
        // 記録済みの認識フレーズもクリア
        window.dispatchEvent(new CustomEvent('reset-recognition-phrases'));
      }
      
      // クリア時のタイムスタンプをローカルストレージに保存（キャッシュクリア処理用）
      const clearTimestamp = Date.now().toString();
      localStorage.setItem('chat_cleared_timestamp', clearTimestamp);
      console.log('チャットクリアタイムスタンプを設定:', clearTimestamp);
      
      // React Queryのキャッシュをクリア
      try {
        // @ts-ignore - globalにqueryClientが定義されている場合
        if (window.queryClient) {
          window.queryClient.removeQueries({ queryKey: ['/api/chats/1/messages'] });
          window.queryClient.setQueryData(['/api/chats/1/messages'], []);
          console.log('React Queryキャッシュをクリア');
        }
      } catch (cacheError) {
        console.error('キャッシュクリアエラー:', cacheError);
      }
      
      toast({
        title: 'チャット履歴を削除しました',
        description: '全てのメッセージが削除されました。',
      });
    } catch (error) {
      console.error('チャット履歴削除エラー:', error);
      toast({
        title: 'チャット履歴削除エラー',
        description: 'チャット履歴の削除に失敗しました。',
        variant: 'destructive',
      });
    } finally {
      setIsClearing(false);
    }
  }, [chatId, toast]);
  
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
    } else {
      // メッセージがない場合は未エクスポートではない
      setHasUnexportedMessages(false);
    }
  }, [messages, lastExportTimestamp]);
  
  // コンテキスト値を提供
  const contextValue: ChatContextValue = {
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
    sendEmergencyGuide,
    draftMessage,
    setDraftMessage,
    clearChatHistory,
    isClearing
  };
  
  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};