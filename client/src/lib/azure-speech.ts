// Azure Cognitive Servicesを使用した音声認識サービス
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

// 音声認識のインスタンス
let recognizer: sdk.SpeechRecognizer | null = null;
// 無音タイマーのインスタンス
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
// 無音タイムアウトの時間（ミリ秒）
const SILENCE_TIMEOUT = 1500; // 1.5秒の無音タイムアウト
// 音声認識停止タイムアウト時間（ミリ秒）
const STOP_TIMEOUT = 2000; // 2秒後に停止
// 最小文字数（1文字でも送信可能に）
const MIN_TEXT_LENGTH = 1;
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

    // 新しいインスタンスを作成する前に既存のインスタンスを停止
    if (recognizer) {
      stopSpeechRecognition();
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    speechConfig.speechRecognitionLanguage = 'ja-JP';
    // 音声認識の品質設定を最高に
    speechConfig.setServiceProperty("SPEECHCONTEXT", "DICTATION", "1");
    speechConfig.setServiceProperty("QUALITY", "INTERACTIVE", "1");
    speechConfig.setProfanity(sdk.ProfanityOption.Raw);

    // Single-shotモードの設定
    speechConfig.setProfanity(sdk.ProfanityOption.Masked);
    speechConfig.enableDictation();

    // VADの設定を最適化（スマートフォンライクな応答性）
    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
      '7000'  // 初期無音タイムアウトを7秒に設定
    );

    speechConfig.setProperty(
      sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
      '3000'  // セグメント間無音タイムアウトを3秒に設定
    );

    // 認識の感度を上げて安定性を向上（0.9に設定）
    speechConfig.setProperty(
      sdk.PropertyId.Speech_DetectionSensitivity,
      "0.9"
    );

    // エンドポイント検出の設定（0.8秒の無音で検出）
    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
      '800'
    );

    // VAD感度を調整（音声検出の安定性を向上）
    speechConfig.setProperty(
      sdk.PropertyId.Speech_DetectionVoiceActivityTimeoutMs,
      '500'
    );

    // 音声バッファリングの最適化
    speechConfig.setProperty(
      sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
      '200'
    );

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
    stopSpeechRecognition(); // マイクをミュート
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
    // 既存の認識を停止
    if (recognizer) {
      stopSpeechRecognition();
    }

    // マイクのアクセス権限を確認
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        // ストリームを停止（後でAudioConfigで使用するため）
        stream.getTracks().forEach(track => track.stop());

        // 状態をリセット
        lastSentText = '';
        recognitionPhrases = [];
        silenceDetected = false;
        blockSending = false;
        lastRecognitionTime = Date.now();

        const speechConfig = initAzureSpeechConfig();

        if (!speechConfig) {
          onError('Azure Speech認証情報が設定されていません。');
          return;
        }

        const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
        recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        let currentSentence = '';
        let lastRecognizedText = '';
        let lastText = '';
        let isProcessing = false; // 処理中フラグを追加

        // 文を送信してリセットする関数
        const sendAndReset = () => {
          if (blockSending || isProcessing) {
            console.log('送信ブロック中または処理中: スキップします');
            return;
          }

          isProcessing = true; // 処理開始

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
                isProcessing = false; // 処理完了
              }, 3000);
            } else {
              console.log('類似テキストのため送信をスキップ:', bestText, 'vs', lastSentText);
              isProcessing = false; // 処理完了
            }
          } else {
            console.log('有効な文章が見つからないため送信をスキップします');
            isProcessing = false; // 処理完了
          }
        };

        // 無音タイマーを初期化
        resetSilenceTimer(() => {
          if (!isProcessing) {
            console.log('無音タイマーでメッセージ送信を試行');
            console.log('現在のフレーズ数:', recognitionPhrases.length);

            silenceDetected = true;
            sendAndReset();
          }
        });

        // 音声認識結果のイベントハンドラ
        recognizer.recognized = (s, e) => {
          if (isProcessing) return; // 処理中は新しい認識をスキップ

          lastRecognitionTime = Date.now();
          silenceDetected = false;

          if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
            const newText = e.result.text.trim();

            if (newText && !isSimilarText(newText, lastRecognizedText) && !isSimilarText(newText, lastText)) {
              if (!recognitionPhrases.includes(newText)) {
                recognitionPhrases.push(newText);
              }

              if (!currentSentence.includes(newText) && !newText.includes(currentSentence)) {
                lastRecognizedText = newText;
                lastText = newText;

                if (currentSentence.length > 0) {
                  if (!currentSentence.endsWith(' ') && !newText.startsWith(' ')) {
                    currentSentence += ' ';
                  }
                  currentSentence += newText;
                } else {
                  currentSentence = newText;
                }

                console.log('認識テキスト追加:', newText);
                console.log('現在の完全な文:', currentSentence);

                onResult(currentSentence);

                if (/[。！？]$/.test(currentSentence) || currentSentence.length >= MAX_TEXT_LENGTH) {
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

        // 音声認識キャンセル時のイベントハンドラ
        recognizer.canceled = (s, e) => {
          if (e.reason === sdk.CancellationReason.Error) {
            console.error('Azure Speech エラー:', e.errorDetails);

            // エラーが発生した場合はブラウザのAPIにフォールバック
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
      })
      .catch(err => {
        console.error('マイクのアクセス権限エラー:', err);
        onError('マイクへのアクセス権限がありません。ブラウザの設定でマイクの使用を許可してください。');
      });
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
  if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    return false; // Azure Speechを優先するため、常にfalseを返す
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