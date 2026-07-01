// shared/src/db/scope.ts

/**
 * 数据库 schema 类型：public 为真实数据，demo 为演示数据
 */
export type DbSchema = 'public' | 'demo';

/**
 * 请求作用域：贯穿整个请求链路，决定数据访问层读哪个 schema
 */
export interface RequestScope {
  schema: DbSchema;
  isDemo: boolean;
  /** 'demo-u-1' 或真实 userId */
  userId: string;
}

/** 默认 scope：public（真实用户） */
export const PUBLIC_SCOPE: RequestScope = {
  schema: 'public',
  isDemo: false,
  userId: '',
};

/** demo scope：用于 demo 模式请求 */
export const DEMO_SCOPE: RequestScope = {
  schema: 'demo',
  isDemo: true,
  userId: 'demo-u-1',
};

/** 根据 isDemo 布尔值返回对应 scope */
export function scopeFromDemoFlag(isDemo: boolean, userId = ''): RequestScope {
  return isDemo
    ? { ...DEMO_SCOPE, userId: 'demo-u-1' }
    : { ...PUBLIC_SCOPE, userId };
}
