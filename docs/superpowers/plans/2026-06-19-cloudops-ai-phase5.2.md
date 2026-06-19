# CloudOps AI Phase 5.2 — React 前端主壳 + 认证 + 布局 + 路由

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 web-console React 前端主壳，包含项目初始化、API 客户端层（JWT 拦截 + 401 自动刷新）、Zustand 认证状态、登录页、主布局（侧边栏 + 顶栏）、路由配置（受保护路由 + 权限控制 + 占位页面）、Docker 部署。

**Architecture:** React 18 + TypeScript + Vite，shadcn/ui 风格组件（Radix UI + Tailwind），Zustand 全局状态，TanStack React Query 服务端状态，react-router-dom v6 路由。开发环境 Vite 代理，生产环境 nginx 反代（静态文件 + API 代理 + WS 代理）。

**Tech Stack:** React 18 / TypeScript / Vite 5 / Tailwind CSS 3 / Radix UI / Zustand / TanStack React Query / react-router-dom v6 / lucide-react（图标）/ Node 22

**Spec:** `docs/superpowers/specs/2026-06-19-cloudops-ai-phase5-design.md`

**后端对接要点（来自 API 调研）：**
- HTTP 统一入口：`http://localhost:3000`，前缀转发 `/auth` `/users` `/audit` `/cloud` `/monitor` `/agent`
- 登录：`POST /auth/login` → `{ accessToken, refreshToken, expiresIn }`
- 刷新：`POST /auth/refresh` → `{ accessToken, refreshToken, expiresIn }`
- JWT payload：`{ sub, username, role, iat, exp }`，role ∈ `admin | ops_manager | ops_engineer | viewer`
- WebSocket 直连：`ws://localhost:3005/ws?token=<accessToken>`（ai-gateway，不经 gateway 代理）
- 权限：admin 通配 `*`；ops_manager（instance/monitor/alert/cost/report）；ops_engineer（instance/exec）；viewer（instance:list/view, monitor:view, cost:view）

---

## 文件结构总览

```
newcloud/
├── web-console/                     # 【新增】Phase 5.2 - React 前端主壳
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── components.json              # shadcn/ui 配置（参考用）
│   ├── src/
│   │   ├── main.tsx                 # React 入口
│   │   ├── App.tsx                  # 路由 + Provider
│   │   ├── index.css                # Tailwind 全局样式
│   │   ├── lib/
│   │   │   └── utils.ts             # cn() 工具函数
│   │   ├── api/
│   │   │   ├── client.ts            # fetch 封装 + JWT 拦截 + 401 自动刷新
│   │   │   └── auth.ts              # /auth/* 接口
│   │   ├── stores/
│   │   │   └── auth.ts              # Zustand 认证状态
│   │   ├── components/
│   │   │   ├── ui/                  # 基础 UI 组件
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   └── label.tsx
│   │   │   ├── Layout.tsx           # 主布局
│   │   │   ├── Sidebar.tsx          # 侧边栏导航
│   │   │   ├── Topbar.tsx           # 顶栏
│   │   │   └── ProtectedRoute.tsx   # 受保护路由
│   │   ├── pages/
│   │   │   ├── Login.tsx            # 登录页
│   │   │   ├── Dashboard.tsx        # 总览（占位）
│   │   │   ├── Instances.tsx        # 云资源（占位）
│   │   │   ├── Monitor.tsx          # 监控告警（占位）
│   │   │   ├── Costs.tsx            # 成本分析（占位）
│   │   │   ├── ChatLit.tsx          # AI 对话 Lit（占位）
│   │   │   ├── ChatReact.tsx        # AI 对话 React（占位）
│   │   │   ├── Users.tsx            # 用户管理（占位）
│   │   │   ├── Audit.tsx            # 审计日志（占位）
│   │   │   └── NotFound.tsx         # 404
│   │   └── types/
│   │       └── auth.ts              # 认证相关类型
│   └── .dockerignore
│
├── pnpm-workspace.yaml              # 添加 web-console
└── docker-compose.yml               # 添加 web-console 服务
```

---

## Task 1: 项目初始化 + 依赖安装

**Files:**
- `web-console/package.json`
- `web-console/tsconfig.json`
- `web-console/tsconfig.node.json`
- `web-console/vite.config.ts`
- `web-console/index.html`
- `pnpm-workspace.yaml`（修改）

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@cloudops/web-console",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "zustand": "^4.5.5",
    "@tanstack/react-query": "^5.59.0",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.2",
    "lucide-react": "^0.446.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.10",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "tailwindcss": "^3.4.13",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: 创建 vite.config.ts**

开发环境代理：`/auth` `/users` `/audit` `/cloud` `/monitor` `/agent` → `http://localhost:3000`；`/ws` → `ws://localhost:3005`。

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/auth': { target: 'http://localhost:3000', changeOrigin: true },
      '/users': { target: 'http://localhost:3000', changeOrigin: true },
      '/audit': { target: 'http://localhost:3000', changeOrigin: true },
      '/cloud': { target: 'http://localhost:3000', changeOrigin: true },
      '/monitor': { target: 'http://localhost:3000', changeOrigin: true },
      '/agent': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': {
        target: 'ws://localhost:3005',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 5: 创建 index.html**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CloudOps AI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: 添加 web-console 到 pnpm-workspace.yaml**

在 `packages` 列表中添加 `- 'web-console'`。

- [ ] **Step 7: 安装依赖**

Run: `cd web-console && pnpm install`

---

## Task 2: Tailwind CSS + 全局样式 + 工具函数

**Files:**
- `web-console/tailwind.config.js`
- `web-console/postcss.config.js`
- `web-console/src/index.css`
- `web-console/src/lib/utils.ts`

- [ ] **Step 1: 创建 tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: 创建 postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: 创建 src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 4: 创建 src/lib/utils.ts**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## Task 3: 基础 UI 组件（shadcn/ui 风格）

**Files:**
- `web-console/src/components/ui/button.tsx`
- `web-console/src/components/ui/input.tsx`
- `web-console/src/components/ui/card.tsx`
- `web-console/src/components/ui/label.tsx`

- [ ] **Step 1: 创建 button.tsx**

```typescript
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

- [ ] **Step 2: 创建 input.tsx**

```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
```

- [ ] **Step 3: 创建 card.tsx**

```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
```

- [ ] **Step 4: 创建 label.tsx**

```typescript
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
```

---

## Task 4: 认证类型 + API 客户端层

**Files:**
- `web-console/src/types/auth.ts`
- `web-console/src/api/client.ts`
- `web-console/src/api/auth.ts`

- [ ] **Step 1: 创建 src/types/auth.ts**

```typescript
export type UserRole = 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/** 角色权限定义（与后端 shared/src/types/user.ts 对齐） */
export const ROLE_PERMISSIONS: Record<UserRole, Array<{ resource: string; action: string }>> = {
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

/** 检查角色是否拥有指定权限 */
export function hasPermission(role: UserRole, resource: string, action: string): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.some(
    (p) =>
      (p.resource === '*' || p.resource === resource) &&
      (p.action === '*' || p.action === action)
  );
}

/** 解析 JWT payload（不验证签名，仅前端用） */
export function parseJwt(token: string): JwtPayload {
  const payload = token.split('.')[1];
  const decoded = Buffer.from(payload, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}
```

注意：浏览器环境没有 Node Buffer，改用 atob。修正 `parseJwt`：

```typescript
export function parseJwt(token: string): JwtPayload {
  const payload = token.split('.')[1];
  const decoded = atob(payload);
  return JSON.parse(decoded);
}
```

- [ ] **Step 2: 创建 src/api/client.ts**

fetch 封装 + JWT 拦截 + 401 自动刷新（并发请求只触发一次 refresh）。

```typescript
import { useAuthStore } from '@/stores/auth';

const API_BASE = '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    return false;
  }
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        logout();
        return false;
      }
      const tokens = await res.json();
      setTokens(tokens);
      return true;
    } catch {
      logout();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** 跳过 JWT 拦截（用于 login/refresh 本身） */
  skipAuth?: boolean;
  /** 已重试过，避免无限循环 */
  _retried?: boolean;
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, skipAuth = false, _retried = false } = options;
  const { accessToken } = useAuthStore.getState();

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (!skipAuth && accessToken) {
    finalHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 自动刷新重试
  if (res.status === 401 && !skipAuth && !_retried) {
    const ok = await tryRefreshToken();
    if (ok) {
      return request<T>(path, { ...options, _retried: true });
    }
    throw new ApiError(401, 'UNAUTHORIZED', '认证已过期，请重新登录');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const code = data?.error || 'INTERNAL_ERROR';
    const message = data?.message || `请求失败 (${res.status})`;
    throw new ApiError(res.status, code, message, data?.details);
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};
```

- [ ] **Step 3: 创建 src/api/auth.ts**

```typescript
import { api } from './client';
import type { AuthTokens } from '@/types/auth';

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  password: string;
  email?: string;
  role?: 'admin' | 'ops_manager' | 'ops_engineer' | 'viewer';
}

export const authApi = {
  login: (params: LoginParams) =>
    api.post<AuthTokens>('/auth/login', params, { skipAuth: true }),

  refresh: (refreshToken: string) =>
    api.post<AuthTokens>('/auth/refresh', { refreshToken }, { skipAuth: true }),

  register: (params: RegisterParams) =>
    api.post<{ id: string; username: string; role: string }>('/auth/register', params, {
      skipAuth: true,
    }),
};
```

---

## Task 5: Zustand 认证状态管理

**Files:**
- `web-console/src/stores/auth.ts`

- [ ] **Step 1: 创建 src/stores/auth.ts**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokens, AuthUser, JwtPayload, UserRole } from '@/types/auth';
import { parseJwt } from '@/types/auth';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;

  setTokens: (tokens: AuthTokens) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

function extractUser(accessToken: string): AuthUser | null {
  try {
    const payload: JwtPayload = parseJwt(accessToken);
    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setTokens: (tokens: AuthTokens) => {
        const user = extractUser(tokens.accessToken);
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        });
      },

      updateUser: (partial: Partial<AuthUser>) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, ...partial } });
        }
      },
    }),
    {
      name: 'cloudops-auth',
      // 只持久化 token，user 从 token 解析
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
```

---

## Task 6: 登录页

**Files:**
- `web-console/src/pages/Login.tsx`

- [ ] **Step 1: 创建 src/pages/Login.tsx**

```typescript
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { ApiError } from '@/api/client';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setTokens = useAuthStore((s) => s.setTokens);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string })?.from || '/dashboard';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const tokens = await authApi.login({ username, password });
      setTokens(tokens);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('登录失败，请检查网络连接');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">CloudOps AI</CardTitle>
          <p className="text-sm text-muted-foreground text-center">多云管理控制台登录</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登录中...' : '登录'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              默认账号：admin / admin12345
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Task 7: 主布局（侧边栏 + 顶栏）

**Files:**
- `web-console/src/components/Sidebar.tsx`
- `web-console/src/components/Topbar.tsx`
- `web-console/src/components/Layout.tsx`

- [ ] **Step 1: 创建 src/components/Sidebar.tsx**

基于角色权限显示导航菜单。

```typescript
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Activity,
  DollarSign,
  MessageSquare,
  Users,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { hasPermission } from '@/types/auth';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** 需要的权限（resource, action），不设则所有角色可见 */
  permission?: { resource: string; action: string };
  /** 子项（AI 对话有两个版本） */
  children?: Array<{ label: string; to: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: '总览', to: '/dashboard', icon: LayoutDashboard },
  {
    label: '云资源',
    to: '/instances',
    icon: Server,
    permission: { resource: 'instance', action: 'list' },
  },
  {
    label: '监控告警',
    to: '/monitor',
    icon: Activity,
    permission: { resource: 'monitor', action: 'view' },
  },
  {
    label: '成本分析',
    to: '/costs',
    icon: DollarSign,
    permission: { resource: 'cost', action: 'view' },
  },
  {
    label: 'AI 对话',
    to: '/chat/react',
    icon: MessageSquare,
    children: [
      { label: 'React 版', to: '/chat/react' },
      { label: 'Lit 版', to: '/chat/lit' },
    ],
  },
  {
    label: '用户管理',
    to: '/users',
    icon: Users,
    permission: { resource: 'user', action: 'list' },
  },
  {
    label: '审计日志',
    to: '/audit',
    icon: ScrollText,
    permission: { resource: 'audit', action: 'view' },
  },
];

export function Sidebar() {
  const user = useAuthStore((s) => s.user);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    if (!user) return false;
    return hasPermission(user.role, item.permission.resource, item.permission.action);
  });

  return (
    <aside className="w-60 border-r bg-card flex flex-col">
      <div className="h-14 flex items-center px-6 border-b">
        <span className="font-bold text-lg">CloudOps AI</span>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <div key={item.to}>
            <NavLink
              to={item.children ? item.children[0].to : item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
            {item.children && (
              <div className="ml-6 mt-1 space-y-1">
                {item.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                        isActive
                          ? 'bg-secondary text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )
                    }
                  >
                    {child.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: 创建 src/components/Topbar.tsx**

```typescript
import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  ops_manager: '运维经理',
  ops_engineer: '运维工程师',
  viewer: '查看者',
};

export function Topbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-6">
      <div className="text-sm text-muted-foreground">多云管理控制台</div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{user?.username}</span>
          {user && (
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              {ROLE_LABELS[user.role] || user.role}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="退出登录">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: 创建 src/components/Layout.tsx**

```typescript
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

---

## Task 8: 受保护路由 + 占位页面

**Files:**
- `web-console/src/components/ProtectedRoute.tsx`
- `web-console/src/pages/Dashboard.tsx`
- `web-console/src/pages/Instances.tsx`
- `web-console/src/pages/Monitor.tsx`
- `web-console/src/pages/Costs.tsx`
- `web-console/src/pages/ChatLit.tsx`
- `web-console/src/pages/ChatReact.tsx`
- `web-console/src/pages/Users.tsx`
- `web-console/src/pages/Audit.tsx`
- `web-console/src/pages/NotFound.tsx`

- [ ] **Step 1: 创建 src/components/ProtectedRoute.tsx**

```typescript
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { hasPermission } from '@/types/auth';
import type { UserRole } from '@/types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** 需要的权限 */
  permission?: { resource: string; action: string };
}

export function ProtectedRoute({ children, permission }: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (permission && !hasPermission(user.role as UserRole, permission.resource, permission.action)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-muted-foreground">权限不足</h2>
          <p className="text-sm text-muted-foreground mt-2">您没有访问此页面的权限</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: 创建占位页面（统一模板）**

创建一个通用的占位页面组件，然后各页面引用。为减少文件数，直接在每个页面文件内写简洁占位。

`src/pages/Dashboard.tsx`:
```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">总览</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">总实例数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">运行中</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">告警数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">本月费用</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            Dashboard 内容将在 Phase 5.6 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/pages/Instances.tsx`:
```typescript
import { Card, CardContent } from '@/components/ui/card';

export default function Instances() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">云资源管理</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            云资源管理页将在 Phase 5.3 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/pages/Monitor.tsx`:
```typescript
import { Card, CardContent } from '@/components/ui/card';

export default function Monitor() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">监控告警</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            监控告警页将在 Phase 5.3 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/pages/Costs.tsx`:
```typescript
import { Card, CardContent } from '@/components/ui/card';

export default function Costs() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">成本分析</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            成本分析页将在 Phase 5.3 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/pages/ChatReact.tsx`:
```typescript
import { Card, CardContent } from '@/components/ui/card';

export default function ChatReact() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI 对话（React 版）</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            AI 对话 React 版将在 Phase 5.4 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/pages/ChatLit.tsx`:
```typescript
import { Card, CardContent } from '@/components/ui/card';

export default function ChatLit() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">AI 对话（Lit 版）</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            AI 对话 Lit 版将在 Phase 5.5 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/pages/Users.tsx`:
```typescript
import { Card, CardContent } from '@/components/ui/card';

export default function Users() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">用户管理</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            用户管理页将在 Phase 5.6 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/pages/Audit.tsx`:
```typescript
import { Card, CardContent } from '@/components/ui/card';

export default function Audit() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">审计日志</h1>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            审计日志页将在 Phase 5.6 实现
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/pages/NotFound.tsx`:
```typescript
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <p className="text-lg text-muted-foreground">页面不存在</p>
        <Button asChild>
          <Link to="/dashboard">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}
```

---

## Task 9: 路由配置 + 入口文件

**Files:**
- `web-console/src/App.tsx`
- `web-console/src/main.tsx`

- [ ] **Step 1: 创建 src/App.tsx**

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Instances from '@/pages/Instances';
import Monitor from '@/pages/Monitor';
import Costs from '@/pages/Costs';
import ChatReact from '@/pages/ChatReact';
import ChatLit from '@/pages/ChatLit';
import Users from '@/pages/Users';
import Audit from '@/pages/Audit';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* 受保护路由，统一使用 Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/instances"
              element={
                <ProtectedRoute permission={{ resource: 'instance', action: 'list' }}>
                  <Instances />
                </ProtectedRoute>
              }
            />
            <Route
              path="/monitor"
              element={
                <ProtectedRoute permission={{ resource: 'monitor', action: 'view' }}>
                  <Monitor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/costs"
              element={
                <ProtectedRoute permission={{ resource: 'cost', action: 'view' }}>
                  <Costs />
                </ProtectedRoute>
              }
            />
            <Route path="/chat/react" element={<ChatReact />} />
            <Route path="/chat/lit" element={<ChatLit />} />
            <Route
              path="/users"
              element={
                <ProtectedRoute permission={{ resource: 'user', action: 'list' }}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit"
              element={
                <ProtectedRoute permission={{ resource: 'audit', action: 'view' }}>
                  <Audit />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: 创建 src/main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## Task 10: Dockerfile + nginx + docker-compose 集成

**Files:**
- `web-console/Dockerfile`
- `web-console/nginx.conf`
- `web-console/.dockerignore`
- `docker-compose.yml`（修改）

- [ ] **Step 1: 创建 Dockerfile**

多阶段构建：node 构建静态文件 → nginx 提供服务。

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web-console ./web-console
COPY shared ./shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cloudops/web-console build

FROM nginx:alpine
COPY --from=builder /app/web-console/dist /usr/share/nginx/html
COPY web-console/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 2: 创建 nginx.conf**

静态文件 + API 代理到 api-gateway:3000 + WS 代理到 ai-gateway:3005。

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理到 api-gateway
    location /auth/ { proxy_pass http://api-gateway:3000; }
    location /users/ { proxy_pass http://api-gateway:3000; }
    location /audit/ { proxy_pass http://api-gateway:3000; }
    location /cloud/ { proxy_pass http://api-gateway:3000; }
    location /monitor/ { proxy_pass http://api-gateway:3000; }
    location /agent/ { proxy_pass http://api-gateway:3000; }

    # WebSocket 代理到 ai-gateway
    location /ws {
        proxy_pass http://ai-gateway:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

- [ ] **Step 3: 创建 .dockerignore**

```
node_modules
dist
.git
```

- [ ] **Step 4: 修改 docker-compose.yml 添加 web-console 服务**

在 `services:` 下添加：

```yaml
  web-console:
    build:
      context: .
      dockerfile: web-console/Dockerfile
    ports:
      - "3006:80"
    depends_on:
      - api-gateway
      - ai-gateway
    networks:
      - cloudops
    restart: unless-stopped
```

端口映射：宿主机 3006 → 容器 80。

---

## Task 11: 端到端验证

- [ ] **Step 1: 本地开发验证**

Run: `cd web-console && pnpm install && pnpm dev`

Expected: Vite 开发服务器启动在 http://localhost:5173

- [ ] **Step 2: 登录流程验证**

浏览器访问 http://localhost:5173/login，输入 admin / admin12345，应跳转到 /dashboard。

- [ ] **Step 3: 路由跳转验证**

点击侧边栏各菜单，验证路由跳转正常，占位页面显示正确。

- [ ] **Step 4: 权限控制验证**

用 viewer 角色登录，侧边栏应只显示：总览、云资源、监控告警、成本分析、AI 对话。访问 /users 应显示"权限不足"。

- [ ] **Step 5: 登出验证**

点击顶栏登出按钮，应跳转到 /login。

- [ ] **Step 6: TypeScript 编译验证**

Run: `cd web-console && pnpm typecheck`

Expected: 无错误

- [ ] **Step 7: 生产构建验证**

Run: `cd web-console && pnpm build`

Expected: dist/ 目录生成，无错误

- [ ] **Step 8: Docker 部署验证**

Run: `docker compose up -d web-console`

Expected: 容器启动，访问 http://localhost:3006 能正常显示登录页

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Phase 5.2: React 前端主壳 + 认证 + 布局 + 路由"
```

---

## Phase 5.2 完成标准

- [ ] web-console 项目初始化，Vite + React 18 + TypeScript
- [ ] Tailwind CSS + shadcn/ui 风格组件可用
- [ ] API 客户端层：fetch 封装 + JWT 拦截 + 401 自动刷新
- [ ] Zustand 认证状态：token 持久化 + 用户信息解析
- [ ] 登录页：用户名密码登录，跳转到 dashboard
- [ ] 主布局：侧边栏（基于权限）+ 顶栏（用户信息 + 登出）
- [ ] 路由配置：受保护路由 + 权限控制 + 占位页面
- [ ] Docker 部署：nginx 反代 + API/WS 代理
- [ ] 端到端验证通过

---

## 后续子阶段（待细化）

- **Phase 5.3**: 云资源管理页 + 监控告警页 + 成本分析页（填充占位页面）
- **Phase 5.4**: AI 对话页 React 版（WebSocket 客户端 + 流式渲染 + 断线恢复）
- **Phase 5.5**: AI 对话页 OpenClaw Lit 版（fork + 魔改 + 嵌入）
- **Phase 5.6**: 用户管理 + 审计日志 + 总览 Dashboard
- **Phase 5.7**: Docker 部署 + 端到端验证
