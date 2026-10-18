/**
 * PostgreSQL 连接池统一配置
 *
 * 背景：5 个服务（auth/cloud/monitor/ai-gateway/ai-agent）共用一个 PG 实例，
 * 原配置走 postgres.js 默认 max=10 → 合计 50 连接，在 Render 免费库
 * （连接上限约 97）中占用过半，且空闲连接不回收。
 *
 * 策略：小池 + 空闲回收 + 连接最长存活，控制 PG 端连接数与容器内句柄占用。
 * cloud-service 负载最重，单独放大到 6。
 */

/** postgres.js 连接池参数（与 postgres 包的 Options 结构对应） */
export interface PgPoolOptions {
  /** 单服务最大连接数 */
  max: number;
  /** 空闲连接回收秒数 */
  idle_timeout: number;
  /** 单连接最长存活秒数（规避服务端僵死连接） */
  max_lifetime: number;
  /** 建连超时秒数 */
  connect_timeout: number;
}

const DEFAULTS: Omit<PgPoolOptions, 'max'> = {
  idle_timeout: 20,
  max_lifetime: 3600,
  connect_timeout: 10,
};

/**
 * 生成连接池参数。默认 max=4；5 服务合计约 22 连接（含迁移临时连接），
 * 对免费库留出充足余量。
 */
export function pgPoolOptions(max: number = 4): PgPoolOptions {
  return { ...DEFAULTS, max };
}
