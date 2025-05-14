import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// 環境変数が設定されていない場合はエラーメッセージを表示
if (!process.env.DATABASE_URL) {
  console.warn("警告: DATABASE_URLが設定されていません。一部の機能が制限される可能性があります。");
}

// データベース接続を試みる
let db;
try {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URLが設定されていません");
  }
  const sql = postgres(process.env.DATABASE_URL, {
    ssl: {
      mode: 'require'
    }
  });
  db = drizzle(sql, { schema });
} catch (error) {
  console.error("データベース接続エラー:", error);
  // エラーが発生した場合は空のオブジェクトを返す
  db = {
    query: async () => [],
    transaction: async (callback: any) => callback(),
  };
}

export { db };