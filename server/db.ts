import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

console.log("Attempting database connection with config:", {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || "5432",
  database: process.env.DB_NAME || "postgres",
  username: process.env.DB_USER || "postgres",
  ssl: process.env.DB_SSL === "true"
});

// 環境変数から接続設定を取得
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "postgres",
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  ssl: process.env.DB_SSL === "true",
  max: 10, // コネクションプールの最大数
  idle_timeout: 20, // アイドルタイムアウト（秒）
  connect_timeout: 10 // 接続タイムアウト（秒）
};

// 基本的な接続設定
const sql = postgres(dbConfig);

// 接続テスト
async function testConnection() {
  try {
    await sql`SELECT 1`;
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database connection error:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack
      });
    }
    throw error;
  }
}

// 接続テストを実行
testConnection();

export const db = drizzle(sql, { schema });