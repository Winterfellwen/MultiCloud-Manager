// Redis 订阅器：监听 monitor-service 的告警事件

import Redis from 'ioredis';
import { config } from '../config.js';

class EventSubscriber {
  private redis: Redis | null = null;
  private alertHandlers: Array<(alert: unknown) => void> = [];

  start() {
    this.redis = new Redis(config.redisUrl);
    this.redis.subscribe('cloudops:alert.fired');
    this.redis.on('message', (channel, message) => {
      if (channel === 'cloudops:alert.fired') {
        try {
          const alert = JSON.parse(message);
          console.log(`[EventSubscriber] Received alert.fired:`, alert);
          this.alertHandlers.forEach((h) => h(alert));
        } catch (err) {
          console.error('[EventSubscriber] Failed to parse alert:', err);
        }
      }
    });
    console.log('[EventSubscriber] Started, listening for alert.fired');
  }

  onAlert(handler: (alert: unknown) => void): void {
    this.alertHandlers.push(handler);
  }

  stop() {
    this.redis?.disconnect();
  }
}

export const eventSubscriber = new EventSubscriber();
