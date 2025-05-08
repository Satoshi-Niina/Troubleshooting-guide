// Azure Cognitive Servicesを使用した音声認識サービス
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

// 音声認識のインスタンス
let recognizer: sdk.SpeechRecognizer | null = null;
// 無音タイマーのインスタンス
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
// 無音タイムアウトの時間（ミリ秒）
const SILENCE_TIMEOUT = 2000; // 2秒の無音タイムアウト
// 最小文字数（これより短い認識結果は単独では送信しない）
const MIN_TEXT_LENGTH = 5;
// 最大文字数（これを超えたら自動的に送信）
const MAX_TEXT_LENGTH = 50;
// 最後に送信したテキスト
let lastSentText = '';
// 前回の認識結果と類似しているかどうかを判定する関数
const isSimilarText = (a: string, b: string): boolean => {
  // 両方のテキストがMIN_TEXT_LENGTH未満の場合は類似とみなす
  if (a.length < MIN_TEXT_LENGTH && b.length < MIN_TEXT_LENGTH) return true;
  
  // どちらかが空の場合は類似ではない
  if (!a || !b) return false;
  
  // どちらかがもう一方を含む場合は類似とみなす
  if (a.includes(b) || b.includes(a)) return true;
  
  // Levenshtein距離を計算して類似度を判定
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return true; // どちらも空文字列なら類似
  
  // 短いテキスト同士の場合、編集距離2以内なら類似とみなす
  if (maxLength < 10) {
    const distance = levenshteinDistance(a, b);
    return distance <= 2;
  }
  
  // 長いテキストの場合、編集距離がテキスト長の30%未満なら類似とみなす
  const distance = levenshteinDistance(a, b);
  return distance / maxLength < 0.3;
};

// Levenshtein距離を計算する関数（テキストの類似度を判定するのに使用）
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  
  // 行列の初期化
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  
  // 行列を埋める
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i-1] === b[j-1]) {
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i-1][j-1] + 1, // 置換
          matrix[i][j-1] + 1,    // 挿入
          matrix[i-1][j] + 1     // 削除
        );
      }
    }
  }
  
  return matrix[a.length][b.length];
};

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
    
    // エンドポイント検出の設定（2秒の無音で検出）
    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
      '2000'
    );

    return speechConfig;
  } catch (error) {
    console.error('Azure Speech設定の初期化に失敗しました:', error);
    return null;
  }
};

// 認識フレーズのバッファ
let recognitionPhrases: string[] = [];
// 無音検出フラグ
let silenceDetected = false;
// 最後の認識時間
let lastRecognitionTime = Date.now();
// 送信ブロックフラグ
let blockSending = false;

// 無音タイマーをリセットする関数
const resetSilenceTimer = (onSilenceTimeout: () => void) => {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  silenceTimer = setTimeout(() => {
    console.log('無音タイムアウト: 2秒間音声入力がありませんでした');
    silenceDetected = true;
    onSilenceTimeout();
  }, SILENCE_TIMEOUT);
};

// 音声認識を開始する関数
// フレーズリセットのリスナーを設定
if (typeof window !== 'undefined') {
  window.addEventListener('reset-recognition-phrases', () => {
    console.log('認識フレーズリセットコマンド受信');
    recognitionPhrases = [];
    lastSentText = '';
    blockSending = false;
    silenceDetected = false;
  });
}

export const startSpeechRecognition = (
  onResult: (text: string) => void,
  onError: (error: string) => void
) => {
  try {
    // 最後に送信したテキストをリセット
    lastSentText = '';
    // 認識フレーズをリセット
    recognitionPhrases = [];
    // 無音検出フラグをリセット
    silenceDetected = false;
    // 送信ブロックフラグをリセット
    blockSending = false;
    // 最後の認識時間を現在時刻に設定
    lastRecognitionTime = Date.now();
    
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

    // 文を送信してリセットする関数（一文完成時送信に強化）
    const sendAndReset = () => {
      if (blockSending) {
        console.log('送信ブロック中: スキップします');
        return;
      }
      
      // 既存の文字列を保持
      const trimmedText = currentSentence.trim();
      
      // 既存文字列または認識フレーズから最適な文を選ぶ
      let bestText = '';
      
      // 最適なテキストを選択するロジック
      if (trimmedText.length >= MIN_TEXT_LENGTH) {
        // 現在の文が十分な長さならそれを使用
        bestText = trimmedText;
      } else if (recognitionPhrases.length > 0) {
        // または最長の認識フレーズを使用（通常は最も完全な文章）
        const sortedPhrases = [...recognitionPhrases].sort((a, b) => b.length - a.length);
        bestText = sortedPhrases[0];
      }
      
      // 有効な文章が見つかった場合のみ送信
      if (bestText && bestText.length >= MIN_TEXT_LENGTH) {
        // 重複チェック（前回送信したテキストとの類似性を確認）
        if (isSimilarText(bestText, lastSentText)) {
          console.log('類似テキストのため送信をスキップ:', bestText, 'vs', lastSentText);
          return;
        }
        
        console.log('完成した文章なので、メッセージとして送信:', bestText);
        lastSentText = bestText; // 送信したテキストを記録
        onResult(bestText);
        
        // 状態をリセット
        currentSentence = '';
        recognitionPhrases = [];
        
        // 送信後、送信ブロックを設定（連続送信を防止）- 3秒間
        blockSending = true;
        setTimeout(() => { blockSending = false; }, 3000);
      } else {
        console.log('有効な文章が見つからないため送信をスキップします');
      }
    };

    // 無音タイマーを初期化（単一メッセージ送信に最適化）
    resetSilenceTimer(() => {
      console.log('無音タイマーでメッセージ送信を試行');
      console.log('現在のフレーズ数:', recognitionPhrases.length);
      
      // 沈黙検出時は一度だけ送信する
      silenceDetected = true;
      
      // 単一送信のみ実行
      sendAndReset();
      
      // 即座に認識を停止
      stopSpeechRecognition();
    });

    // 音声認識結果のイベントハンドラ
    recognizer.recognized = (s, e) => {
      // 最後の認識時間を更新
      lastRecognitionTime = Date.now();
      // 無音検出フラグをリセット
      silenceDetected = false;
      
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const newText = e.result.text.trim();
        
        // 短いテキストの場合はバッファに追加し、UIにも表示する
        if (newText && newText.length < MIN_TEXT_LENGTH) {
          if (!recognitionPhrases.includes(newText)) {
            recognitionPhrases.push(newText);
            console.log('短いテキストをバッファに追加:', newText);
          }
          
          // currentSentenceに追加（連続性を確保）
          let updatedSentence = currentSentence;
          
          if (currentSentence && !currentSentence.includes(newText) && !newText.includes(currentSentence)) {
            if (!currentSentence.endsWith(' ') && !newText.startsWith(' ')) {
              updatedSentence = currentSentence + ' ';
            }
            updatedSentence += newText;
            console.log('現在の文に短いテキストを追加:', updatedSentence);
            currentSentence = updatedSentence;
          } else if (!currentSentence) {
            updatedSentence = newText;
            currentSentence = newText;
          }
          
          // 常にUIに表示（文章を累積して表示）
          onResult(currentSentence);
          
          // 無音タイマーをリセット
          resetSilenceTimer(() => {
            sendAndReset();
            stopSpeechRecognition();
          });
          
          return;
        }
        
        // すでに認識済みのテキストとの重複を避ける
        if (newText && !isSimilarText(newText, lastRecognizedText) && !isSimilarText(newText, lastText)) {
          // バッファに追加
          if (!recognitionPhrases.includes(newText)) {
            recognitionPhrases.push(newText);
          }
          
          // 完全な新しい文章が認識された場合（前回の文章との重複がない場合）のみ更新
          if (!currentSentence.includes(newText) && !newText.includes(currentSentence)) {
            lastRecognizedText = newText;
            lastText = newText; // 厳密な比較用に更新
            
            // 既存のテキストがあり、新しいテキストがそれを含まない場合のみ追加
            if (currentSentence.length > 0) {
              if (!currentSentence.endsWith(' ') && !newText.startsWith(' ')) {
                currentSentence += ' '; // 適切にスペースを追加
              }
              currentSentence += newText;
            } else {
              currentSentence = newText;
            }
            
            console.log('認識テキスト追加:', newText);
            console.log('現在の完全な文:', currentSentence);
            
            // 常に現在の文をUIに表示（累積表示を確実にする）
            onResult(currentSentence);

            // 文末判定（句読点が含まれている場合）または文字数制限の判定
            if (/[。！？]$/.test(currentSentence) || currentSentence.length >= MAX_TEXT_LENGTH) {
              // 句読点で終わる場合または最大文字数（50文字）に達した場合は文の区切りと判断して送信
              if (currentSentence.length >= MAX_TEXT_LENGTH) {
                console.log('最大文字数に達しました(50文字): 文を送信します');
              } else {
                console.log('文末記号を検出: 文を送信します');
              }
              sendAndReset();
            }
          } else {
            console.log('部分的に重複する認識をスキップ:', newText);
          }

          // 無音タイマーをリセット（これは常に行う）
          resetSilenceTimer(() => {
            sendAndReset();
            stopSpeechRecognition();
          });
        } else if (newText) {
          console.log('重複認識をスキップ:', newText);
          // 無音タイマーはリセットする（音声入力は続いている）
          resetSilenceTimer(() => {
            sendAndReset();
            stopSpeechRecognition();
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

  // 認識結果のバッファ
  let storedPhrases: string[] = [];
  let lastTranscript = '';
  let blockBrowserSending = false;

  // ブラウザ音声認識結果の最適な送信を制御
  const sendOptimalText = (transcript: string) => {
    // 送信ブロック中ならスキップ
    if (blockBrowserSending) {
      console.log('ブラウザ音声認識: 送信ブロック中のためスキップ');
      return;
    }
    
    // バッファに追加
    if (transcript.trim() && !storedPhrases.includes(transcript)) {
      storedPhrases.push(transcript);
    }
    
    // 完全な文章かどうか判定（文末記号、長さ、または最大文字数による判断）
    const isCompleteSentence = /[。！？!?]$/.test(transcript.trim());
    const isLongEnough = transcript.length >= 10;
    const isMaxLengthReached = transcript.length >= MAX_TEXT_LENGTH;
    
    if (isCompleteSentence || isLongEnough || isMaxLengthReached) {
      // 最大文字数に達した場合のログ
      if (isMaxLengthReached) {
        console.log('ブラウザ音声認識: 最大文字数(50文字)に達したので送信します');
      }
      if (!isSimilarText(transcript, lastSentText)) {
        console.log('ブラウザ音声認識: 完成した文章を送信:', transcript);
        
        // 最後に送信したテキストを記録
        lastSentText = transcript;
        
        // 送信
        onResult(transcript);
        
        // 送信ブロックを有効化
        blockBrowserSending = true;
        
        // バッファをクリア
        storedPhrases = [];
        
        // 3秒後にブロックを解除
        setTimeout(() => {
          blockBrowserSending = false;
        }, 3000);
      }
    } else {
      // 未完成の文章もUIに表示する（ただし送信はしない）
      console.log('ブラウザ音声認識: 未完成の文章をバッファに保持:', transcript);
      // 短いテキストでもUIに表示する
      onResult(transcript);
    }
  };

  browserRecognition.onresult = (event: any) => {
    const transcript = Array.from(event.results)
      .map((result: any) => result[0])
      .map((result) => result.transcript)
      .join('');

    if (transcript !== lastTranscript && transcript.length > 0) {
      // バッファ更新
      lastTranscript = transcript;
      
      // 最適な文章送信を試行
      sendOptimalText(transcript);
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