// shared/src/db/scoped-db.ts
import { publicTables, demoTables, type ScopedTables } from './schema-factory.js';
import type { RequestScope } from './scope.js';

/**
 * 根据 scope 返回对应 schema 的表对象集合
 * demo 模式返回 demoTables，否则返回 publicTables
 */
export function scopedDb(scope: RequestScope): ScopedTables {
  return scope.schema === 'demo' ? demoTables : publicTables;
}
