import { startSpeechRecognition as startAzureSpeech, stopSpeechRecognition as stopAzureSpeech } from './azure-speech';
import { startSpeechRecognition as startGoogleSpeech, stopSpeechRecognition as stopGoogleSpeech } from './google-speech';
import { startBrowserSpeechRecognition, stopBrowserSpeechRecognition } from './azure-speech';

// 音声認識サービスの優先順位
enum SpeechService {
  AZURE = 'azure',
  GOOGLE = 'google',
  BROWSER = 'browser'
}

// 現在使用中の音声認識サービス
let currentService: SpeechService | null = null;
// 音声認識の状態
let isRecognizing = false;

// 音声認識サービスの状態を管理
interface ServiceState {
  isInitialized: boolean;
  isReady: boolean;
  lastError: string | null;
  lastErrorTime: number | null;
}

// 各サービスの状態を管理
const serviceStates: Record<SpeechService, ServiceState> = {
  [SpeechService.AZURE]: { isInitialized: false, isReady: false, lastError: null, lastErrorTime: null },
  [SpeechService.GOOGLE]: { isInitialized: false, isReady: false, lastError: null, lastErrorTime: null },
  [SpeechService.BROWSER]: { isInitialized: false, isReady: false, lastError: null, lastErrorTime: null }
};

// サービスを事前に初期化する関数
const preInitializeService = async (service: SpeechService): Promise<void> => {
  if (serviceStates[service].isInitialized) return;

  try {
    switch (service) {
      case SpeechService.AZURE:
        // Azure Speechの初期化処理
        const speechConfig = initAzureSpeechConfig();
        if (speechConfig) {
          serviceStates[service].isReady = true;
        }
        break;
      case SpeechService.GOOGLE:
        // Google Speechの初期化処理
        const googleClient = initGoogleSpeechConfig();
        if (googleClient) {
          serviceStates[service].isReady = true;
        }
        break;
      case SpeechService.BROWSER:
        // ブラウザの音声認識APIの可用性チェック
        if (browserSupportsSpeechRecognition()) {
          serviceStates[service].isReady = true;
        }
        break;
    }
    serviceStates[service].isInitialized = true;
  } catch (error) {
    console.error(`${service} の事前初期化に失敗:`, error);
    serviceStates[service].lastError = error.message;
    serviceStates[service].lastErrorTime = Date.now();
  }
};

// 音声認識サービスを切り替える関数
const switchSpeechService = async (
  service: SpeechService,
  onResult: (text: string) => void,
  onError: (error: string) => void
): Promise<boolean> => {
  // 現在のサービスを停止（非同期で実行）
  const stopPromise = stopCurrentService();

  // 次のサービスを事前に初期化
  const nextService = getNextService(service);
  if (nextService) {
    preInitializeService(nextService);
  }

  // 現在のサービスの停止を待機
  await stopPromise;

  try {
    // サービスの状態をチェック
    if (!serviceStates[service].isReady) {
      console.log(`${service} は利用できません。次のサービスを試行します。`);
      return false;
    }

    switch (service) {
      case SpeechService.AZURE:
        startAzureSpeech(onResult, (error) => {
          handleServiceError(SpeechService.AZURE, error, onResult, onError);
        });
        break;
      case SpeechService.GOOGLE:
        startGoogleSpeech(onResult, (error) => {
          handleServiceError(SpeechService.GOOGLE, error, onResult, onError);
        });
        break;
      case SpeechService.BROWSER:
        startBrowserSpeechRecognition(onResult, (error) => {
          handleServiceError(SpeechService.BROWSER, error, onResult, onError);
        });
        break;
    }

    currentService = service;
    isRecognizing = true;
    return true;
  } catch (error) {
    console.error(`${service} 音声認識の開始に失敗:`, error);
    return false;
  }
};

// 次のサービスを取得する関数
const getNextService = (currentService: SpeechService): SpeechService | null => {
  switch (currentService) {
    case SpeechService.AZURE:
      return SpeechService.GOOGLE;
    case SpeechService.GOOGLE:
      return SpeechService.BROWSER;
    default:
      return null;
  }
};

// サービスエラーを処理する関数
const handleServiceError = (
  service: SpeechService,
  error: string,
  onResult: (text: string) => void,
  onError: (error: string) => void
) => {
  console.error(`${service} エラー:`, error);
  serviceStates[service].lastError = error;
  serviceStates[service].lastErrorTime = Date.now();
  serviceStates[service].isReady = false;

  const nextService = getNextService(service);
  if (nextService) {
    switchSpeechService(nextService, onResult, onError);
  } else {
    onError('すべての音声認識サービスが利用できません。');
  }
};

// 現在の音声認識サービスを停止する関数
const stopCurrentService = async (): Promise<void> => {
  if (!currentService) return;

  try {
    switch (currentService) {
      case SpeechService.AZURE:
        stopAzureSpeech();
        break;
      case SpeechService.GOOGLE:
        stopGoogleSpeech();
        break;
      case SpeechService.BROWSER:
        stopBrowserSpeechRecognition();
        break;
    }
  } catch (error) {
    console.error('音声認識の停止中にエラーが発生:', error);
  }

  currentService = null;
  isRecognizing = false;
};

// 音声認識を開始する関数
export const startSpeechRecognition = async (
  onResult: (text: string) => void,
  onError: (error: string) => void
): Promise<void> => {
  if (isRecognizing) {
    console.log('音声認識は既に実行中です');
    return;
  }

  // すべてのサービスを事前に初期化
  await Promise.all([
    preInitializeService(SpeechService.AZURE),
    preInitializeService(SpeechService.GOOGLE),
    preInitializeService(SpeechService.BROWSER)
  ]);

  // 優先順位に従って音声認識サービスを試行
  const success = await switchSpeechService(SpeechService.AZURE, onResult, onError);
  if (!success) {
    console.log('Azure Speechの開始に失敗したため、Google Speechを試行します');
    await switchSpeechService(SpeechService.GOOGLE, onResult, onError);
  }
};

// 音声認識を停止する関数
export const stopSpeechRecognition = async (): Promise<void> => {
  await stopCurrentService();
};

// 現在の音声認識サービスを取得する関数
export const getCurrentSpeechService = (): SpeechService | null => {
  return currentService;
};

// 音声認識の状態を取得する関数
export const isSpeechRecognitionActive = (): boolean => {
  return isRecognizing;
}; 