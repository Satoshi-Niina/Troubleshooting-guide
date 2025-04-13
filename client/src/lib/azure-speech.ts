// Speech recognition service using Azure Cognitive Services
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

let recognizer: sdk.SpeechRecognizer | null = null;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
const SILENCE_TIMEOUT = 30000; // 30秒の無音タイムアウト

// Azure Speech設定を初期化
const initAzureSpeechConfig = () => {
  try {
    const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
    const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION;
    
    if (!speechKey || !speechRegion) {
      console.error('Azure Speech credentials are not set');
      return null;
    }
    
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    speechConfig.speechRecognitionLanguage = 'ja-JP';
    return speechConfig;
  } catch (error) {
    console.error('Failed to initialize Azure Speech config:', error);
    return null;
  }
};

// 無音タイマーをリセットする関数
const resetSilenceTimer = (onSilenceTimeout: () => void) => {
  // 既存のタイマーをクリア
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  
  // 新しいタイマーを設定
  silenceTimer = setTimeout(() => {
    console.log('無音タイムアウト: 30秒間音声入力がありませんでした');
    onSilenceTimeout();
  }, SILENCE_TIMEOUT);
};

// Start speech recognition
export const startSpeechRecognition = (
  onResult: (text: string) => void, 
  onError: (error: string) => void
) => {
  try {
    const speechConfig = initAzureSpeechConfig();
    
    if (!speechConfig) {
      onError('Azure Speech認証情報が設定されていません。');
      return;
    }
    
    // マイクからの音声入力を設定
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    
    // 前回の認識テキストを保存する変数
    let lastRecognizedText = '';
    
    // 無音タイマーの初期設定
    resetSilenceTimer(() => {
      // タイムアウト時は音声認識を停止
      stopSpeechRecognition();
      onError('30秒間音声が検出されなかったため、音声認識を停止しました。');
    });
    
    // 音声認識結果のイベントハンドラ - 最終結果のみを通知
    recognizer.recognized = (s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const newText = e.result.text.trim();
        if (newText && newText !== lastRecognizedText) {
          // 重複を防ぐため、前回の結果と異なる場合のみ通知
          onResult(newText);
          lastRecognizedText = newText;
          
          // 音声が検出されたので無音タイマーをリセット
          resetSilenceTimer(() => {
            stopSpeechRecognition();
            onError('30秒間音声が検出されなかったため、音声認識を停止しました。');
          });
        }
      }
    };
    
    // 音声認識キャンセル時のイベントハンドラ
    recognizer.canceled = (s, e) => {
      if (e.reason === sdk.CancellationReason.Error) {
        onError(`音声認識エラー: ${e.errorDetails}`);
      }
      // タイマーをクリア
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    };
    
    // 途中結果は表示しない - 最終結果のみ使用
    recognizer.recognizing = (s, e) => {
      console.log(`認識中: ${e.result.text}`);
      // 音声が検出されたので無音タイマーをリセット
      resetSilenceTimer(() => {
        stopSpeechRecognition();
        onError('30秒間音声が検出されなかったため、音声認識を停止しました。');
      });
    };
    
    // 連続認識を開始
    recognizer.startContinuousRecognitionAsync(
      () => console.log('Azure Speech認識を開始しました'), 
      (error) => {
        console.error('認識開始エラー:', error);
        onError(`認識開始エラー: ${error}`);
        // エラー発生時はタイマーをクリア
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      }
    );
  } catch (error) {
    console.error('Azure Speech初期化エラー:', error);
    onError(`Azure Speech初期化エラー: ${error}`);
    // エラー発生時はタイマーをクリア
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }
};

// Stop speech recognition
export const stopSpeechRecognition = () => {
  // 無音タイマーをクリア
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  
  if (recognizer) {
    recognizer.stopContinuousRecognitionAsync(
      () => {
        console.log('Azure Speech認識を停止しました');
        recognizer = null;
      },
      (error) => console.error('認識停止エラー:', error)
    );
  }
};

// ブラウザによるフォールバック実装（Azureが使えない場合用）
let browserRecognition: any = null;

// ブラウザのSpeechRecognitionインターフェースの型定義
interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
}

// windowオブジェクトを拡張
interface Window {
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  SpeechRecognition?: new () => BrowserSpeechRecognition;
}

// Check if browser supports speech recognition
const browserSupportsSpeechRecognition = () => {
  // Safari on iOS/iPadOS doesn't support SpeechRecognition API properly
  const isIOSDevice = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };
  
  // iOS/iPadOSデバイスの場合はfalseを返す（Azureを使用する）
  if (isIOSDevice()) {
    return false;
  }
  
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
};

// Start browser speech recognition (fallback)
export const startBrowserSpeechRecognition = (
  onResult: (text: string) => void, 
  onError: (error: string) => void
) => {
  if (!browserSupportsSpeechRecognition()) {
    onError('お使いのブラウザは音声認識をサポートしていません。');
    return;
  }

  // TypeScriptに型を教えるためのキャスト
  const SpeechRecognitionAPI = (window as any).SpeechRecognition || 
                          (window as any).webkitSpeechRecognition;
  browserRecognition = new SpeechRecognitionAPI();
  browserRecognition.continuous = true;
  browserRecognition.interimResults = true;
  browserRecognition.lang = 'ja-JP';

  // 前回の認識結果を保存
  let lastTranscript = '';
  
  browserRecognition.onresult = (event: any) => {
    const transcript = Array.from(event.results)
      .map((result: any) => result[0])
      .map((result) => result.transcript)
      .join('');
    
    // 重複を防ぐために前回と同じ結果でない場合のみ通知
    if (transcript !== lastTranscript) {
      onResult(transcript);
      lastTranscript = transcript;
    }
  };

  browserRecognition.onerror = (event: any) => {
    onError(`音声認識エラー: ${event.error}`);
  };

  browserRecognition.start();
};

// Stop browser speech recognition
export const stopBrowserSpeechRecognition = () => {
  if (browserRecognition) {
    browserRecognition.stop();
    browserRecognition = null;
  }
};
