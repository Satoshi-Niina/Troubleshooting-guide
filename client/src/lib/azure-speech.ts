// Azure Cognitive Servicesを使用した音声認識サービス
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

// 音声認識のインスタンス
let recognizer: sdk.SpeechRecognizer | null = null;
// 無音タイマーのインスタンス
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
// 無音タイムアウトの時間（ミリ秒）
const SILENCE_TIMEOUT = 2000; // 2秒の無音タイムアウト

// Azure Speech設定を初期化する関数
const initAzureSpeechConfig = () => {
  try {
    const speechKey = import.meta.env.VITE_AZURE_SPEECH_KEY;
    const speechRegion = import.meta.env.VITE_AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      console.error('Azure Speech認証情報が設定されていません');
      return null;
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    speechConfig.speechRecognitionLanguage = 'ja-JP';

    // 自動句読点を有効化
    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceResponse_PostProcessingOption,
      'TrueText'
    );

    return speechConfig;
  } catch (error) {
    console.error('Azure Speech設定の初期化に失敗しました:', error);
    return null;
  }
};

// 無音タイマーをリセットする関数
const resetSilenceTimer = (onSilenceTimeout: () => void) => {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  silenceTimer = setTimeout(() => {
    console.log('無音タイムアウト: 2秒間音声入力がありませんでした');
    onSilenceTimeout();
  }, SILENCE_TIMEOUT);
};

// 音声認識を開始する関数
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

    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    let currentSentence = ''; // 現在の文を保持
    let lastRecognizedText = ''; // 前回の認識結果を保持
    let lastText = ''; // 厳密な比較用の変数

    // 文を送信してリセットする関数
    const sendAndReset = () => {
      if (currentSentence.trim()) {
        onResult(currentSentence.trim());
        currentSentence = '';
      }
    };

    // 無音タイマーを初期化
    resetSilenceTimer(() => {
      sendAndReset();
      stopSpeechRecognition();
      onError('2秒間音声が検出されなかったため、音声認識を停止しました。');
    });

    // 音声認識結果のイベントハンドラ
    recognizer.recognized = (s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const newText = e.result.text.trim();
        // すでに認識済みのテキストとの重複を避ける
        if (newText && newText !== lastRecognizedText && newText !== lastText) {
          // 完全な新しい文章が認識された場合（前回の文章との重複がない場合）のみ更新
          if (!currentSentence.includes(newText) && !newText.includes(currentSentence)) {
            lastRecognizedText = newText;
            lastText = newText; // 厳密な比較用に更新
            
            // 既存のテキストを置き換えるのではなく、追加する
            if (currentSentence.length > 0 && !currentSentence.endsWith(' ')) {
              currentSentence += ' '; // 適切にスペースを追加
            }
            currentSentence += newText;
            
            console.log('認識テキスト追加:', newText);
            console.log('現在の完全な文:', currentSentence);

            // 文末判定（句読点が含まれている場合）
            if (/[。！？]$/.test(currentSentence)) {
              sendAndReset();
            }
          } else {
            console.log('部分的に重複する認識をスキップ:', newText);
          }

          // 無音タイマーをリセット（これは常に行う）
          resetSilenceTimer(() => {
            sendAndReset();
            stopSpeechRecognition();
            onError('2秒間音声が検出されなかったため、音声認識を停止しました。');
          });
        }
      }
    };

    // 音声認識キャンセル時のイベントハンドラ
    recognizer.canceled = (s, e) => {
      if (e.reason === sdk.CancellationReason.Error) {
        onError(`音声認識エラー: ${e.errorDetails}`);
      }
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    };

    // 連続認識を開始
    recognizer.startContinuousRecognitionAsync(
      () => console.log('Azure Speech認識を開始しました'),
      (error) => {
        console.error('認識開始エラー:', error);
        onError(`認識開始エラー: ${error}`);
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      }
    );
  } catch (error) {
    console.error('Azure Speech初期化エラー:', error);
    onError(`Azure Speech初期化エラー: ${error}`);
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }
};

// 音声認識を停止する関数
export const stopSpeechRecognition = () => {
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

// 以下はブラウザの音声認識APIを使用したフォールバック実装です
// Azure Speechが利用できない場合に使用します

let browserRecognition: any = null;

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
}

interface Window {
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  SpeechRecognition?: new () => BrowserSpeechRecognition;
}

const browserSupportsSpeechRecognition = () => {
  const isIOSDevice = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  if (isIOSDevice()) {
    return false;
  }

  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
};

export const startBrowserSpeechRecognition = (
  onResult: (text: string) => void,
  onError: (error: string) => void
) => {
  if (!browserSupportsSpeechRecognition()) {
    onError('お使いのブラウザは音声認識をサポートしていません。');
    return;
  }

  const SpeechRecognitionAPI = (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  browserRecognition = new SpeechRecognitionAPI();
  browserRecognition.continuous = true;
  browserRecognition.interimResults = true;
  browserRecognition.lang = 'ja-JP';

  let lastTranscript = '';

  browserRecognition.onresult = (event: any) => {
    const transcript = Array.from(event.results)
      .map((result: any) => result[0])
      .map((result) => result.transcript)
      .join('');

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

export const stopBrowserSpeechRecognition = () => {
  if (browserRecognition) {
    browserRecognition.stop();
    browserRecognition = null;
  }
};