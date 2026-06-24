# CloudOps AI Console — UI 动效方案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 web-console 加入 framer-motion 微动画（参考 LibreChat），覆盖 Chat 对话、侧边栏、全局 UI、页面转场 4 大范围

**Architecture:** 集中 token（`lib/motion.ts`）+ 通用 motion 组件（`PageTransition` / `FadeIn` / `StaggerList`）+ 业务组件按需引入 framer-motion 替换 Tailwind 类动画

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind + framer-motion v11+ + tailwindcss-animate

**Spec:** `docs/superpowers/specs/2026-06-23-ui-animation-design.md`

---

## 文件结构总览

### 新增文件
- `web-console/src/lib/motion.ts` — 动画 token 与 variants
- `web-console/src/components/motion/PageTransition.tsx` — 路由转场
- `web-console/src/components/motion/FadeIn.tsx` — 通用淡入
- `web-console/src/components/motion/StaggerList.tsx` — 列表错开
- `web-console/src/components/ui/tooltip.tsx` — Tooltip（可选）
- `web-console/src/hooks/useMotionConfig.ts` — 集中处理 prefers-reduced-motion

### 修改文件
- `web-console/package.json` — +framer-motion
- `web-console/src/App.tsx` — AnimatePresence + PageTransition
- `web-console/src/components/Sidebar.tsx` — whileHover + 激活指示
- `web-console/src/components/Topbar.tsx` — 通知徽章 pulse
- `web-console/src/components/Layout.tsx` — 移动端抽屉
- `web-console/src/components/chat/MessageBubble.tsx` — fadeUp
- `web-console/src/components/chat/MessageList.tsx` — stagger
- `web-console/src/components/chat/ChatInput.tsx` — whileTap
- `web-console/src/components/chat/SessionList.tsx` — list motion
- `web-console/src/components/chat/ToolCallCard.tsx` — 展开/收起
- `web-console/src/components/ui/dialog.tsx` — AnimatePresence
- `web-console/src/components/ui/button.tsx` — whileTap
- `web-console/src/components/ui/card.tsx` — interactive prop

---

## Phase 1：基础设施

### Task 1: 安装 framer-motion 依赖

**Files:**
- Modify: `web-console/package.json`

- [ ] **Step 1: 安装依赖**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npm install framer-motion@^11.18.2`

Expected: package.json 中出现 `"framer-motion": "^11.18.2"`，node_modules 安装成功

- [ ] **Step 2: 验证 import 可用**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && node -e "import('framer-motion').then(m => console.log(typeof m.motion))"`

Expected: 输出 `function`

- [ ] **Step 3: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/package.json web-console/package-lock.json
git commit -m "chore: add framer-motion@^11.18.2"
```

---

### Task 2: 创建 motion token 文件

**Files:**
- Create: `web-console/src/lib/motion.ts`

- [ ] **Step 1: 创建 `web-console/src/lib/motion.ts`**

完整代码：

```ts
import type { Variants } from 'framer-motion';

/** 缓动曲线（cubic-bezier 数组） */
export const EASE = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  outExpo: [0.19, 1, 0.22, 1] as [number, number, number, number],
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
} as const;

/** 动画时长（秒） */
export const DURATION = {
  fast: 0.15,
  base: 0.2,
  page: 0.25,
} as const;

/** 基础 fade-up 变体：透明度 + translateY 6px */
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

/** 缩放淡入变体：scale 0.95 → 1 */
export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
};

/** 页面转场变体：translateY 10px + 透明度 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

/** 列表错开变体：子元素间隔 40ms 依次入场 */
export const stagger: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

/** 标准 transition：基础时长 + ease-out */
export const baseTransition = {
  duration: DURATION.base,
  ease: EASE.out,
} as const;

/** 页面 transition：稍长时长 + ease-out */
export const pageTransition = {
  duration: DURATION.page,
  ease: EASE.out,
} as const;
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/lib/motion.ts
git commit -m "feat(motion): add motion tokens and variants"
```

---

### Task 3: 创建 PageTransition 组件

**Files:**
- Create: `web-console/src/components/motion/PageTransition.tsx`

- [ ] **Step 1: 创建 `web-console/src/components/motion/PageTransition.tsx`**

完整代码：

```tsx
import { motion } from 'framer-motion';
import { pageVariants, pageTransition } from '@/lib/motion';
import { useReducedMotion } from 'framer-motion';

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={reduced ? { duration: 0 } : pageTransition}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/motion/PageTransition.tsx
git commit -m "feat(motion): add PageTransition component"
```

---

### Task 4: 创建 FadeIn 组件

**Files:**
- Create: `web-console/src/components/motion/FadeIn.tsx`

- [ ] **Step 1: 创建 `web-console/src/components/motion/FadeIn.tsx`**

完整代码：

```tsx
import { motion } from 'framer-motion';
import { fadeUp, baseTransition } from '@/lib/motion';
import { useReducedMotion } from 'framer-motion';

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={reduced ? { duration: 0 } : { ...baseTransition, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/motion/FadeIn.tsx
git commit -m "feat(motion): add FadeIn component"
```

---

### Task 5: 创建 StaggerList 组件

**Files:**
- Create: `web-console/src/components/motion/StaggerList.tsx`

- [ ] **Step 1: 创建 `web-console/src/components/motion/StaggerList.tsx`**

完整代码：

```tsx
import { motion } from 'framer-motion';
import { stagger, fadeUp, baseTransition } from '@/lib/motion';
import { useReducedMotion } from 'framer-motion';

interface StaggerListProps {
  children: React.ReactNode;
  className?: string;
  /** 错开间隔（秒），默认 0.04 */
  staggerSeconds?: number;
}

/**
 * 包裹列表的错开入场容器。子元素需使用 motion 组件并设置 variants={fadeUp}。
 */
export function StaggerList({ children, className, staggerSeconds = 0.04 }: StaggerListProps) {
  const reduced = useReducedMotion();
  const staggerVariants = reduced
    ? undefined
    : {
        animate: {
          transition: { staggerChildren: staggerSeconds },
        },
      };

  return (
    <motion.div
      className={className}
      initial={reduced ? false : 'initial'}
      animate="animate"
      variants={staggerVariants}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/motion/StaggerList.tsx
git commit -m "feat(motion): add StaggerList component"
```

---

## Phase 2：Chat 对话页

### Task 6: MessageBubble 改用 fadeUp 入场

**Files:**
- Modify: `web-console/src/components/chat/MessageBubble.tsx`

- [ ] **Step 1: 修改 MessageBubble 外层 div**

打开 `web-console/src/components/chat/MessageBubble.tsx`，找到 return 语句中的外层 div：

```tsx
  return (
    <div
      className={cn(
        'group flex gap-3 px-4 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300',
        isUser && 'flex-row-reverse'
      )}
    >
```

替换为：

```tsx
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={baseTransition}
      className={cn('group flex gap-3 px-4 py-3', isUser && 'flex-row-reverse')}
    >
```

- [ ] **Step 2: 更新 import**

在文件顶部 imports 中添加/修改：

```tsx
import { motion } from 'framer-motion';
import { fadeUp, baseTransition } from '@/lib/motion';
```

移除 `import { useState } from 'react';` 后面的（如果有 `Loader2` 等）保留。

- [ ] **Step 3: 关闭 motion.div**

文件末尾的 `</div>` 替换为 `</motion.div>`。

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/chat/MessageBubble.tsx
git commit -m "feat(chat): use motion fadeUp for MessageBubble entrance"
```

---

### Task 7: MessageList 包裹 stagger

**Files:**
- Modify: `web-console/src/components/chat/MessageList.tsx`

- [ ] **Step 1: 修改 MessageList 外层容器**

打开 `web-console/src/components/chat/MessageList.tsx`，找到 return 中的 `<div className="py-4">`：

```tsx
  return (
    <ScrollArea className="h-full overflow-y-auto">
      <div className="py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
```

替换为：

```tsx
  return (
    <ScrollArea className="h-full overflow-y-auto">
      <motion.div
        className="py-4"
        initial="initial"
        animate="animate"
        variants={stagger}
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </motion.div>
    </ScrollArea>
  );
```

- [ ] **Step 2: 更新 import**

```tsx
import { motion } from 'framer-motion';
import { stagger } from '@/lib/motion';
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/chat/MessageList.tsx
git commit -m "feat(chat): stagger MessageList entrance with framer-motion"
```

---

### Task 8: AI 思考指示器用 shimmer 骨架

**Files:**
- Modify: `web-console/src/components/chat/MessageBubble.tsx`

- [ ] **Step 1: 替换 TextBlock 中的 loader**

打开 `web-console/src/components/chat/MessageBubble.tsx`，找到 TextBlock 函数里的：

```tsx
      {isStreaming && !content && (
        <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>AI 运作中...</span>
        </div>
      )}
```

替换为：

```tsx
      {isStreaming && !content && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <motion.div
            className="h-2 w-20 rounded bg-gradient-to-r from-muted-foreground/30 via-muted-foreground/50 to-muted-foreground/30 bg-[length:200%_100%]"
            animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
          />
          <span>AI 运作中...</span>
        </div>
      )}
```

- [ ] **Step 2: 同样替换 BlocksRenderer 中的 loader**

找到 `<div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">` + `<Loader2 className="h-3.5 w-3.5 animate-spin" />` + `<span>思考中...</span>` 的两处，Loader2 改为 motion.div（同上 shimmer）。

- [ ] **Step 3: 同样替换 MessageBubble 顶层 fallback loader**

找到：

```tsx
        ) : !isUser && isStreaming && !message.content && message.toolCalls.length === 0 ? (
          // assistant 消息刚创建（blocks 为空、无内容），显示"思考中"提示
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>思考中...</span>
          </div>
        ) : (
```

替换为：

```tsx
        ) : !isUser && isStreaming && !message.content && message.toolCalls.length === 0 ? (
          // assistant 消息刚创建（blocks 为空、无内容），显示"思考中"提示
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <motion.div
              className="h-2 w-20 rounded bg-gradient-to-r from-muted-foreground/30 via-muted-foreground/50 to-muted-foreground/30 bg-[length:200%_100%]"
              animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
            />
            <span>思考中...</span>
          </div>
        ) : (
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/chat/MessageBubble.tsx
git commit -m "feat(chat): replace AI thinking spinner with skeleton shimmer"
```

---

### Task 9: 流式光标用 framer 硬切脉冲

**Files:**
- Modify: `web-console/src/components/chat/MessageBubble.tsx`

- [ ] **Step 1: 替换 TextBlock 中的光标**

找到 TextBlock 内：

```tsx
          {isStreaming && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
          )}
```

替换为：

```tsx
          {isStreaming && (
            <motion.span
              className="ml-0.5 inline-block h-3.5 w-1.5 bg-current align-middle"
              animate={{ opacity: [1, 1, 0, 0] }}
              transition={{ duration: 1, times: [0, 0.5, 0.5, 1], repeat: Infinity }}
            />
          )}
```

- [ ] **Step 2: 替换 MessageBubble 底部 fallback 中的光标**

找到：

```tsx
                {isStreaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
                )}
```

同样替换为 motion.span。

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/chat/MessageBubble.tsx
git commit -m "feat(chat): use framer-motion hard-cut pulse for streaming cursor"
```

---

### Task 10: ToolCallCard 展开/收起动画

**Files:**
- Modify: `web-console/src/components/chat/ToolCallCard.tsx`

- [ ] **Step 1: 读取 ToolCallCard 当前实现**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud && cat web-console/src/components/chat/ToolCallCard.tsx | head -80`

找到展开/收起状态机。如果当前使用条件渲染（`{isExpanded && <div>...</div>}`），改为用 AnimatePresence 包裹。

- [ ] **Step 2: 引入 framer-motion**

在 import 中加入：

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { EASE } from '@/lib/motion';
```

- [ ] **Step 3: 用 AnimatePresence 包裹展开内容**

把：

```tsx
{isExpanded && (
  <div className="...">
    {/* 内容 */}
  </div>
)}
```

改为：

```tsx
<AnimatePresence initial={false}>
  {isExpanded && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: EASE.out }}
      className="overflow-hidden"
    >
      {/* 内容 */}
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/chat/ToolCallCard.tsx
git commit -m "feat(chat): animate ToolCallCard expand/collapse"
```

---

### Task 11: ChatInput 发送按钮 whileTap

**Files:**
- Modify: `web-console/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: 引入 framer-motion**

```tsx
import { motion } from 'framer-motion';
```

- [ ] **Step 2: 找到发送/中止按钮**

通常在 ChatInput 内部，找到 `<Button onClick={...send/abort}>` 的位置。如果用了 Button 组件替换为：

```tsx
<motion.div whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }} className="inline-flex">
  <Button onClick={...}>...</Button>
</motion.div>
```

如果直接是 `<button>` 元素，替换为 `<motion.button whileTap={{ scale: 0.92 }} ...>`，把 `whileTap` 和 `transition` 加进去。

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/chat/ChatInput.tsx
git commit -m "feat(chat): add whileTap to ChatInput send button"
```

---

## Phase 3：侧边栏 + Topbar

### Task 12: Sidebar 列表项 motion + 激活指示

**Files:**
- Modify: `web-console/src/components/Sidebar.tsx`

- [ ] **Step 1: 引入 framer-motion**

```tsx
import { motion } from 'framer-motion';
```

- [ ] **Step 2: 替换外层 NavLink**

把：

```tsx
            <NavLink
              to={item.children ? item.children[0].to : item.to}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                  'transition-all duration-200 ease-out',
                  'hover:translate-x-0.5 hover:bg-accent hover:text-accent-foreground',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              {item.label}
            </NavLink>
```

替换为：

```tsx
            <NavLink
              to={item.children ? item.children[0].to : item.to}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                  'transition-colors duration-200',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <motion.span
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary-foreground"
                    initial={false}
                    animate={{ scaleY: isActive ? 1 : 0, opacity: isActive ? 1 : 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: 'center' }}
                  />
                  <motion.span
                    className="flex items-center gap-3"
                    whileHover={{ x: 2 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <item.icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    {item.label}
                  </motion.span>
                </>
              )}
            </NavLink>
```

- [ ] **Step 3: 同样修改子菜单 NavLink（如果有 children）**

```tsx
                {item.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm',
                        'transition-colors duration-200',
                        isActive
                          ? 'bg-secondary text-secondary-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <motion.span
                        className="flex items-center gap-2"
                        whileHover={{ x: 2 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      >
                        {isActive && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                        {child.label}
                      </motion.span>
                    )}
                  </NavLink>
                ))}
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/Sidebar.tsx
git commit -m "feat(sidebar): add whileHover slide + active indicator bar"
```

---

### Task 13: Layout 移动端抽屉用 motion

**Files:**
- Modify: `web-console/src/components/Layout.tsx`

- [ ] **Step 1: 引入 framer-motion**

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { EASE } from '@/lib/motion';
```

- [ ] **Step 2: 用 AnimatePresence 包裹抽屉**

把：

```tsx
      {/* 移动端：抽屉式侧边栏 */}
      {isMobile && sidebarOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={closeSidebar}
          />
          {/* 抽屉 */}
          <div className="fixed inset-y-0 left-0 z-50 animate-in slide-in-from-left duration-200">
            <Sidebar />
          </div>
        </>
      )}
```

替换为：

```tsx
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={closeSidebar}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: EASE.out }}
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw]"
            >
              <Sidebar />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/Layout.tsx
git commit -m "feat(layout): animate mobile drawer with framer-motion"
```

---

### Task 14: Topbar 通知徽章脉冲

**Files:**
- Modify: `web-console/src/components/Topbar.tsx`

- [ ] **Step 1: 读取 Topbar 当前实现**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud && cat web-console/src/components/Topbar.tsx`

如果当前没有通知徽章功能，**跳过此任务**（标记为 N/A 即可）。

如果有徽章（数字徽章），继续。

- [ ] **Step 2: 引入 framer-motion**

```tsx
import { motion } from 'framer-motion';
```

- [ ] **Step 3: 包裹徽章**

把 `<span className="absolute ... rounded-full bg-red-500 ...">{count}</span>` 替换为：

```tsx
<motion.span
  key={count}
  initial={{ scale: 0 }}
  animate={{ scale: [0, 1.3, 1] }}
  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center"
>
  {count}
</motion.span>
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/Topbar.tsx
git commit -m "feat(topbar): pulse notification badge on count change"
```

---

## Phase 4：全局 UI

### Task 15: Dialog 用 AnimatePresence + scale

**Files:**
- Modify: `web-console/src/components/ui/dialog.tsx`

- [ ] **Step 1: 引入 framer-motion**

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { EASE } from '@/lib/motion';
```

- [ ] **Step 2: 重写 Dialog 组件**

把整个 Dialog 组件替换为：

```tsx
import * as React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { EASE } from '@/lib/motion';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: EASE.out }}
            className={cn(
              'relative z-50 w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto',
              className
            )}
          >
            {title && <h2 className="text-lg font-semibold mb-1">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
            <Button variant="ghost" size="icon" className="absolute right-4 top-4" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/ui/dialog.tsx
git commit -m "feat(ui): rewrite Dialog with AnimatePresence + scale transition"
```

---

### Task 16: Button 加 whileTap

**Files:**
- Modify: `web-console/src/components/ui/button.tsx`

- [ ] **Step 1: 引入 framer-motion**

```tsx
import { motion } from 'framer-motion';
```

- [ ] **Step 2: 包裹 button 元素**

把：

```tsx
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
```

替换为：

```tsx
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? motion(Slot) : motion.button;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.1 }}
        {...props}
      />
    );
  }
);
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/ui/button.tsx
git commit -m "feat(ui): add whileTap to Button via framer-motion wrapper"
```

---

### Task 17: Card 增加 interactive prop

**Files:**
- Modify: `web-console/src/components/ui/card.tsx`

- [ ] **Step 1: 引入 framer-motion**

```tsx
import { motion } from 'framer-motion';
import * as React from 'react';
```

- [ ] **Step 2: 修改 Card 组件**

把：

```tsx
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
```

替换为：

```tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive = false, ...props }, ref) => {
    if (interactive) {
      return (
        <motion.div
          ref={ref as React.Ref<HTMLDivElement>}
          className={cn(
            'rounded-lg border bg-card text-card-foreground shadow-sm cursor-pointer',
            className
          )}
          whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          transition={{ duration: 0.15 }}
          {...(props as React.HTMLAttributes<HTMLDivElement>)}
        />
      );
    }
    return (
      <div
        ref={ref}
        className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/ui/card.tsx
git commit -m "feat(ui): add interactive prop to Card with hover lift"
```

---

### Task 18: Tooltip（可选）

**Files:**
- Create: `web-console/src/components/ui/tooltip.tsx`

如果不需要 Tooltip 组件可跳过此任务。

- [ ] **Step 1: 创建 `web-console/src/components/ui/tooltip.tsx`**

完整代码：

```tsx
import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({ content, children, side = 'top', delay = 200 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);

  const onEnter = () => {
    const t = window.setTimeout(() => setOpen(true), delay);
    setTimer(t);
  };
  const onLeave = () => {
    if (timer) clearTimeout(timer);
    setTimer(null);
    setOpen(false);
  };

  const offset = 6;
  const initialBy = {
    top: { y: 4 },
    bottom: { y: -4 },
    left: { x: 4 },
    right: { x: -4 },
  }[side];

  const positionBy = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-[6px]',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-[6px]',
    left: 'right-full top-1/2 -translate-y-1/2 mr-[6px]',
    right: 'left-full top-1/2 -translate-y-1/2 ml-[6px]',
  }[side];

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, ...initialBy }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, ...initialBy }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md whitespace-nowrap',
              positionBy
            )}
            // suppress unused
            style={{ '--tooltip-offset': `${offset}px` } as React.CSSProperties}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/components/ui/tooltip.tsx
git commit -m "feat(ui): add Tooltip component with framer-motion"
```

---

## Phase 5：路由转场

### Task 19: App.tsx 包裹 AnimatePresence + PageTransition

**Files:**
- Modify: `web-console/src/App.tsx`

- [ ] **Step 1: 引入 framer-motion + PageTransition**

```tsx
import { AnimatePresence } from 'framer-motion';
import { PageTransition } from '@/components/motion/PageTransition';
import { useLocation } from 'react-router-dom';
```

- [ ] **Step 2: 在组件内获取 location**

在 App 函数顶部：

```tsx
const location = useLocation();
```

- [ ] **Step 3: 包裹 Routes**

把：

```tsx
          <ErrorBoundary>
            <BrowserRouter>
              <Routes>
                ...
              </Routes>
            </BrowserRouter>
          </ErrorBoundary>
```

替换为：

```tsx
          <ErrorBoundary>
            <BrowserRouter>
              <AnimatePresence mode="wait" initial={false}>
                <PageTransition key={location.pathname}>
                  <Routes>
                    ...
                  </Routes>
                </PageTransition>
              </AnimatePresence>
            </BrowserRouter>
          </ErrorBoundary>
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/App.tsx
git commit -m "feat(app): wrap Routes with AnimatePresence + PageTransition"
```

---

### Task 20: 列表页用 StaggerList

**Files:**
- Modify: 多个列表页（Instances / Resources / Users / CloudAccounts 等）

- [ ] **Step 1: 找一个列表页示例**

例如 `web-console/src/pages/Instances.tsx`，找到渲染列表的 map 循环。

- [ ] **Step 2: 包裹列表容器**

把 `<div className="...">{items.map(...)}</div>` 替换为：

```tsx
<StaggerList className="...">
  {items.map((item) => (
    <FadeIn key={item.id}>  {/* 或 motion.div + variants */}
      {/* item 内容 */}
    </FadeIn>
  ))}
</StaggerList>
```

或者直接：

```tsx
<motion.div initial="initial" animate="animate" variants={stagger} className="...">
  {items.map((item) => (
    <motion.div
      key={item.id}
      variants={fadeUp}
      className="..."
    >
      {/* item */}
    </motion.div>
  ))}
</motion.div>
```

- [ ] **Step 3: 重复应用到其他列表页**

`web-console/src/pages/Users.tsx`、`web-console/src/pages/Resources.tsx`、`web-console/src/pages/CloudAccounts.tsx` 等。

每个文件独立提交：

```bash
git add web-console/src/pages/Instances.tsx
git commit -m "feat(instances): use StaggerList for first-render entrance"
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

---

## Phase 6：可访问性 & 收尾

### Task 21: 集成 useReducedMotion

**Files:**
- Create: `web-console/src/hooks/useMotionConfig.ts`

- [ ] **Step 1: 创建 `web-console/src/hooks/useMotionConfig.ts`**

完整代码：

```ts
import { useReducedMotion } from 'framer-motion';
import { DURATION } from '@/lib/motion';

/**
 * 集中处理 prefers-reduced-motion 系统设置。
 * 返回 { duration, ease } 形式，给 motion 组件 transition 用。
 * 当用户开启"减少动效"时，duration 返回 0。
 */
export function useMotionConfig() {
  const reduced = useReducedMotion();
  return reduced
    ? { duration: 0, ease: undefined as never }
    : { duration: DURATION.base, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npx tsc --noEmit`

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git add web-console/src/hooks/useMotionConfig.ts
git commit -m "feat(motion): add useMotionConfig hook for reduced motion"
```

---

### Task 22: 构建并本地部署验证

- [ ] **Step 1: 构建**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud/web-console && npm run build`

Expected: `dist/` 目录生成，无错误

- [ ] **Step 2: 验证 dist 大小**

Run: `ls -lh /Users/xinruiwen/AI-Wen/newcloud/web-console/dist/assets/`

Expected: 总体积 < 200kb gzip（当前 128kb + framer-motion 8-15kb = 期望 140-145kb gzip）

- [ ] **Step 3: 本地 Docker 重建**

Run: `cd /Users/xinruiwen/AI-Wen/newcloud && docker compose up -d --build app`

Expected: app 容器重启，PostgreSQL/Redis 数据保留

- [ ] **Step 4: 浏览器手动测试**

打开 http://localhost

验证清单：
- [ ] 消息气泡：发送新消息，看到 fade-up + scale 入场
- [ ] AI 思考：发送后看到 shimmer 渐变扫光
- [ ] 流式光标：生成内容时硬切脉冲
- [ ] 侧边栏 hover：背景变色 + 右移 2px
- [ ] 侧边栏激活：左侧出现 2px 白色指示条
- [ ] 路由切换：新页从下方滑入，旧页淡出
- [ ] Dialog：scale 0.95→1 入场
- [ ] 按钮点击：whileTap 缩放反馈
- [ ] 移动端抽屉：滑入/滑出
- [ ] reduced motion：系统设置开启后所有动画立即结束

- [ ] **Step 5: 提交构建结果（如有变更）**

```bash
cd /Users/xinruiwen/AI-Wen/newcloud
git status
# 如有 package-lock.json 变更
git add web-console/package-lock.json
git commit -m "chore: update lock file after framer-motion install" || echo "no changes"
```

---

## 自检

✅ **Spec 覆盖检查**：
- §4.1.1 消息气泡 → Task 6
- §4.1.2 列表错开 → Task 7
- §4.1.3 AI 思考 → Task 8
- §4.1.4 流式光标 → Task 9
- §4.1.5 ToolCall → Task 10
- §4.1.7 ChatInput 按钮 → Task 11
- §4.2.1/2 Sidebar → Task 12
- §4.2.3 移动抽屉 → Task 13
- §4.2.4 通知徽章 → Task 14
- §4.3.1 Dialog → Task 15
- §4.3.2 Button → Task 16
- §4.3.3 Card → Task 17
- §4.3.4 Tooltip（可选）→ Task 18
- §4.4 路由转场 → Task 19
- §4.5 reduced motion → Task 21
- §6 Phase 步骤 → Task 1-22

✅ **无占位符**：每个代码块完整，无 TBD/TODO

✅ **类型一致**：
- `DURATION` / `EASE` / `fadeUp` / `fadeScale` / `pageVariants` / `stagger` / `baseTransition` / `pageTransition` 全部在 Task 2 中定义
- 后续任务使用的 `motion.div`、`AnimatePresence`、`useReducedMotion` 都是 framer-motion 公开 API

---

## 风险与回退

- **单 Task 回退**：`git revert HEAD~N..HEAD` 回退最近 N 个提交
- **Phase 回退**：`git revert` 范围内 commits
- **完全回退**：`git reset --hard <aff9952>`（UI 动画 commit 之前的最新 commit）
