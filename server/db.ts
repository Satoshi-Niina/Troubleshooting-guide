import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Initialize postgres client
const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
  host: '0.0.0.0',
  ssl: false,
});

// Create drizzle database instance
export const db = drizzle(sql, { schema });