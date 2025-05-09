/**
 * 厳密なJSON修復ユーティリティ
 * OpenAI APIからの不完全なJSONレスポンスを修復し、有効なJSONに変換するための関数群
 */

/**
 * OpenAI APIからのJSONレスポンスを解析して修復する
 * @param jsonString JSON文字列
 * @returns 修復されたJSONオブジェクト
 */
export function fixAndParseJSON(jsonString: string): any {
  try {
    // まず直接パースを試みる
    return JSON.parse(jsonString);
  } catch (initialError) {
    console.log('直接JSONパースに失敗。修復を試みます...');
    
    // 余分な文字を取り除く
    let cleaned = jsonString
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/```/g, '')
      .trim();
      
    // JSONの開始と終了を正確に特定
    let start = cleaned.indexOf('{');
    let end = cleaned.lastIndexOf('}');
    
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }
    
    try {
      // 修復したJSONをパース
      return JSON.parse(cleaned);
    } catch (secondError) {
      console.log('基本的な修復でも失敗。詳細修復を試みます:', secondError instanceof Error ? secondError.message : '不明なエラー');
      
      // 特殊な文字を置換
      cleaned = cleaned
        .replace(/[\u2018\u2019]/g, "'")  // スマート引用符を単一引用符に
        .replace(/[\u201C\u201D]/g, '"')  // スマート二重引用符を二重引用符に
        .replace(/[^\x00-\x7F]/g, '')    // ASCII以外の文字を削除
        .replace(/,\s*}/g, '}')          // 末尾のコンマを削除
        .replace(/,\s*]/g, ']')          // 末尾のコンマを削除
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":'); // キーを適切に引用符で囲む
        
      try {
        // さらに修復したJSONをパース
        return JSON.parse(cleaned);
      } catch (thirdError) {
        // 最終手段: 階層的構造解析
        console.log('詳細修復でも失敗。最終修復を試みます:', thirdError instanceof Error ? thirdError.message : '不明なエラー');
        
        // 構造的な問題を検出し修復
        const { braces, brackets } = countBrackets(cleaned);
        
        // 括弧のバランスを修復
        if (braces.open > braces.close) {
          cleaned = cleaned + '}'.repeat(braces.open - braces.close);
        }
        
        if (brackets.open > brackets.close) {
          cleaned = cleaned + ']'.repeat(brackets.open - brackets.close);
        }
        
        try {
          return JSON.parse(cleaned);
        } catch (finalError) {
          // 最終的に失敗した場合、元の例外を投げる
          console.error('JSON修復の全ての試みが失敗しました:', finalError instanceof Error ? finalError.message : '不明なエラー');
          throw new Error('JSON解析に失敗しました: ' + (finalError instanceof Error ? finalError.message : '不明なエラー'));
        }
      }
    }
  }
}

/**
 * 文字列内の括弧の数を数える
 * @param str 対象の文字列
 * @returns 括弧のカウント情報
 */
function countBrackets(str: string): {
  braces: { open: number, close: number },
  brackets: { open: number, close: number }
} {
  return {
    braces: {
      open: (str.match(/{/g) || []).length,
      close: (str.match(/}/g) || []).length
    },
    brackets: {
      open: (str.match(/\[/g) || []).length,
      close: (str.match(/\]/g) || []).length
    }
  };
}