/**
 * Text-to-speech functionality using Web Speech API
 */

/**
 * Speak text using the browser's native speech synthesis
 * @param text The text to speak
 * @param options Voice options
 * @returns Promise that resolves when speech is finished or rejects if there's an error
 */
export const speakText = (
  text: string,
  options: {
    rate?: number;
    pitch?: number;
    volume?: number;
    lang?: string;
  } = {}
): Promise<void> => {
  return new Promise((resolve, reject) => {
    // SpeechSynthesis APIが利用可能か確認
    if (!('speechSynthesis' in window)) {
      reject(new Error('このブラウザは音声合成をサポートしていません'));
      return;
    }

    // SpeechSynthesisUtteranceインスタンスを作成
    const utterance = new SpeechSynthesisUtterance(text);

    // オプションの設定
    utterance.rate = options.rate || 1.0; // 速度 (0.1-10)
    utterance.pitch = options.pitch || 1.0; // ピッチ (0-2)
    utterance.volume = options.volume || 1.0; // 音量 (0-1)
    utterance.lang = options.lang || 'ja-JP'; // 言語

    // イベントハンドラー
    utterance.onend = () => {
      resolve();
    };
    
    utterance.onerror = (event) => {
      reject(new Error(`音声合成エラー: ${event.error}`));
    };

    // 実行中の発声をキャンセル
    window.speechSynthesis.cancel();

    // 発話開始
    window.speechSynthesis.speak(utterance);
  });
};

/**
 * 音声合成を停止する
 */
export const stopSpeaking = (): void => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

/**
 * 利用可能な音声のリストを取得
 * @returns 利用可能な音声の配列
 */
export const getAvailableVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    // 音声が既にロードされている場合
    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    // 音声がまだロードされていない場合は、イベントを待機
    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices();
      resolve(voices);
    };
  });
};

/**
 * 指定された言語に最適な音声を選択する
 * @param lang 言語コード（例: 'ja-JP'）
 * @returns 選択された音声、または利用可能な音声がない場合はnull
 */
export const selectVoiceForLanguage = async (
  lang: string
): Promise<SpeechSynthesisVoice | null> => {
  const voices = await getAvailableVoices();
  
  // 指定された言語に完全に一致する音声を検索
  const exactMatch = voices.find(
    (voice) => voice.lang.toLowerCase() === lang.toLowerCase()
  );
  if (exactMatch) return exactMatch;
  
  // 言語コードの先頭部分が一致する音声を検索（例: 'ja-JP' → 'ja'）
  const langPrefix = lang.split('-')[0].toLowerCase();
  const prefixMatch = voices.find(
    (voice) => voice.lang.toLowerCase().startsWith(langPrefix)
  );
  if (prefixMatch) return prefixMatch;
  
  // デフォルト音声（最初の音声）を返す、または音声がない場合はnull
  return voices.length > 0 ? voices[0] : null;
};