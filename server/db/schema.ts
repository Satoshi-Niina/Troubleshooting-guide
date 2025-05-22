
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';


export const users = pgTable('users', {
    id: text('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
   });

export const emergencyFlows = pgTable('emergency_flows', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  title: text('title').notNull(),
  steps: jsonb('steps').notNull(),
  keyword: text('keyword').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const images = pgTable('images', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  url: text('url').notNull(),
  description: text('description').notNull(),
  embedding: jsonb('embedding').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),

  });
