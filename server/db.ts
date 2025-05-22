import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Initialize postgres client with retry logic
const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
  max_lifetime: 60 * 30,
  connection_timeout: 10,
  keepalive: true,
  debug: process.env.NODE_ENV === 'development',
});

// Create drizzle database instance
export const db = drizzle(sql, { schema });