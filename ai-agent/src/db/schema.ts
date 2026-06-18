import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, boolean, index } from 'drizzle-orm/pg-core';

// 对话会话表
export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 256 }),
  context: jsonb('context'),
  status: varchar('status', { length: 16 }).default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 对话消息表
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 16 }).notNull(),
  content: text('content'),
  toolCalls: jsonb('tool_calls'),
  toolCallId: varchar('tool_call_id', { length: 128 }),
  toolName: varchar('tool_name', { length: 64 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  sessionIdIdx: index('idx_chat_messages_session').on(t.sessionId),
}));
