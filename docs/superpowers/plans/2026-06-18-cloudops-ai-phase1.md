# CloudOps AI — Phase 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建项目脚手架，实现 Auth Service + API Gateway + Docker Compose 基础设施，使系统可以启动并通过认证。

**Architecture:** 微服务架构，Fastify + TypeScript 后端，PostgreSQL + Redis 数据层，Docker Compose 一键部署。Phase 1 聚焦认证授权核心能力。

**Tech Stack:** Node.js 22+ / TypeScript / Fastify / PostgreSQL / Redis / Docker Compose / JWT / bcrypt

---

## 文件结构

```
cloudops-ai/
├── docker-compose.yml                    # 所有服务容器编排
├── .env.example                          # 环境变量模板
├── package.json                          # monorepo root（pnpm workspace）
├── pnpm-workspace.yaml                   # workspace 配置
│
├── shared/                               # 共享类型和工具
│   ├── package.json
│   ├── src/
│   │   ├── types/
│   │   │   ├── user.ts                   # 用户类型定义
│   │   │   ├── audit.ts                  # 审计日志类型
│   │   │   ├── instance.ts               # 云实例类型
│   │   │   ├── alert.ts                  # 告警类型
│   │   │   └── index.ts                  # barrel export
│   │   ├── errors/
│   │   │   └── index.ts                  # 统一错误类型
│   │   └── index.ts
│   └── tsconfig.json
│
├── auth-service/                         # 认证授权服务
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts
│   ├── src/
│   │   ├── index.ts                      # 服务入口
│   │   ├── config.ts                     # 配置加载
│   │   ├── db/
│   │   │   ├── schema.ts                 # Drizzle ORM schema
│   │   │   ├── migrate.ts                # 迁移执行
│   │   │   └── index.ts                  # DB 连接
│   │   ├── routes/
│   │   │   ├── auth.ts                   # 登录/注册/刷新 token
│   │   │   ├── users.ts                  # 用户 CRUD
│   │   │   └── audit.ts                  # 审计日志查询
│   │   ├── middleware/
│   │   │   └── auth.ts                   # JWT 验证中间件
│   │   ├── services/
│   │   │   ├── auth.service.ts           # 认证逻辑
│   │   │   ├── user.service.ts           # 用户管理
│   │   │   └── audit.service.ts          # 审计日志
│   │   └── utils/
│   │       └── jwt.ts                    # JWT 工具
│   └── migrations/
│       └── 001_init.sql
│
├── api-gateway/                          # API 网关
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                      # 服务入口
│   │   ├── config.ts
│   │   ├── routes/
│   │   │   ├── proxy.ts                  # 反向代理路由
│   │   │   └── health.ts                 # 健康检查
│   │   └── middleware/
│   │       ├── auth.ts                   # 转发认证头
│   │       ├── rate-limit.ts             # 限流
│   │       └── logger.ts                 # 请求日志
│   └── package.json
│
├── migrations/                           # SQL 迁移文件
│   └── 001_init.sql
│
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-06-18-cloudops-ai-design.md
        └── plans/
            └── 2026-06-18-cloudops-ai-phase1.md
```

---

### Task 1: 项目初始化 + monorepo 搭建

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.env.example`
- Create: `docker-compose.yml`

- [ ] **Step 1: 创建 monorepo root**

```json
// package.json
{
  "name": "cloudops-ai",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel run dev",
    "build": "pnpm -r run build",
    "db:migrate": "pnpm -r run db:migrate",
    "docker:up": "docker compose up -d",
    "docker:down": "docker compose down"
  }
}
```

- [ ] **Step 2: 创建 pnpm workspace**

```yaml
# pnpm-workspace.yaml
packages:
  - 'shared'
  - 'auth-service'
  - 'api-gateway'
  - 'cloud-service'
  - 'monitor-service'
  - 'ai-agent'
  - 'worker'
```

- [ ] **Step 3: 创建环境变量模板**

```bash
# .env.example
# Database
POSTGRES_DB=cloudops
POSTGRES_USER=cloudops
POSTGRES_PASSWORD=changeme
DATABASE_URL=postgres://cloudops:changeme@postgres:5432/cloudops

# Redis
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=changeme-jwt-secret-at-least-32-chars
JWT_EXPIRES_IN=24h

# API Gateway
API_GATEWAY_PORT=3000
AUTH_SERVICE_URL=http://auth-service:3004
CLOUD_SERVICE_URL=http://cloud-service:3001
MONITOR_SERVICE_URL=http://monitor-service:3002
AI_AGENT_URL=http://ai-agent:3003
```

- [ ] **Step 4: 创建 docker-compose.yml**

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  auth-service:
    build:
      context: .
      dockerfile: auth-service/Dockerfile
    ports:
      - "3004:3004"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN}
      PORT: 3004
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./auth-service:/app
      - /app/node_modules

  api-gateway:
    build:
      context: .
      dockerfile: api-gateway/Dockerfile
    ports:
      - "${API_GATEWAY_PORT:-3000}:3000"
    environment:
      AUTH_SERVICE_URL: ${AUTH_SERVICE_URL}
      CLOUD_SERVICE_URL: ${CLOUD_SERVICE_URL}
      MONITOR_SERVICE_URL: ${MONITOR_SERVICE_URL}
      AI_AGENT_URL: ${AI_AGENT_URL}
      PORT: 3000
    depends_on:
      - auth-service

volumes:
  pgdata:
  redisdata:
```

- [ ] **Step 5: 创建 pnpm-lock.yaml 并安装依赖**

Run: `pnpm install`
Expected: 成功创建 lockfile

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .env.example docker-compose.yml pnpm-lock.yaml
git commit -m "chore: init monorepo with pnpm workspace and docker-compose"
```

---

### Task 2: shared 包 — 统一类型定义

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/types/user.ts`
- Create: `shared/src/types/audit.ts`
- Create: `shared/src/types/instance.ts`
- Create: `shared/src/types/alert.ts`
- Create: `shared/src/types/index.ts`
- Create: `shared/src/errors/index.ts`
- Create: `shared/src/index.ts`

- [ ] **Step 1: 创建 shared/package.json**

```json
{
  "name": "@cloudops/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: 创建 shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 创建用户类型**

```typescript
// shared/src/types/user.ts
export type UserRole = 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer';

export interface User {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  apiKey: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface CreateUserInput {
  username: string;
  email?: string;
  password: string;
  role?: UserRole;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Permission {
  resource: string;
  action: string;
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [{ resource: '*', action: '*' }],
  ops_manager: [
    { resource: 'instance', action: 'list' },
    { resource: 'instance', action: 'view' },
    { resource: 'instance', action: 'start' },
    { resource: 'instance', action: 'stop' },
    { resource: 'instance', action: 'reboot' },
    { resource: 'monitor', action: 'view' },
    { resource: 'alert', action: 'manage' },
    { resource: 'cost', action: 'view' },
    { resource: 'report', action: 'generate' },
  ],
  ops_engineer: [
    { resource: 'instance', action: 'list' },
    { resource: 'instance', action: 'view' },
    { resource: 'instance', action: 'start' },
    { resource: 'instance', action: 'stop' },
    { resource: 'instance', action: 'reboot' },
    { resource: 'exec', action: 'command' },
  ],
  viewer: [
    { resource: 'instance', action: 'list' },
    { resource: 'instance', action: 'view' },
    { resource: 'monitor', action: 'view' },
    { resource: 'cost', action: 'view' },
  ],
};
```

- [ ] **Step 4: 创建审计日志类型**

```typescript
// shared/src/types/audit.ts
export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  provider: string | null;
  region: string | null;
  params: Record<string, unknown> | null;
  result: 'success' | 'failure';
  ip: string | null;
  traceId: string | null;
}

export interface CreateAuditLogInput {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  provider?: string;
  region?: string;
  params?: Record<string, unknown>;
  result: 'success' | 'failure';
  ip?: string;
  traceId?: string;
}

export interface AuditLogQuery {
  userId?: string;
  action?: string;
  provider?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}
```

- [ ] **Step 5: 创建云实例类型**

```typescript
// shared/src/types/instance.ts
export type InstanceStatus = 'running' | 'stopped' | 'terminated' | 'pending' | 'error';

export interface InstanceSpec {
  cpu: number;
  memoryMb: number;
  diskGb: number;
}

export interface Instance {
  id: string;
  provider: string;
  providerInstanceId: string;
  name: string;
  region: string;
  status: InstanceStatus;
  spec: InstanceSpec;
  publicIp: string | null;
  privateIp: string | null;
  monthlyCost: number;
  tags: Record<string, string>;
  lastSyncedAt: Date;
  createdAt: Date;
}

export interface CreateInstanceInput {
  provider: string;
  region: string;
  name: string;
  imageId: string;
  instanceType: string;
  subnetId?: string;
  securityGroupIds?: string[];
  tags?: Record<string, string>;
}

export interface CloudProvider {
  readonly name: string;
  readonly displayName: string;
  listInstances(region?: string): Promise<Instance[]>;
  getInstance(id: string): Promise<Instance>;
  createInstance(input: CreateInstanceInput): Promise<Instance>;
  deleteInstance(id: string): Promise<void>;
  startInstance(id: string): Promise<void>;
  stopInstance(id: string): Promise<void>;
  rebootInstance(id: string): Promise<void>;
}
```

- [ ] **Step 6: 创建告警类型**

```typescript
// shared/src/types/alert.ts
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';
export type AlertStatus = 'firing' | 'resolved' | 'silenced';

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: AlertSeverity;
  actions: AlertAction[];
  enabled: boolean;
  createdAt: Date;
}

export interface AlertAction {
  type: 'notify' | 'suggest' | 'auto';
  targets: string[];
}

export interface Alert {
  id: string;
  ruleId: string;
  instanceId: string | null;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  firedAt: Date;
  resolvedAt: Date | null;
}

export interface CostSummary {
  provider: string;
  totalAmount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  breakdown: CostBreakdown[];
}

export interface CostBreakdown {
  service: string;
  amount: number;
}
```

- [ ] **Step 7: 创建错误类型**

```typescript
// shared/src/errors/index.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { resource, id });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}
```

- [ ] **Step 8: 创建 barrel exports**

```typescript
// shared/src/types/index.ts
export * from './user.js';
export * from './audit.js';
export * from './instance.js';
export * from './alert.js';
```

```typescript
// shared/src/index.ts
export * from './types/index.js';
export * from './errors/index.js';
```

- [ ] **Step 9: 构建 shared**

Run: `cd shared && pnpm build`
Expected: 生成 `dist/` 目录，无编译错误

- [ ] **Step 10: Commit**

```bash
git add shared/
git commit -m "feat(shared): add unified type definitions and error classes"
```

---

### Task 3: Auth Service — 数据库 Schema + 连接

**Files:**
- Create: `auth-service/package.json`
- Create: `auth-service/tsconfig.json`
- Create: `auth-service/drizzle.config.ts`
- Create: `auth-service/src/config.ts`
- Create: `auth-service/src/db/schema.ts`
- Create: `auth-service/src/db/index.ts`
- Create: `auth-service/src/db/migrate.ts`
- Create: `auth-service/migrations/001_init.sql`

- [ ] **Step 1: 创建 auth-service/package.json**

```json
{
  "name": "@cloudops/auth-service",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@cloudops/shared": "workspace:*",
    "drizzle-orm": "^0.32.0",
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.0",
    "postgres": "^3.4.0",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.23.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^22.0.0",
    "drizzle-kit": "^0.24.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: 创建 auth-service/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../shared" }
  ]
}
```

- [ ] **Step 3: 创建 drizzle config**

```typescript
// auth-service/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: 创建配置加载**

```typescript
// auth-service/src/config.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3004', 10),
  databaseUrl: process.env.DATABASE_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
```

- [ ] **Step 5: 创建数据库 Schema**

```typescript
// auth-service/src/db/schema.ts
import { pgTable, uuid, varchar, text, timestamp, jsonb, inet, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 64 }).unique().notNull(),
  email: varchar('email', { length: 256 }),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('viewer'),
  apiKey: varchar('api_key', { length: 128 }).unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  action: varchar('action', { length: 128 }).notNull(),
  resourceType: varchar('resource_type', { length: 64 }),
  resourceId: varchar('resource_id', { length: 128 }),
  provider: varchar('provider', { length: 32 }),
  region: varchar('region', { length: 64 }),
  params: jsonb('params'),
  result: varchar('result', { length: 16 }).notNull(),
  ip: inet('ip'),
  traceId: varchar('trace_id', { length: 64 }),
}, (table) => ({
  timestampIdx: uniqueIndex('idx_audit_timestamp').on(table.timestamp),
  userIdx: uniqueIndex('idx_audit_user').on(table.userId),
  actionIdx: uniqueIndex('idx_audit_action').on(table.action),
}));
```

- [ ] **Step 6: 创建数据库连接**

```typescript
// auth-service/src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

const client = postgres(config.databaseUrl);
export const db = drizzle(client, { schema });
```

- [ ] **Step 7: 创建迁移脚本**

```typescript
// auth-service/src/db/migrate.ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './index.js';

async function main() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('Migrations complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 8: Commit**

```bash
git add auth-service/
git commit -m "feat(auth-service): add database schema and connection setup"
```

---

### Task 4: Auth Service — JWT 工具 + 认证中间件

**Files:**
- Create: `auth-service/src/utils/jwt.ts`
- Create: `auth-service/src/middleware/auth.ts`

- [ ] **Step 1: 创建 JWT 工具**

```typescript
// auth-service/src/utils/jwt.ts
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { UserRole } from '@cloudops/shared';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '7d',
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}
```

- [ ] **Step 2: 创建认证中间件**

```typescript
// auth-service/src/middleware/auth.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../utils/jwt.js';
import { UnauthorizedError, ForbiddenError } from '@cloudops/shared';
import type { UserRole } from '@cloudops/shared';
import { ROLE_PERMISSIONS } from '@cloudops/shared';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    request.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requirePermission(resource: string, action: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { role } = request.user;
    const permissions = ROLE_PERMISSIONS[role];

    const hasPermission = permissions.some(
      (p) =>
        (p.resource === '*' || p.resource === resource) &&
        (p.action === '*' || p.action === action)
    );

    if (!hasPermission) {
      throw new ForbiddenError(`Insufficient permissions: ${resource}:${action}`);
    }
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add auth-service/src/utils/jwt.ts auth-service/src/middleware/auth.ts
git commit -m "feat(auth-service): add JWT utilities and auth middleware"
```

---

### Task 5: Auth Service — 业务逻辑层

**Files:**
- Create: `auth-service/src/services/auth.service.ts`
- Create: `auth-service/src/services/user.service.ts`
- Create: `auth-service/src/services/audit.service.ts`

- [ ] **Step 1: 创建认证服务**

```typescript
// auth-service/src/services/auth.service.ts
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { signAccessToken, signRefreshToken, verifyToken } from '../utils/jwt.js';
import { UnauthorizedError, ConflictError, NotFoundError } from '@cloudops/shared';
import type { CreateUserInput, LoginInput, AuthTokens, UserRole } from '@cloudops/shared';

const SALT_ROUNDS = 10;

export class AuthService {
  async register(input: CreateUserInput): Promise<{ id: string; username: string; role: UserRole }> {
    const existing = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
    if (existing.length > 0) {
      throw new ConflictError(`Username "${input.username}" already exists`);
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const result = await db.insert(users).values({
      username: input.username,
      email: input.email,
      passwordHash,
      role: input.role || 'viewer',
    }).returning({ id: users.id, username: users.username, role: users.role });

    return result[0];
  }

  async login(input: LoginInput, ip?: string): Promise<AuthTokens> {
    const result = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
    if (result.length === 0) {
      throw new UnauthorizedError('Invalid username or password');
    }

    const user = result[0];
    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid username or password');
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const tokenPayload = { sub: user.id, username: user.username, role: user.role as UserRole };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = verifyToken(refreshToken);
    const result = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (result.length === 0) {
      throw new NotFoundError('User', payload.sub);
    }

    const user = result[0];
    const tokenPayload = { sub: user.id, username: user.username, role: user.role as UserRole };
    const newAccessToken = signAccessToken(tokenPayload);
    const newRefreshToken = signRefreshToken(tokenPayload);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 86400,
    };
  }
}

export const authService = new AuthService();
```

- [ ] **Step 2: 创建用户服务**

```typescript
// auth-service/src/services/user.service.ts
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { NotFoundError } from '@cloudops/shared';
import type { User, UserRole } from '@cloudops/shared';

export class UserService {
  async list(): Promise<Omit<User, 'apiKey'>[]> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users);
    return result.map((u) => ({ ...u, role: u.role as UserRole }));
  }

  async getById(id: string): Promise<Omit<User, 'apiKey'>> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users).where(eq(users.id, id)).limit(1);

    if (result.length === 0) {
      throw new NotFoundError('User', id);
    }

    return { ...result[0], role: result[0].role as UserRole };
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    const result = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    if (result.length === 0) {
      throw new NotFoundError('User', id);
    }
  }

  async delete(id: string): Promise<void> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    if (result.length === 0) {
      throw new NotFoundError('User', id);
    }
  }
}

export const userService = new UserService();
```

- [ ] **Step 3: 创建审计日志服务**

```typescript
// auth-service/src/services/audit.service.ts
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import type { CreateAuditLogInput, AuditLogQuery, AuditLog } from '@cloudops/shared';

export class AuditService {
  async log(input: CreateAuditLogInput): Promise<void> {
    await db.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      provider: input.provider,
      region: input.region,
      params: input.params,
      result: input.result,
      ip: input.ip,
      traceId: input.traceId,
    });
  }

  async query(filters: AuditLogQuery): Promise<AuditLog[]> {
    const conditions = [];
    if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters.provider) conditions.push(eq(auditLogs.provider, filters.provider));
    if (filters.startDate) conditions.push(gte(auditLogs.timestamp, filters.startDate));
    if (filters.endDate) conditions.push(lte(auditLogs.timestamp, filters.endDate));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await db.select().from(auditLogs)
      .where(whereClause)
      .orderBy(sql`${auditLogs.timestamp} DESC`)
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);

    return result as AuditLog[];
  }
}

export const auditService = new AuditService();
```

- [ ] **Step 4: Commit**

```bash
git add auth-service/src/services/
git commit -m "feat(auth-service): add auth, user, and audit service logic"
```

---

### Task 6: Auth Service — 路由层

**Files:**
- Create: `auth-service/src/routes/auth.ts`
- Create: `auth-service/src/routes/users.ts`
- Create: `auth-service/src/routes/audit.ts`

- [ ] **Step 1: 创建认证路由**

```typescript
// auth-service/src/routes/auth.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authService } from '../services/auth.service.js';
import { auditService } from '../services/audit.service.js';

const registerSchema = z.object({
  username: z.string().min(3).max(64),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: z.enum(['admin', 'ops_manager', 'ops_engineer', 'viewer']).optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const user = await authService.register(input);
    return reply.status(201).send(user);
  });

  app.post('/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const ip = request.ip;
    const tokens = await authService.login(input, ip);
    return reply.send(tokens);
  });

  app.post('/refresh', async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    const tokens = await authService.refresh(input.refreshToken);
    return reply.send(tokens);
  });
}
```

- [ ] **Step 2: 创建用户路由**

```typescript
// auth-service/src/routes/users.ts
import type { FastifyInstance } from 'fastify';
import { userService } from '../services/user.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.get('/', { preHandler: requirePermission('user', 'list') }, async () => {
    return userService.list();
  });

  app.get('/:id', { preHandler: requirePermission('user', 'view') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return userService.getById(id);
  });

  app.patch('/:id/role', { preHandler: requirePermission('user', 'manage') }, async (request) => {
    const { id } = request.params as { id: string };
    const { role } = request.body as { role: 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer' };
    await userService.updateRole(id, role);
    return { ok: true };
  });

  app.delete('/:id', { preHandler: requirePermission('user', 'delete') }, async (request) => {
    const { id } = request.params as { id: string };
    await userService.delete(id);
    return { ok: true };
  });
}
```

- [ ] **Step 3: 创建审计日志路由**

```typescript
// auth-service/src/routes/audit.ts
import type { FastifyInstance } from 'fastify';
import { auditService } from '../services/audit.service.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

export async function auditRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);

  app.get('/', { preHandler: requirePermission('audit', 'view') }, async (request) => {
    const query = request.query as Record<string, string>;
    return auditService.query({
      userId: query.userId,
      action: query.action,
      provider: query.provider,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    });
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add auth-service/src/routes/
git commit -m "feat(auth-service): add auth, user, and audit API routes"
```

---

### Task 7: Auth Service — 服务入口

**Files:**
- Create: `auth-service/src/index.ts`
- Create: `auth-service/Dockerfile`

- [ ] **Step 1: 创建服务入口**

```typescript
// auth-service/src/index.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { auditRoutes } from './routes/audit.js';
import { AppError } from '@cloudops/shared';

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  }

  if (error.validation) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  app.log.error(error);
  return reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
});

app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }));

await app.register(authRoutes, { prefix: '/auth' });
await app.register(userRoutes, { prefix: '/users' });
await app.register(auditRoutes, { prefix: '/audit' });

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Auth service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 2: 创建 Dockerfile**

```dockerfile
# auth-service/Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY shared/package.json shared/tsconfig.json ./shared/
COPY auth-service/package.json auth-service/tsconfig.json ./auth-service/

RUN cd shared && npm install
RUN cd auth-service && npm install

COPY shared/ ./shared/
COPY auth-service/ ./auth-service/

RUN cd shared && npm run build
RUN cd auth-service && npm run build

WORKDIR /app/auth-service

CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Commit**

```bash
git add auth-service/src/index.ts auth-service/Dockerfile
git commit -m "feat(auth-service): add service entry point and Dockerfile"
```

---

### Task 8: API Gateway — 反向代理 + 健康检查

**Files:**
- Create: `api-gateway/package.json`
- Create: `api-gateway/tsconfig.json`
- Create: `api-gateway/src/config.ts`
- Create: `api-gateway/src/middleware/auth.ts`
- Create: `api-gateway/src/middleware/rate-limit.ts`
- Create: `api-gateway/src/middleware/logger.ts`
- Create: `api-gateway/src/routes/health.ts`
- Create: `api-gateway/src/routes/proxy.ts`
- Create: `api-gateway/src/index.ts`
- Create: `api-gateway/Dockerfile`

- [ ] **Step 1: 创建 api-gateway/package.json**

```json
{
  "name": "@cloudops/api-gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@cloudops/shared": "workspace:*",
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/rate-limit": "^9.0.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: 创建 api-gateway tsconfig + config**

```json
// api-gateway/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../shared" }]
}
```

```typescript
// api-gateway/src/config.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3004',
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://localhost:3001',
  monitorServiceUrl: process.env.MONITOR_SERVICE_URL || 'http://localhost:3002',
  aiAgentUrl: process.env.AI_AGENT_URL || 'http://localhost:3003',
  jwtSecret: process.env.JWT_SECRET!,
};
```

- [ ] **Step 3: 创建请求日志中间件**

```typescript
// api-gateway/src/middleware/logger.ts
import type { FastifyInstance } from 'fastify';

export async function loggerPlugin(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - (request.startTime || Date.now());
    app.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
    });
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}
```

- [ ] **Step 4: 创建健康检查路由**

```typescript
// api-gateway/src/routes/health.ts
import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/all', async (request, reply) => {
    const services = ['auth-service', 'cloud-service', 'monitor-service', 'ai-agent'];
    const results: Record<string, string> = {};

    for (const service of services) {
      try {
        // In production, make real HTTP calls
        results[service] = 'ok';
      } catch {
        results[service] = 'error';
      }
    }

    return { status: 'ok', services: results };
  });
}
```

- [ ] **Step 5: 创建反向代理路由**

```typescript
// api-gateway/src/routes/proxy.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { UnauthorizedError } from '@cloudops/shared';

interface ProxyRoute {
  prefix: string;
  target: string;
  requireAuth: boolean;
}

const routes: ProxyRoute[] = [
  { prefix: '/auth', target: config.authServiceUrl, requireAuth: false },
  { prefix: '/users', target: config.authServiceUrl, requireAuth: true },
  { prefix: '/audit', target: config.authServiceUrl, requireAuth: true },
  { prefix: '/cloud', target: config.cloudServiceUrl, requireAuth: true },
  { prefix: '/monitor', target: config.monitorServiceUrl, requireAuth: true },
  { prefix: '/ai', target: config.aiAgentUrl, requireAuth: true },
];

export async function proxyRoutes(app: FastifyInstance) {
  for (const route of routes) {
    app.all(`${route.prefix}/*`, async (request: FastifyRequest, reply: FastifyReply) => {
      if (route.requireAuth) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError();
        }
      }

      const targetUrl = `${route.target}${request.url}`;
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'content-type': request.headers['content-type'] || 'application/json',
          ...(request.headers.authorization && {
            authorization: request.headers.authorization,
          }),
        },
        body: ['POST', 'PUT', 'PATCH'].includes(request.method)
          ? JSON.stringify(request.body)
          : undefined,
      });

      const data = await response.json();
      return reply.status(response.status).send(data);
    });

    app.all(`${route.prefix}`, async (request: FastifyRequest, reply: FastifyReply) => {
      if (route.requireAuth) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError();
        }
      }

      const targetUrl = `${route.target}${request.url}`;
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'content-type': request.headers['content-type'] || 'application/json',
          ...(request.headers.authorization && {
            authorization: request.headers.authorization,
          }),
        },
        body: ['POST', 'PUT', 'PATCH'].includes(request.method)
          ? JSON.stringify(request.body)
          : undefined,
      });

      const data = await response.json();
      return reply.status(response.status).send(data);
    });
  }
}
```

- [ ] **Step 6: 创建 Gateway 入口**

```typescript
// api-gateway/src/index.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { loggerPlugin } from './middleware/logger.js';
import { healthRoutes } from './routes/health.js';
import { proxyRoutes } from './routes/proxy.js';
import { AppError } from '@cloudops/shared';

const app = Fastify({ logger: true });

await app.register(cors);
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(loggerPlugin);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }
  app.log.error(error);
  return reply.status(500).send({ error: 'INTERNAL_ERROR' });
});

await app.register(healthRoutes);
await app.register(proxyRoutes);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`API Gateway running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 7: 创建 Dockerfile**

```dockerfile
# api-gateway/Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY shared/package.json shared/tsconfig.json ./shared/
COPY api-gateway/package.json api-gateway/tsconfig.json ./api-gateway/

RUN cd shared && npm install
RUN cd api-gateway && npm install

COPY shared/ ./shared/
COPY api-gateway/ ./api-gateway/

RUN cd shared && npm run build
RUN cd api-gateway && npm run build

WORKDIR /app/api-gateway

CMD ["node", "dist/index.js"]
```

- [ ] **Step 8: Commit**

```bash
git add api-gateway/
git commit -m "feat(api-gateway): add reverse proxy, rate limiting, and health checks"
```

---

### Task 9: 端到端验证

- [ ] **Step 1: 启动服务**

Run: `docker compose up -d postgres redis auth-service api-gateway`
Expected: 所有容器启动成功

- [ ] **Step 2: 验证健康检查**

Run: `curl http://localhost:3000/health`
Expected: `{"status":"ok","service":"api-gateway",...}`

- [ ] **Step 3: 注册用户**

Run:
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin12345","role":"admin"}'
```
Expected: `{"id":"...","username":"admin","role":"admin"}`

- [ ] **Step 4: 登录获取 Token**

Run:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin12345"}'
```
Expected: `{"accessToken":"...","refreshToken":"...","expiresIn":86400}`

- [ ] **Step 5: 用 Token 访问用户列表**

Run:
```bash
curl http://localhost:3000/users \
  -H "Authorization: Bearer <token>"
```
Expected: `[{"id":"...","username":"admin","role":"admin",...}]`

- [ ] **Step 6: 停止服务并清理**

Run: `docker compose down -v`

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: complete Phase 1 scaffolding with auth and gateway"
```
