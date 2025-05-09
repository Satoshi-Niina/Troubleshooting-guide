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
    
    // 不完全なJSONを特定して修復
    try {
      const partialObject = JSON.parse(cleaned);
      // もし正常にパースできた場合はそのまま返す
      return partialObject;
    } catch (parseError) {
      // パースできなかった場合は、部分的なJSONの修復を試みる
      console.log('基本的な修復でも失敗。詳細修復を試みます');
      
      // エラーの位置を特定する
      let errorPosition = -1;
      let errorMessage = '';
      
      if (parseError instanceof Error) {
        errorMessage = parseError.message;
        // "JSON at position X" という形式のエラーメッセージから位置を抽出
        const posMatch = errorMessage.match(/position\s+(\d+)/i);
        if (posMatch && posMatch[1]) {
          errorPosition = parseInt(posMatch[1], 10);
        }
      }
      
      if (errorPosition > 0) {
        console.log(`エラー位置: ${errorPosition}, メッセージ: ${errorMessage}`);
        
        // 問題のある部分の前後を出力
        const start = Math.max(0, errorPosition - 20);
        const end = Math.min(cleaned.length, errorPosition + 20);
        console.log(`問題箇所の周辺: "${cleaned.substring(start, errorPosition)}<<<ERROR HERE>>>${cleaned.substring(errorPosition, end)}"`);

        // 1. 途中で切れたオブジェクトの検出と修復
        let fixed = '';
        
        // エラー位置から末尾までに記述が切れている可能性がある
        if (errorPosition > cleaned.length * 0.9) {
          // エラー位置が文字列の末尾付近なら、不足している閉じ括弧を追加
          const { braces, brackets } = countBrackets(cleaned);
          fixed = cleaned;
          
          if (braces.open > braces.close) {
            fixed += '}'.repeat(braces.open - braces.close);
          }
          
          if (brackets.open > brackets.close) {
            fixed += ']'.repeat(brackets.open - brackets.close);
          }
        } else {
          // 途中で不正な文字や形式が含まれている場合
          // エラー発生箇所の前後を分析し修復
          const before = cleaned.substring(0, errorPosition);
          const after = cleaned.substring(errorPosition);
          
          // エラー箇所の文字を特定して修正または削除
          const errorChar = cleaned.charAt(errorPosition);
          console.log(`エラー文字: "${errorChar}"`);
          
          if (errorChar === ',') {
            // 不要なカンマの除去
            fixed = before + after.substring(1);
          } else if (errorChar === '"' || errorChar === "'") {
            // 不完全な引用符の修正
            fixed = before + after.substring(1);
          } else {
            // その他の不正な文字・構造の場合
            // 直前の有効なJSONまでを抽出して閉じる
            fixed = repairIncompleteStructure(cleaned, errorPosition);
          }
        }
        
        // 特殊文字の変換
        fixed = fixed
          .replace(/[\u2018\u2019]/g, "'")  // スマート引用符を単一引用符に
          .replace(/[\u201C\u201D]/g, '"')  // スマート二重引用符を二重引用符に
          .replace(/,\s*}/g, '}')           // 末尾のコンマを削除
          .replace(/,\s*]/g, ']')           // 末尾のコンマを削除
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":'); // キーを適切に引用符で囲む
        
        try {
          // 修復したJSONをパース
          return JSON.parse(fixed);
        } catch (finalError) {
          console.error('JSON修復の全ての試みが失敗しました');
          
          // 最後の手段：すべての非ASCII文字を削除し、構造だけを維持する
          const asciiOnly = cleaned.replace(/[^\x00-\x7F]/g, '');
          
          try {
            return JSON.parse(asciiOnly);
          } catch (e) {
            throw new Error('JSON解析に失敗しました: ' + (finalError instanceof Error ? finalError.message : '不明なエラー'));
          }
        }
      } else {
        // エラー位置を特定できなかった場合は一般的な修復を試みる
        const generalFixed = cleaned
          .replace(/[\u2018\u2019]/g, "'")  // スマート引用符を単一引用符に
          .replace(/[\u201C\u201D]/g, '"')  // スマート二重引用符を二重引用符に
          .replace(/[^\x00-\x7F]/g, '')     // ASCII以外の文字を削除
          .replace(/,\s*}/g, '}')           // 末尾のコンマを削除
          .replace(/,\s*]/g, ']')           // 末尾のコンマを削除
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":'); // キーを適切に引用符で囲む
          
        const { braces, brackets } = countBrackets(generalFixed);
        
        let balancedJSON = generalFixed;
        
        if (braces.open > braces.close) {
          balancedJSON += '}'.repeat(braces.open - braces.close);
        }
        
        if (brackets.open > brackets.close) {
          balancedJSON += ']'.repeat(brackets.open - brackets.close);
        }
        
        try {
          return JSON.parse(balancedJSON);
        } catch (e) {
          throw new Error('JSON解析に失敗しました: ' + (e instanceof Error ? e.message : '不明なエラー'));
        }
      }
    }
  }
}

/**
 * 不完全なJSON構造を修復する
 * @param str JSON文字列
 * @param errorPos エラーが発生した位置
 * @returns 修復されたJSON文字列
 */
function repairIncompleteStructure(str: string, errorPos: number): string {
  // エラー位置より前の部分を抽出
  const beforeError = str.substring(0, errorPos);
  
  // 直前の有効な構造を探す
  let lastValidObject = '';
  
  // 直前の閉じ括弧を探す（最後に正常に閉じたオブジェクトまで）
  const lastCloseBrace = beforeError.lastIndexOf('}');
  const lastCloseBracket = beforeError.lastIndexOf(']');
  
  if (lastCloseBrace > lastCloseBracket) {
    lastValidObject = beforeError.substring(0, lastCloseBrace + 1);
  } else if (lastCloseBracket > -1) {
    lastValidObject = beforeError.substring(0, lastCloseBracket + 1);
  } else {
    // 閉じ括弧が見つからない場合は、直前までの文字列を使用
    lastValidObject = beforeError;
  }
  
  // 残りの構造を復元するための括弧を追加
  const { braces, brackets } = countBrackets(lastValidObject);
  
  let fixed = lastValidObject;
  
  if (braces.open > braces.close) {
    fixed += '}'.repeat(braces.open - braces.close);
  }
  
  if (brackets.open > brackets.close) {
    fixed += ']'.repeat(brackets.open - brackets.close);
  }
  
  return fixed;
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