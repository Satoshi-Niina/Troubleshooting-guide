// Azure Cognitive Servicesを使用した音声認識サービス
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { toast } from '@/hooks/use-toast';

// 音声認識のインスタンス
let recognizer: sdk.SpeechRecognizer | null = null;
// 無音タイマーのインスタンス
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
// 無音タイムアウトの時間（ミリ秒）
const SILENCE_TIMEOUT = 2000; // 2秒の無音タイムアウト
// 音声認識停止タイムアウト時間（ミリ秒）
const STOP_TIMEOUT = 1500; // 1.5秒後に停止
// 最小文字数（より短いテキストも許可）
const MIN_TEXT_LENGTH = 1; // 最小文字数を1に設定して即時認識
// 認識結果のキャッシュサイズ
const MAX_CACHE_SIZE = 5;
// 最大文字数（これを超えたら自動的に送信）
const MAX_TEXT_LENGTH = 40;
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

// Levenshtein距離を計算する関数
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i-1] === b[j-1]) {
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i-1][j-1] + 1,
          matrix[i][j-1] + 1,
          matrix[i-1][j] + 1
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

    if (recognizer) {
      stopSpeechRecognition();
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    speechConfig.speechRecognitionLanguage = 'ja-JP';
    speechConfig.setServiceProperty("SPEECHCONTEXT", "DICTATION", "1");
    speechConfig.setServiceProperty("QUALITY", "INTERACTIVE", "1");
    speechConfig.setProfanity(sdk.ProfanityOption.Raw);
    speechConfig.enableDictation();

    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
      '8000'
    );

    speechConfig.setProperty(
      sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
      '1000'
    );

    speechConfig.setProperty(
      sdk.PropertyId.Speech_DetectionSensitivity,
      "0.8"
    );

    // 音声入力感度を調整
    speechConfig.setProperty(
      sdk.PropertyId.Speech_AudioInputSensitivity,
      "0.8"
    );

    // 初期無音タイムアウトを設定
    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
      "3000"
    );

    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
      '1000'
    );

    speechConfig.setProperty(
      sdk.PropertyId.Speech_DetectionVoiceActivityTimeoutMs,
      '1000'
    );

    speechConfig.setProperty(
      sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
      '200'
    );

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

// 音声認識を開始する関数
if (typeof window !== 'undefined') {
  window.addEventListener('reset-recognition-phrases', () => {
    console.log('認識フレーズリセットコマンド受信');
    recognitionPhrases = [];
    lastSentText = '';
    blockSending = false;
    silenceDetected = false;
  });
}

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
    stopSpeechRecognition();
  }, SILENCE_TIMEOUT);
};

export const startSpeechRecognition = async (
  onResult: (text: string) => void,
  onError: (error: string) => void
) => {
  try {
    await stopSpeechRecognition();

    // マイクのアクセス権限を確認
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // ストリームを停止
    stream.getTracks().forEach(track => track.stop());

    // 状態をリセット
    recognizer = null;
    lastSentText = '';
    recognitionPhrases = [];
    silenceDetected = false;
    blockSending = false;
    lastRecognitionTime = Date.now();

    const speechConfig = initAzureSpeechConfig();
    if (!speechConfig) {
      throw new Error('Azure Speech設定の初期化に失敗しました');
    }

    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    let currentSentence = '';
    let lastRecognizedText = '';
    let lastText = '';
    let isProcessing = false;

    const sendAndReset = () => {
      if (blockSending || isProcessing) {
        console.log('送信ブロック中または処理中: スキップします');
        return;
      }

      isProcessing = true;

      const trimmedText = currentSentence.trim();
      let bestText = '';

      if (trimmedText.length >= MIN_TEXT_LENGTH) {
        bestText = trimmedText;
      } else if (recognitionPhrases.length > 0) {
        const sortedPhrases = [...recognitionPhrases].sort((a, b) => b.length - a.length);
        bestText = sortedPhrases[0];
      }

      if (bestText && bestText.length >= MIN_TEXT_LENGTH) {
        if (!isSimilarText(bestText, lastSentText)) {
          console.log('完成した文章なので、メッセージとして送信:', bestText);
          lastSentText = bestText;
          onResult(bestText);

          currentSentence = '';
          recognitionPhrases = [];

          blockSending = true;
          setTimeout(() => {
            blockSending = false;
            isProcessing = false;
          }, 3000);
        } else {
          console.log('類似テキストのため送信をスキップ:', bestText, 'vs', lastSentText);
          isProcessing = false;
        }
      } else {
        console.log('有効な文章が見つからないため送信をスキップします');
        isProcessing = false;
      }
    };

    resetSilenceTimer(() => {
      if (!isProcessing) {
        console.log('無音タイマーでメッセージ送信を試行');
        console.log('現在のフレーズ数:', recognitionPhrases.length);
        silenceDetected = true;
        sendAndReset();
      }
    });

    recognizer.recognized = (s, e) => {
      if (isProcessing) return;

      lastRecognitionTime = Date.now();
      silenceDetected = false;

      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const newText = e.result.text.trim();

        if (newText && !isSimilarText(newText, lastRecognizedText) && !isSimilarText(newText, lastText)) {
          if (!recognitionPhrases.includes(newText)) {
            recognitionPhrases.push(newText);
          }

          const normalizedNewText = newText.trim();
          const normalizedCurrentSentence = currentSentence.trim();

          // 同じような内容の認識結果は無視
          const similarExists = recognitionPhrases.some(phrase => 
            isSimilarText(normalizedNewText, phrase)
          );

          if (!similarExists) {
            if (normalizedCurrentSentence.length > 0) {
              currentSentence = `${normalizedCurrentSentence} ${normalizedNewText}`;
            } else {
              currentSentence = normalizedNewText;
            }

            console.log('認識テキスト追加:', newText);
            console.log('現在の完全な文:', currentSentence);

            // バッファリングされた文章のみを送信
            if (currentSentence.length >= MIN_TEXT_LENGTH) {
              onResult(currentSentence);
            }
          } else {
            console.log('類似テキストをスキップ:', normalizedNewText);
          }
          resetSilenceTimer(() => {
            if (!isProcessing) {
              sendAndReset();
            }
          });
        } else if (newText) {
          console.log('重複認識をスキップ:', newText);
          resetSilenceTimer(() => {
            if (!isProcessing) {
              sendAndReset();
            }
          });
        }
      }
    };

    recognizer.canceled = (s, e) => {
      if (e.reason === sdk.CancellationReason.Error) {
        console.error('Azure Speech エラー:', e.errorDetails);
        stopSpeechRecognition();
        startBrowserSpeechRecognition(onResult, onError);
        toast({
          title: 'ブラウザの音声認識に切り替えました',
          description: 'より安定した音声認識を提供します',
          duration: 3000,
        });
      }
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    };

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
    startBrowserSpeechRecognition(onResult, onError);
  }
};

export const stopSpeechRecognition = async () => {
  try {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }

    if (recognizer) {
      await new Promise<void>((resolve, reject) => {
        recognizer?.stopContinuousRecognitionAsync(
          () => {
            console.log('Azure Speech認識を停止しました');
            recognizer = null;
            resolve();
          },
          (error) => {
            console.error('認識停止エラー:', error);
            recognizer = null;
            reject(error);
          }
        );
      }).catch(() => {
        // エラーが発生しても処理を継続
      });
    }
  } catch (error) {
    console.error('音声認識停止中にエラーが発生しました:', error);
  } finally {
    recognizer = null;
  }
};

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
  if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    return false;
  }
  return false;
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

  let storedPhrases: string[] = [];
  let lastTranscript = '';
  let blockBrowserSending = false;

  const sendOptimalText = (transcript: string) => {
    if (blockBrowserSending) {
      console.log('ブラウザ音声認識: 送信ブロック中のためスキップ');
      return;
    }

    if (transcript.trim() && !storedPhrases.includes(transcript)) {
      storedPhrases.push(transcript);
    }

    const isCompleteSentence = /[。！？!?]$/.test(transcript.trim());
    const isLongEnough = transcript.length >= 10;
    const isMaxLengthReached = transcript.length >= MAX_TEXT_LENGTH;

    if (isCompleteSentence || isLongEnough || isMaxLengthReached) {
      if (isMaxLengthReached) {
        console.log('ブラウザ音声認識: 最大文字数(50文字)に達したので送信します');
      }
      if (!isSimilarText(transcript, lastSentText)) {
        console.log('ブラウザ音声認識: 完成した文章を送信:', transcript);

        lastSentText = transcript;
        onResult(transcript);

        blockBrowserSending = true;
        storedPhrases = [];

        setTimeout(() => {
          blockBrowserSending = false;
        }, 3000);
      }
    } else {
      console.log('ブラウザ音声認識: 未完成の文章をバッファに保持:', transcript);
      onResult(transcript);
    }
  };

  browserRecognition.onresult = (event: any) => {
    const transcript = Array.from(event.results)
      .map((result: any) => result[0])
      .map((result) => result.transcript)
      .join('');

    if (transcript !== lastTranscript && transcript.length > 0) {
      lastTranscript = transcript;
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