import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// データベースURLが設定されているか確認
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

console.log("Attempting database connection...");

// 基本的な接続設定
const sql = postgres({
  host: "localhost",
  port: 5432,
  database: "postgres",
  username: "postgres",
  password: "postgres",
  ssl: false
});

// 接続テスト
async function testConnection() {
  try {
    await sql`SELECT 1`;
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database connection error:", error);
    throw error;
  }
}

// 接続テストを実行
testConnection();

export const db = drizzle(sql, { schema });