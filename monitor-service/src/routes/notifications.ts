import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { scopedDb } from '@cloudops/shared';

export async function notificationRoutes(app: FastifyInstance) {
  // Internal: push a new notification (same-docker-network, no auth)
  app.post('/notifications', async (request, reply) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const body = request.body as {
      type: string;
      category: string;
      title: string;
      description?: string;
      link?: string;
      userId?: string | null;
      roleRequired?: string | null;
      metadata?: Record<string, unknown>;
    };

    const [row] = await db.insert(t.notifications).values({
      type: body.type,
      category: body.category,
      title: body.title,
      description: body.description || null,
      link: body.link || null,
      userId: body.userId || null,
      roleRequired: body.roleRequired || null,
      metadata: (body.metadata || {}) as any,
    }).returning();

    return reply.status(201).send(row);
  });

  // FE: list notifications (paginated, filtered)
  app.get('/notifications', async (request, reply) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const query = request.query as {
      category?: string;
      unread?: string;
      limit?: string;
      offset?: string;
    };
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    // RBAC: user_id IS NULL OR user_id = current_user_id
    // admin sees all
    const currentUserId = (request.headers['x-user-id'] as string) || '';
    const userRole = (request.headers['x-user-role'] as string) || '';
    const isAdmin = userRole === 'admin';

    let conditions = [];
    if (!isAdmin && currentUserId) {
      conditions.push(
        sql`(${t.notifications.userId} IS NULL OR ${t.notifications.userId} = ${currentUserId}::uuid)`
      );
    }
    if (query.category) {
      conditions.push(eq(t.notifications.category, query.category));
    }
    if (query.unread === 'true') {
      conditions.push(isNull(t.notifications.readAt));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db.select()
      .from(t.notifications)
      .where(where)
      .orderBy(desc(t.notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return rows;
  });

  // FE: mark single notification as read
  app.post('/notifications/:id/read', async (request, reply) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const { id } = request.params as { id: string };

    const [row] = await db.update(t.notifications)
      .set({ readAt: new Date() })
      .where(eq(t.notifications.id, id))
      .returning();

    if (!row) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Notification not found' });
    }
    return row;
  });

  // FE: mark all notifications as read
  app.post('/notifications/read-all', async (request, reply) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const currentUserId = (request.headers['x-user-id'] as string) || '';
    const userRole = (request.headers['x-user-role'] as string) || '';
    const isAdmin = userRole === 'admin';

    let where;
    if (!isAdmin && currentUserId) {
      where = and(
        isNull(t.notifications.readAt),
        sql`(${t.notifications.userId} IS NULL OR ${t.notifications.userId} = ${currentUserId}::uuid)`
      );
    } else {
      where = isNull(t.notifications.readAt);
    }

    const updated = await db.update(t.notifications)
      .set({ readAt: new Date() })
      .where(where)
      .returning({ id: t.notifications.id });

    return { ok: true, updated: updated.length };
  });

  // FE: get unread count
  app.get('/notifications/unread-count', async (request) => {
    const scope = request.scope;
    const t = scopedDb(scope);
    const currentUserId = (request.headers['x-user-id'] as string) || '';
    const userRole = (request.headers['x-user-role'] as string) || '';
    const isAdmin = userRole === 'admin';

    let where;
    if (!isAdmin && currentUserId) {
      where = and(
        isNull(t.notifications.readAt),
        sql`(${t.notifications.userId} IS NULL OR ${t.notifications.userId} = ${currentUserId}::uuid)`
      );
    } else {
      where = isNull(t.notifications.readAt);
    }

    const [row] = await db.select({
      count: sql<number>`COUNT(*)::int`,
    }).from(t.notifications).where(where);

    return { count: row?.count || 0 };
  });
}
