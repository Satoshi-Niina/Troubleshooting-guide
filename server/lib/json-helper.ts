/**
 * JSONレスポンスの処理と修復を行うヘルパー関数
 * 以下のケースに対応:
 * 1. マークダウンコードブロック(```json、```)の除去
 * 2. JSON以外のテキスト説明の除去
 * 3. JavaScript文法エラーの修正(余分なカンマなど)
 * 4. 閉じ括弧の不足を検出して修正
 * 5. 特殊文字やUnicode文字の処理
 * 6. 不完全な配列や中断された構造の補完
 */

interface BalanceInfo {
  braceCount: number;  // { の数
  bracketCount: number; // [ の数
  lastArrayDelimiter: number; // 最後の配列区切り文字の位置
}

/**
 * OpenAI APIからのレスポンスからマークダウンの装飾を削除して、有効なJSONを抽出する
 * @param response OpenAI APIからのレスポンス文字列
 * @returns 処理済みの有効なJSON文字列
 */
export function cleanJsonResponse(response: string): string {
  if (!response) return '';

  console.log('生のレスポンス (一部):', response.substring(0, 100) + '...');

  // マークダウンのコードブロック記法を削除
  let cleanedResponse = response
    .replace(/```json\s*/g, '') // すべての```json
    .replace(/```\s*/g, '')     // すべての```
    .replace(/```/g, '')        // すべての```（閉じる用）
    .trim();

  // 先頭と末尾の余分な文字列を削除（例: "JSONデータは以下の通りです："などの説明文）
  cleanedResponse = cleanedResponse.replace(/^[^{[]*([{[])/, '$1');
  cleanedResponse = cleanedResponse.replace(/([}\]])[^}\]]*$/, '$1');

  console.log('クリーニング後のレスポンス (一部):', cleanedResponse.substring(0, 100) + '...');

  // 追加の検証
  try {
    // 試しにパースして検証
    JSON.parse(cleanedResponse);
    console.log("JSONフォーマットの検証: 有効");
    return cleanedResponse;
  } catch (error: any) {
    console.error("JSONフォーマットの検証: 失敗", error.message);
    
    // エラーの位置を特定して詳細に修復
    const posMatch = error.message.match(/position\s+(\d+)/i);
    let errorPosition = posMatch ? parseInt(posMatch[1], 10) : -1;
    
    if (errorPosition >= 0) {
      console.log(`エラー位置: ${errorPosition}`);
      const contextStart = Math.max(0, errorPosition - 30);
      const contextEnd = Math.min(cleanedResponse.length, errorPosition + 30);
      console.log(`問題のある箇所: "${cleanedResponse.substring(contextStart, errorPosition)}<<<HERE>>>${cleanedResponse.substring(errorPosition, contextEnd)}"`);
      
      // 構造分析と修復
      cleanedResponse = repairJsonAtPosition(cleanedResponse, errorPosition);
    }
    
    // 基本的な構文修復（前述の位置ベース修復が失敗した場合のフォールバック）
    cleanedResponse = cleanedResponse
      // コンマの後ろが閉じカッコの場合、余分なコンマを削除
      .replace(/,\s*([}\]])/g, '$1')
      // 属性と値の間の「:」の前後に空白がない場合に追加
      .replace(/([^"'\s]):/g, '$1: ')
      .replace(/:([^"'\s\[\{])/g, ': $1');
      
    // 不足している可能性のある閉じカッコを追加
    const openBraces = (cleanedResponse.match(/\{/g) || []).length;
    const closeBraces = (cleanedResponse.match(/\}/g) || []).length;
    
    if (openBraces > closeBraces) {
      const diff = openBraces - closeBraces;
      cleanedResponse = cleanedResponse + '}'.repeat(diff);
      console.log(`閉じカッコを${diff}個追加しました`);
    }
    
    const openBrackets = (cleanedResponse.match(/\[/g) || []).length;
    const closeBrackets = (cleanedResponse.match(/\]/g) || []).length;
    
    if (openBrackets > closeBrackets) {
      const diff = openBrackets - closeBrackets;
      cleanedResponse = cleanedResponse + ']'.repeat(diff);
      console.log(`閉じ角カッコを${diff}個追加しました`);
    }
    
    // 修復されたJSONを検証
    try {
      JSON.parse(cleanedResponse);
      console.log("JSONフォーマットの修復: 成功");
    } catch (repairError: any) {
      console.error("JSONフォーマットの修復: 失敗", repairError.message);
      
      // 最終手段: 部分的に正しいJSONのみを抽出
      try {
        const result = extractValidJsonPart(cleanedResponse);
        if (result && result.length > cleanedResponse.length / 2) { // 元のJSONの半分以上を抽出できた場合
          cleanedResponse = result;
          console.log("部分的なJSON抽出: 成功");
        } else {
          console.error("部分的なJSON抽出: 失敗 - 有効な部分が少なすぎます");
        }
      } catch (extractError) {
        console.error("部分的なJSON抽出: 失敗", extractError);
      }
    }
  }

  return cleanedResponse;
}

/**
 * 特定の位置でJSONを修復する
 * @param json 修復するJSON文字列
 * @param errorPosition エラーが発生した位置
 * @returns 修復されたJSON文字列
 */
function repairJsonAtPosition(json: string, errorPosition: number): string {
  // エラー箇所の周辺を検査
  const beforeError = json.substring(0, errorPosition);
  const afterError = json.substring(errorPosition);
  
  // ケース1: 配列内の不適切な要素区切り (例: [1, 2 3] -> [1, 2, 3])
  if (afterError.trim().startsWith('}') && beforeError.lastIndexOf('[') > beforeError.lastIndexOf('{')) {
    const fixedJson = beforeError + ',' + afterError;
    console.log("配列要素の区切りコンマを追加しました");
    return fixedJson;
  }
  
  // ケース2: 不完全な配列や中断された構造の検出
  const lastArrayStart = beforeError.lastIndexOf('[');
  const lastObjectStart = beforeError.lastIndexOf('{');
  
  if (lastArrayStart > lastObjectStart) {
    // 配列内で問題が発生
    if (afterError.trim().startsWith(']')) {
      // 不完全な最後の要素を削除
      const lastComma = beforeError.lastIndexOf(',');
      if (lastComma > lastArrayStart) {
        const fixedJson = beforeError.substring(0, lastComma) + afterError;
        console.log("配列の不完全な最後の要素を削除しました");
        return fixedJson;
      }
    }
  }
  
  // ケース3: 配列内のエラーを修正 (最も一般的なケース)
  // 配列内の閉じられていない要素を特定して修正
  const balanceInfo = analyzeJsonBalance(beforeError);
  
  if (balanceInfo.bracketCount > 0 && balanceInfo.lastArrayDelimiter > 0) {
    // 配列内のエラーと推定される場合、最後の有効な区切り位置で切り捨て
    const validPart = beforeError.substring(0, balanceInfo.lastArrayDelimiter + 1);
    let remainingBrackets = balanceInfo.bracketCount;
    
    // 閉じ括弧を追加
    const fixedJson = validPart + ']'.repeat(remainingBrackets) + 
                      '}'.repeat(balanceInfo.braceCount);
    
    console.log("不完全な配列要素を修正しました");
    return fixedJson;
  }
  
  // 詳細な修復が不可能な場合、元のJSONを返す
  return json;
}

/**
 * JSON文字列の括弧バランスを分析
 */
function analyzeJsonBalance(json: string): BalanceInfo {
  let braceBalance = 0;  // { と } のバランス
  let bracketBalance = 0; // [ と ] のバランス
  let lastValidComma = -1;
  
  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    
    if (char === '{') braceBalance++;
    else if (char === '}') braceBalance--;
    else if (char === '[') bracketBalance++;
    else if (char === ']') bracketBalance--;
    else if (char === ',' && bracketBalance > 0) {
      // 配列内のカンマの位置を記録
      lastValidComma = i;
    }
  }
  
  return {
    braceCount: braceBalance,
    bracketCount: bracketBalance,
    lastArrayDelimiter: lastValidComma
  };
}

/**
 * 文字列から有効なJSON部分を抽出する
 */
function extractValidJsonPart(text: string): string {
  // 外側のJSON構造を検索 ({...} または [...])
  const objectMatch = text.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/);
  const arrayMatch = text.match(/\[(?:[^\[\]]|(?:\[[^\[\]]*\]))*\]/);
  
  let result = '';
  
  if (objectMatch && objectMatch[0]) {
    result = objectMatch[0];
  } else if (arrayMatch && arrayMatch[0]) {
    result = arrayMatch[0];
  }
  
  // 抽出された部分が有効なJSONか確認
  try {
    if (result) {
      JSON.parse(result);
      return result;
    }
  } catch (e) {
    // 抽出された部分が有効なJSONでない場合は空文字列を返す
  }
  
  return '';
}