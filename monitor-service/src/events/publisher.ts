import { Redis } from 'ioredis';
import { config } from '../config.js';

class EventPublisher {
  private redis: Redis | null = null;

  private getClient(): Redis {
    if (!this.redis) {
      this.redis = new Redis(config.redisUrl);
    }
    return this.redis;
  }

  async publish(event: string, payload: unknown) {
    const channel = `cloudops:${event}`;
    try {
      await this.getClient().publish(channel, JSON.stringify(payload));
      console.log(`Event published: ${channel}`);
    } catch (err) {
      console.error(`Failed to publish event ${channel}:`, err);
    }
  }
}

export const eventPublisher = new EventPublisher();
