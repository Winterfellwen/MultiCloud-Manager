// AcpSessionManager（复用 OpenClaw manager.core.ts）
// 按 session 跟踪活跃 turn，不同 session 并发执行
// 可配置 maxConcurrentSessions 上限

import { config } from '../../config.js';
import { SessionActorQueue } from './queue.js';

interface ActiveTurnState {
  sessionKey: string;
  runId: string;
  startedAt: number;
}

export class AcpSessionManager {
  private readonly actorQueue = new SessionActorQueue();
  private readonly activeTurnBySession = new Map<string, ActiveTurnState>();

  /**
   * 执行 session 操作（同一 session 串行，不同 session 并发）
   */
  async runSessionTurn<T>(params: {
    sessionKey: string;
    runId: string;
    op: () => Promise<T>;
  }): Promise<T> {
    this.enforceConcurrentSessionLimit(params.sessionKey);

    return this.actorQueue.run(params.sessionKey, async () => {
      this.activeTurnBySession.set(params.sessionKey, {
        sessionKey: params.sessionKey,
        runId: params.runId,
        startedAt: Date.now(),
      });

      try {
        return await params.op();
      } finally {
        this.activeTurnBySession.delete(params.sessionKey);
      }
    });
  }

  /**
   * 并发 session 上限检查
   */
  private enforceConcurrentSessionLimit(sessionKey: string): void {
    const limit = config.agent.maxConcurrentSessions;
    if (this.activeTurnBySession.has(sessionKey)) return;

    if (this.activeTurnBySession.size >= limit) {
      throw new Error(`ACP_MAX_CONCURRENT_SESSIONS: ${limit}`);
    }
  }

  /**
   * 获取正在运行的 session 数量
   */
  getActiveSessionCount(): number {
    return this.activeTurnBySession.size;
  }

  /**
   * 获取指定 session 的活跃 turn
   */
  getActiveTurn(sessionKey: string): ActiveTurnState | undefined {
    return this.activeTurnBySession.get(sessionKey);
  }
}

export const sessionManager = new AcpSessionManager();
