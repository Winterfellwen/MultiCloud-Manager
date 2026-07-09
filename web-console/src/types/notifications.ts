export type NotificationType =
  | 'chat.completed'
  | 'approval.requested'
  | 'remediation.pending'
  | 'insight.updated'
  | 'alert.firing';

export type NotificationCategory = 'ai' | 'ops' | 'alert' | 'system';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  description: string | null;
  link: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  userId: string | null;
  roleRequired: string | null;
  readAt: string | null;
  createdAt: string;
}
