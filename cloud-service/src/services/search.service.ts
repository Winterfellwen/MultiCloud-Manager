import { db } from '../db/index.js';
import { ilike, or, sql } from 'drizzle-orm';
import * as t from '../db/schema.js';

export interface SearchResults {
  resources: Array<{ id: string; name: string | null; type: string; provider: string; region: string }>;
  instances: Array<{ id: string; name: string | null; type: string; provider: string; region: string }>;
  alerts: Array<{ id: string; message: string; severity: string; status: string | null }>;
}

export class SearchService {
  async search(scope: any, q: string, limit: number = 5): Promise<SearchResults> {
    const pattern = `%${q}%`;

    const [resources, instances, alerts] = await Promise.all([
      db.select({
        id: t.cloudResources.id,
        name: t.cloudResources.name,
        type: sql<string>`'resource'`,
        provider: t.cloudResources.provider,
        region: t.cloudResources.region,
      }).from(t.cloudResources)
        .where(ilike(t.cloudResources.name, pattern))
        .limit(limit),

      db.select({
        id: t.instances.id,
        name: t.instances.name,
        type: sql<string>`'instance'`,
        provider: t.instances.provider,
        region: t.instances.region,
      }).from(t.instances)
        .where(or(
          ilike(t.instances.name, pattern),
          ilike(t.instances.providerInstanceId, pattern)
        ))
        .limit(limit),

      db.select({
        id: t.alerts.id,
        message: t.alerts.message,
        severity: t.alerts.severity,
        status: t.alerts.status,
      }).from(t.alerts)
        .where(ilike(t.alerts.message, pattern))
        .limit(limit),
    ]);

    return { resources, instances, alerts };
  }
}
