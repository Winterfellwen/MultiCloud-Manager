/**
 * 部署环境自动检测与 URL 自动生成
 *
 * 设计目标：前端自动适配 Docker Compose / Render / Kubernetes 三种部署方式
 *
 * 核心原则：
 * 1. 前端 API 请求走相对路径（由 nginx/ingress 反向代理转发）
 * 2. WebSocket 基于当前页面 URL 动态生成协议 + /ws 路径
 * 3. 开发环境（localhost:5173）直连本地后端（localhost:3005
 */

/**
 * 检测部署平台（仅用于调试展示，不影响逻辑）
 */
export type DeployPlatform = 'local-dev | 'docker-compose' | 'render' | 'kubernetes' | 'unknown';

export function detectPlatform(): DeployPlatform {
  if (typeof window === 'undefined') return 'unknown';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'local-dev';
  if (host.endsWith('.onrender.com')) return 'render';
  if (host.endsWith('.svc.cluster.local') || host.includes('kubernetes') || host.includes('k8s')) return 'kubernetes';
  if (host.endsWith('.internal') || host.includes('docker')) return 'docker-compose';
  return 'unknown';
}

/**
 * API 基址：始终为空字符串（相对路径，由前端服务器反向代理转发
 * - 生产环境：同域名相对路径 → nginx 处理
 * - 开发环境：空字符串 → vite dev server proxy 处理
 */
export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  return ''; // 相对路径
}

/**
 * WebSocket 基址：根据当前页面 URL 动态生成
 * - https 页面 → wss://host/ws
 * - http 页面 → ws://host/ws
 * - 开发环境（localhost:5173）→ ws://localhost:3005/ws
 */
export function getWsBaseUrl(): string {
  // 优先使用环境变量（便于开发/测试时指定
  if (import.meta.env.VITE_WS_BASE_URL) {
    return import.meta.env.VITE_WS_BASE_URL;
  }
  if (import.meta.env.DEV) {
    return 'ws://localhost:3005/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

/**
 * 健康检查端点（用于前端状态页）
 */
export const HEALTH_ENDPOINTS = {
  overall: '/health',
  services: '/health/all',
} as const;

/**
 * 返回当前部署平台（用于 UI 展示）
 */
export const PLATFORM_INFO = {
  name: 'CloudOps AI Platform',
  version: '1.0.0',
  platform: detectPlatform(),
} as const;
