import { pgTable, text, timestamp, jsonb, integer, boolean, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Define all tables first
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  display_name: text('display_name').notNull(),
  role: text('role').notNull().default('employee'),
  department: text('department'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  description: text('description')
});

const media = pgTable('media', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  messageId: integer('message_id').notNull(),
  type: text('type').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

const emergencyFlows = pgTable('emergency_flows', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  steps: jsonb('steps').notNull(),
  keyword: text('keyword').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

const images = pgTable('images', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  url: text('url').notNull(),
  description: text('description').notNull(),
  embedding: jsonb('embedding').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Export schema object after all tables are defined
export const schema = {
  users,
  media,
  emergencyFlows,
  images
};

// Export individual tables
export { users, media, emergencyFlows, images };
