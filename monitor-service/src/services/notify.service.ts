import { db } from '../db/index.js';
import { notificationChannels } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import type { AlertSeverity } from '@cloudops/shared';

interface AlertAction {
  type: 'notify' | 'suggest' | 'auto';
  targets: string[];
}

export class NotifyService {
  async notify(actions: AlertAction[], message: string, severity: AlertSeverity) {
    for (const action of actions) {
      if (action.type !== 'notify') continue;
      for (const target of action.targets) {
        await this.sendToTarget(target, message, severity).catch((err) =>
          console.error(`Notify ${target} failed:`, err)
        );
      }
    }
  }

  private async sendToTarget(channelName: string, message: string, severity: AlertSeverity) {
    // target 可以是 channel name 或内置渠道名
    if (channelName === 'system') {
      console.log(`[System Notification] [${severity}] ${message}`);
      return;
    }

    const channel = await db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.name, channelName))
      .limit(1);

    if (channel.length === 0) {
      console.warn(`Notification channel "${channelName}" not found`);
      return;
    }

    const ch = channel[0];
    if (!ch.enabled) return;

    switch (ch.type) {
      case 'webhook':
        await this.sendWebhook(ch.config as { url: string; secret?: string }, message, severity);
        break;
      case 'email':
        await this.sendEmail(ch.config as { recipients: string[] }, message, severity);
        break;
      case 'slack':
        await this.sendSlack(ch.config as { webhookUrl: string }, message, severity);
        break;
    }
  }

  private async sendWebhook(
    cfg: { url: string; secret?: string },
    message: string,
    severity: AlertSeverity
  ) {
    await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[${severity.toUpperCase()}] ${message}`,
        severity,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  private async sendEmail(
    cfg: { recipients: string[] },
    message: string,
    severity: AlertSeverity
  ) {
    if (!config.smtp.host) {
      console.warn('SMTP not configured, skipping email notification');
      return;
    }
    // 动态 import nodemailer 避免未配置时加载
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
    await transporter.sendMail({
      from: config.smtp.from,
      to: cfg.recipients.join(','),
      subject: `[CloudOps 告警][${severity.toUpperCase()}] ${message.slice(0, 50)}`,
      text: message,
    });
  }

  private async sendSlack(
    cfg: { webhookUrl: string },
    message: string,
    severity: AlertSeverity
  ) {
    await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*[${severity.toUpperCase()}]* ${message}`,
      }),
    });
  }
}

export const notifyService = new NotifyService();
