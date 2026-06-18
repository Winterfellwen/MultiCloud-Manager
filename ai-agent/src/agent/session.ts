// 会话管理：创建/加载/持久化对话历史

import { db } from '../db/index.js';
import { chatSessions, chatMessages } from '../db/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';
import type { Message, AssistantMessage, ToolCall } from '../llm/types.js';

export interface SessionInfo {
  id: string;
  userId: string;
  title: string | null;
  status: string | null;
  createdAt: Date;
  updatedAt: Date;
}

class SessionManager {
  async createSession(userId: string, title?: string): Promise<string> {
    const result = await db
      .insert(chatSessions)
      .values({
        userId,
        title: title || '新对话',
        status: 'active',
      })
      .returning();
    return result[0].id;
  }

  async listSessions(userId: string): Promise<SessionInfo[]> {
    return db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.userId, userId), eq(chatSessions.status, 'active')))
      .orderBy(desc(chatSessions.updatedAt));
  }

  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const result = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);
    return result[0] || null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await db
      .update(chatSessions)
      .set({ title, updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));
  }

  async loadMessages(sessionId: string): Promise<Message[]> {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));

    return rows.map((row) => this.dbRowToMessage(row));
  }

  async saveUserMessage(sessionId: string, content: string): Promise<void> {
    await db.insert(chatMessages).values({
      sessionId,
      role: 'user',
      content,
    });
    await this.touchSession(sessionId);
  }

  async saveAssistantMessage(sessionId: string, msg: AssistantMessage): Promise<void> {
    const textParts = msg.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text);
    const toolCalls = msg.content.filter((c) => c.type === 'toolCall');
    await db.insert(chatMessages).values({
      sessionId,
      role: 'assistant',
      content: textParts.join('') || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      metadata: { usage: msg.usage, model: msg.model, stopReason: msg.stopReason },
    });
    await this.touchSession(sessionId);
  }

  async saveToolResult(
    sessionId: string,
    toolCallId: string,
    toolName: string,
    content: string,
    isError: boolean
  ): Promise<void> {
    await db.insert(chatMessages).values({
      sessionId,
      role: 'tool',
      toolCallId,
      toolName,
      content,
      metadata: { isError },
    });
  }

  private dbRowToMessage(row: typeof chatMessages.$inferSelect): Message {
    if (row.role === 'user') {
      return { role: 'user', content: row.content || '', timestamp: row.createdAt.getTime() };
    }
    if (row.role === 'assistant') {
      const content: AssistantMessage['content'] = [];
      if (row.content) content.push({ type: 'text', text: row.content });
      if (row.toolCalls) {
        for (const tc of row.toolCalls as ToolCall[]) {
          content.push(tc);
        }
      }
      return {
        role: 'assistant',
        content,
        model: (row.metadata as { model?: string })?.model || 'unknown',
        usage: (row.metadata as { usage?: AssistantMessage['usage'] })?.usage || { input: 0, output: 0, totalTokens: 0, cost: { input: 0, output: 0, total: 0 } },
        stopReason: (row.metadata as { stopReason?: AssistantMessage['stopReason'] })?.stopReason || 'stop',
        timestamp: row.createdAt.getTime(),
      };
    }
    return {
      role: 'tool',
      toolCallId: row.toolCallId || '',
      toolName: row.toolName || '',
      content: row.content || '',
      isError: (row.metadata as { isError?: boolean })?.isError || false,
      timestamp: row.createdAt.getTime(),
    };
  }

  private async touchSession(sessionId: string): Promise<void> {
    await db
      .update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));
  }
}

export const sessionManager = new SessionManager();
