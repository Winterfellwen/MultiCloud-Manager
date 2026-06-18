// SessionActorQueue（复用 OpenClaw session-actor-queue.ts）
// 按 sessionKey 串行化操作，不同 session 之间并发

type QueueItem<T> = {
  op: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

export class SessionActorQueue {
  private readonly queues = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, QueueItem<unknown>[]>();

  async run<T>(sessionKey: string, op: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = { op, resolve, reject };

      const queue = this.pending.get(sessionKey) || [];
      queue.push(item as QueueItem<unknown>);
      this.pending.set(sessionKey, queue);

      if (!this.queues.has(sessionKey)) {
        this.queues.set(sessionKey, this.processQueue(sessionKey));
      }
    });
  }

  private async processQueue(sessionKey: string): Promise<void> {
    while (true) {
      const queue = this.pending.get(sessionKey);
      if (!queue || queue.length === 0) {
        this.pending.delete(sessionKey);
        this.queues.delete(sessionKey);
        return;
      }

      const item = queue.shift()!;
      try {
        const result = await item.op();
        item.resolve(result);
      } catch (error) {
        item.reject(error as Error);
      }
    }
  }
}
