import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

// Set DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:takabeni@0.0.0.0:5432/maintenance";

// Initialize postgres client with Replit-optimized config
const sql = postgres(DATABASE_URL, {
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