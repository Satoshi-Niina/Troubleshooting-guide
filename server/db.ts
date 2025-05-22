import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Initialize postgres client with Replit-optimized config
const sql = postgres(process.env.DATABASE_URL!, {
  max: 3, // Replitの無料枠に合わせて調整
  idle_timeout: 30,
  connect_timeout: 15,
  max_lifetime: 60 * 10,
  connection_timeout: 10,
  keepalive: true,
  debug: process.env.NODE_ENV === 'development',
  onnotice: () => {}, // Replitのログを抑制
});

// Create drizzle database instance
export const db = drizzle(sql, { schema });