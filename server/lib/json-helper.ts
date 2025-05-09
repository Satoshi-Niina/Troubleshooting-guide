/**
 * JSONレスポンスの処理と修復を行うヘルパー関数
 */

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
  cleanedResponse = cleanedResponse.replace(/^[^{[]*([{[])/s, '$1');
  cleanedResponse = cleanedResponse.replace(/([}\]])[^}\]]*$/s, '$1');

  console.log('クリーニング後のレスポンス (一部):', cleanedResponse.substring(0, 100) + '...');

  // 追加の検証
  try {
    // 試しにパースして検証
    JSON.parse(cleanedResponse);
    console.log("JSONフォーマットの検証: 有効");
  } catch (error) {
    console.error("JSONフォーマットの検証: 失敗", error.message);
    
    // JavaScriptの修復を試みる
    try {
      // コンマの後ろが閉じカッコの場合、余分なコンマを削除
      cleanedResponse = cleanedResponse.replace(/,\s*([}\]])/g, '$1');
      
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
      JSON.parse(cleanedResponse);
      console.log("JSONフォーマットの修復: 成功");
    } catch (repairError) {
      console.error("JSONフォーマットの修復: 失敗", repairError.message);
    }
  }

  return cleanedResponse;
}