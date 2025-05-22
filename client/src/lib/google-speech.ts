import { SpeechClient } from '@google-cloud/speech';

// 音声認識のインスタンス
let speechClient: SpeechClient | null = null;
let recognitionStream: any = null;
// 無音タイマーのインスタンス
let silenceTimer: ReturnType<typeof setTimeout> | null = null;
// 無音タイムアウトの時間（ミリ秒）
const SILENCE_TIMEOUT = 3000; // 10秒から3秒に短縮
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
  
  // 完全一致の場合は類似とみなす
  if (a === b) return true;
  
  // どちらかがもう一方を含む場合は類似とみなす
  if (a.includes(b) || b.includes(a)) return true;
  
  // Levenshtein距離を計算して類似度を判定
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return true; // どちらも空文字列なら類似
  
  // 短いテキスト同士の場合、編集距離1以内なら類似とみなす（より厳密に）
  if (maxLength < 10) {
    const distance = levenshteinDistance(a, b);
    return distance <= 1;
  }
  
  // 長いテキストの場合、編集距離がテキスト長の20%未満なら類似とみなす（より厳密に）
  const distance = levenshteinDistance(a, b);
  return distance / maxLength < 0.2;
};

// Levenshtein距離を計算する関数
const levenshteinDistance = (a: string, b: string): number => {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // 削除
        matrix[j - 1][i] + 1, // 挿入
        matrix[j - 1][i - 1] + substitutionCost // 置換
      );
    }
  }

  return matrix[b.length][a.length];
};

// Google Speech-to-Text設定を初期化する関数
const initGoogleSpeechConfig = () => {
  try {
    const credentials = {
      client_email: import.meta.env.VITE_GOOGLE_CLIENT_EMAIL,
      private_key: import.meta.env.VITE_GOOGLE_PRIVATE_KEY,
      project_id: import.meta.env.VITE_GOOGLE_PROJECT_ID
    };

    if (!credentials.client_email || !credentials.private_key || !credentials.project_id) {
      console.error('Google Speech認証情報が設定されていません');
      return null;
    }

    speechClient = new SpeechClient({
      credentials
    });

    return speechClient;
  } catch (error) {
    console.error('Google Speech設定の初期化に失敗しました:', error);
    return null;
  }
};

// 音声認識を開始する関数
export const startSpeechRecognition = (
  onResult: (text: string) => void,
  onError: (error: string) => void
) => {
  try {
    // 既存の認識を停止
    if (recognitionStream) {
      stopSpeechRecognition();
    }

    // マイクのアクセス権限を確認
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const speechClient = initGoogleSpeechConfig();

        if (!speechClient) {
          onError('Google Speech認証情報が設定されていません。');
          return;
        }

        // 音声認識の設定
        const request = {
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'ja-JP',
            enableAutomaticPunctuation: true,
            model: 'default',
            useEnhanced: true,
          },
          interimResults: true,
        };

        // 音声認識ストリームを作成
        recognitionStream = speechClient
          .streamingRecognize(request)
          .on('error', (error) => {
            console.error('音声認識エラー:', error);
            onError(`音声認識エラー: ${error.message}`);
          })
          .on('data', (data) => {
            if (data.results[0] && data.results[0].alternatives[0]) {
              const transcript = data.results[0].alternatives[0].transcript;
              
              if (transcript && !isSimilarText(transcript, lastSentText)) {
                console.log('認識テキスト:', transcript);
                lastSentText = transcript;
                onResult(transcript);

                // 文末記号または最大文字数に達したら送信
                if (/[。！？]$/.test(transcript) || transcript.length >= MAX_TEXT_LENGTH) {
                  if (transcript.length >= MAX_TEXT_LENGTH) {
                    console.log('最大文字数に達しました(50文字): 文を送信します');
                  } else {
                    console.log('文末記号を検出: 文を送信します');
                  }
                  onResult(transcript);
                }
              }
            }
          });

        // オーディオストリームを音声認識ストリームに接続
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(1024, 1, 1);

        source.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (e) => {
          if (recognitionStream) {
            const inputData = e.inputBuffer.getChannelData(0);
            recognitionStream.write(inputData);
          }
        };

        // 無音タイマーを初期化
        resetSilenceTimer(() => {
          console.log('無音タイムアウト: 音声入力がありませんでした');
          stopSpeechRecognition();
        });

      })
      .catch(err => {
        console.error('マイクのアクセス権限エラー:', err);
        onError('マイクへのアクセス権限がありません。ブラウザの設定でマイクの使用を許可してください。');
      });
  } catch (error) {
    console.error('Google Speech初期化エラー:', error);
    onError(`Google Speech初期化エラー: ${error}`);
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
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
    stopSpeechRecognition();
  }, SILENCE_TIMEOUT);
};

// 音声認識を停止する関数
export const stopSpeechRecognition = () => {
  try {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }

    if (recognitionStream) {
      recognitionStream.end();
      recognitionStream = null;
    }

    if (speechClient) {
      speechClient.close();
      speechClient = null;
    }
  } catch (error) {
    console.error('音声認識停止中にエラーが発生しました:', error);
    recognitionStream = null;
    speechClient = null;
  }
}; 