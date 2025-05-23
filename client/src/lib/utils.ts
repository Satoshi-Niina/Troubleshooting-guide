/**
 * オブジェクトのキーを指定された順に並べ替えるユーティリティ関数
 * 渡された fields が undefined/null の場合にも安全に処理
 */
export function orderSelectedFields(fields: Record<string, any> | undefined | null): Record<string, any> {
  if (!fields || typeof fields !== "object") return {};

  return Object.entries(fields).reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, any>);
}
