# CloudOps AI Console — UI 动效方案设计

**日期**：2026-06-23
**作者**：Brainstorming 会话
**状态**：已通过设计评审
**范围**：web-console（React + TypeScript + Vite + Tailwind）

---

## 1. 背景与目标

### 1.1 现状

web-console 已完成功能主体，但 UI 缺乏反馈感：
- 路由切换"硬切"，无过渡
- 消息气泡即时出现/消失
- 侧边栏 hover 仅颜色变化，无方向感
- Dialog 直接出现/消失
- 流式输出指示器简陋

### 1.2 目标

参考 LibreChat（成熟的开源 AI 聊天 UI），加入克制、专业的微动画，提升整体质感。**不追求花哨，追求流畅**。

### 1.3 范围

- ✅ Chat 对话页（最高优先级）：消息气泡、AI 思考、流式光标、ToolCard 展开
- ✅ 侧边栏 + Topbar：hover、激活指示、移动端抽屉
- ✅ 全局 UI：Dialog、Button、Card、Tooltip
- ✅ 页面/路由：转场、列表错开、重排序

### 1.4 非目标

- ❌ 物理引擎模拟（spring 过强）
- ❌ 滚动驱动动画（parallax）
- ❌ 音频/触觉反馈
- ❌ Tailwind 主题色调整
- ❌ hover 音效

---

## 2. 选型

### 2.1 动画库

**决定**：**framer-motion v11+**

理由：
- LibreChat、ChatGPT、Linear、Notion 等成熟产品使用
- `AnimatePresence` 原生处理组件挂载/卸载
- `layout` 动画处理列表重排序
- TypeScript 友好
- 8-15kb gzip（tree-shake 后）
- 社区活跃、文档完善

**对比备选**：
- 纯 CSS + tailwindcss-animate：动画种类受限，退出动画需手动
- framer-motion + CSS 混合：API 不一致，需约定职责

### 2.2 设计基线（经视觉对比选 B 方案）

| 维度 | 选 B 的理由 |
|---|---|
| 动画风格 | LibreChat 风：200ms / 6px translateY / 轻 scale，ease-out |
| 页面转场 | 新页从下方 10px 滑入 + 旧页淡出 |
| AI 思考指示器 | 骨架屏 shimmer（用户选 C） |
| Dialog | scale 0.95→1 + 淡入（用户选 A） |
| Hover | 背景 + translateX 2px（用户选 B） |
| 流式光标 | 硬切脉冲 steps(2)（用户选 A） |

---

## 3. 架构

### 3.1 文件变更

```
web-console/
├── package.json                           # +framer-motion
├── tailwind.config.js                     # 保留 tailwindcss-animate
├── src/
│   ├── lib/
│   │   └── motion.ts                      # 🆕 动画 token + 预设 variants
│   ├── components/
│   │   ├── motion/
│   │   │   ├── PageTransition.tsx         # 🆕 路由转场包裹器
│   │   │   ├── FadeIn.tsx                 # 🆕 通用淡入组件
│   │   │   └── StaggerList.tsx            # 🆕 列表错开入场
│   │   ├── chat/
│   │   │   ├── MessageBubble.tsx          # 改用 motion.div + variants
│   │   │   ├── MessageList.tsx            # 包裹 StaggerList
│   │   │   ├── ChatInput.tsx              # 发送按钮 whileTap
│   │   │   ├── SessionList.tsx            # 列表项 motion + layout
│   │   │   └── ToolCallCard.tsx           # 展开/收起动画
│   │   ├── ui/
│   │   │   ├── dialog.tsx                 # AnimatePresence + scale
│   │   │   ├── button.tsx                 # 改用 whileTap
│   │   │   ├── card.tsx                   # 增加 interactive prop
│   │   │   └── tooltip.tsx                # 🆕 tooltip 组件
│   │   ├── Sidebar.tsx                    # 列表项 motion + hover
│   │   ├── Topbar.tsx                     # 通知徽章 pulse
│   │   └── Layout.tsx                     # 移动端抽屉用 motion
│   ├── pages/
│   │   └── ChatReact.tsx                  # 包裹 PageTransition
│   └── App.tsx                            # AnimatePresence + location key
```

### 3.2 核心 API

**`lib/motion.ts`** - 集中动画 token：

```ts
import type { Variants } from 'framer-motion';

export const EASE: Record<string, number[]> = {
  out: [0.16, 1, 0.3, 1],         // 标准 ease-out
  outExpo: [0.19, 1, 0.22, 1],    // 明显
  inOut: [0.4, 0, 0.2, 1],
};

export const DURATION = {
  fast: 0.15,                     // 150ms - hover
  base: 0.20,                     // 200ms - 标准入场
  page: 0.25,                     // 250ms - 页面转场
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
};

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export const stagger: Variants = {
  animate: { transition: { staggerChildren: 0.04 } },
};
```

**`motion/PageTransition.tsx`**：

```tsx
import { motion } from 'framer-motion';
import { pageVariants, EASE, DURATION } from '@/lib/motion';

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: DURATION.page, ease: EASE.out }}
    >
      {children}
    </motion.div>
  );
}
```

**`App.tsx` 路由转场**：

```tsx
<AnimatePresence mode="wait" initial={false}>
  <PageTransition key={location.pathname}>
    <Outlet />
  </PageTransition>
</AnimatePresence>
```

`mode="wait"`：旧页 exit 完成后再 mount 新页
`initial={false}`：首次加载不做入场动画

---

## 4. 具体动效实现

### 4.1 Chat 对话页

#### 4.1.1 MessageBubble 入场

```tsx
import { motion } from 'framer-motion';
import { fadeUp, DURATION, EASE } from '@/lib/motion';

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={{ duration: DURATION.base, ease: EASE.out }}
      className="group flex gap-3 px-4 py-3"
    >
      {/* 现有内容 */}
    </motion.div>
  );
}
```

#### 4.1.2 MessageList 错开

```tsx
// MessageList.tsx
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
```

#### 4.1.3 AI 思考指示器（骨架屏 shimmer）

```tsx
{isStreaming && !content && (
  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
    <motion.div
      className="h-2 w-20 rounded bg-gradient-to-r from-muted-foreground/30 via-muted-foreground/50 to-muted-foreground/30 bg-[length:200%_100%]"
      animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
    />
    <span className="text-xs text-muted-foreground">AI 思考中...</span>
  </div>
)}
```

#### 4.1.4 流式光标（硬切脉冲）

```tsx
<motion.span
  className="ml-0.5 inline-block h-3.5 w-1.5 bg-current align-middle"
  animate={{ opacity: [1, 1, 0, 0] }}
  transition={{ duration: 1, times: [0, 0.5, 0.5, 1], repeat: Infinity }}
/>
```

#### 4.1.5 ToolCallCard 展开/收起

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
      {/* 展开内容 */}
    </motion.div>
  )}
</AnimatePresence>
```

#### 4.1.6 ChatInput 发送按钮

```tsx
<motion.button
  whileTap={{ scale: 0.92 }}
  transition={{ duration: 0.1 }}
>...</motion.button>
```

### 4.2 侧边栏 + Topbar

#### 4.2.1 列表项 hover

```tsx
<motion.div
  whileHover={{ x: 2 }}
  transition={{ duration: 0.15, ease: EASE.out }}
  className="...hover:bg-accent"
>
```

#### 4.2.2 激活指示条

```tsx
<motion.span
  className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary"
  initial={false}
  animate={{ scaleY: isActive ? 1 : 0 }}
  transition={{ duration: 0.2, ease: EASE.out }}
  style={{ transformOrigin: 'center' }}
/>
```

#### 4.2.3 移动端抽屉

```tsx
<AnimatePresence>
  {sidebarOpen && (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40 bg-black/50"
        onClick={closeSidebar}
      />
      <motion.aside
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ duration: 0.25, ease: EASE.out }}
        className="fixed inset-y-0 left-0 z-50 w-72"
      >
        <Sidebar />
      </motion.aside>
    </>
  )}
</AnimatePresence>
```

#### 4.2.4 Topbar 通知徽章

```tsx
{count > 0 && (
  <motion.span
    key={count}
    initial={{ scale: 0 }}
    animate={{ scale: [0, 1.3, 1] }}
    transition={{ duration: 0.3, ease: EASE.out }}
    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 ..."
  >
    {count}
  </motion.span>
)}
```

### 4.3 全局 UI

#### 4.3.1 Dialog 弹窗

```tsx
<AnimatePresence>
  {open && (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: EASE.out }}
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 ..."
      >
        {children}
      </motion.div>
    </>
  )}
</AnimatePresence>
```

#### 4.3.2 Button

```tsx
<motion.button
  whileTap={{ scale: 0.97 }}
  transition={{ duration: 0.1 }}
  className="..."
>...</motion.button>
```

#### 4.3.3 Card（interactive prop）

```tsx
type CardProps = { interactive?: boolean; ... };

// interactive=true 时：
<motion.div
  whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
  transition={{ duration: 0.15 }}
  className="..."
>...</motion.div>
```

#### 4.3.4 Tooltip（新增，可选）

```tsx
<AnimatePresence>
  {visible && (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >...</motion.div>
  )}
</AnimatePresence>
```

### 4.4 页面/路由转场

#### 4.4.1 App.tsx 包裹

```tsx
<AnimatePresence mode="wait" initial={false}>
  <PageTransition key={location.pathname}>
    <Outlet />
  </PageTransition>
</AnimatePresence>
```

#### 4.4.2 列表错开

```tsx
<motion.div initial="initial" animate="animate" variants={stagger}>
  {items.map(...)}
</motion.div>
```

#### 4.4.3 SessionList 重排序

```tsx
<motion.div layout transition={{ duration: 0.2 }}>
  {/* session item */}
</motion.div>
```

### 4.5 无障碍：prefers-reduced-motion

```tsx
import { useReducedMotion } from 'framer-motion';

export function useMotionConfig() {
  const prefersReduced = useReducedMotion();
  return prefersReduced
    ? { duration: 0 }
    : { duration: DURATION.base, ease: EASE.out };
}
```

应用到所有 motion 组件。`useReducedMotion()` 在用户系统设置"减少动效"时返回 true。

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| framer-motion 包体积 | 首屏 +8-15kb | 按需 import，tree-shake |
| AnimatePresence + React 18 strict mode | 双渲染 | `mode="wait"` + 稳定 key |
| `layout` 动画性能 | 大量列表卡顿 | SessionList 控制 stagger < 50ms |
| 与现有 CSS transition 冲突 | 双重 transition | 逐步替换 Tailwind 类 |
| 移动端 60fps | 改 width/height 卡顿 | 只用 transform + opacity |
| prefers-reduced-motion | 必须遵守 | `useReducedMotion()` 集中处理 |

### 性能预算

- CPU：单次动画 < 8ms
- FPS：60fps，hover 不掉帧
- 首屏 JS：128kb → < 150kb gzip
- CSS：25.96kb → < 30kb（不增加新 CSS）

---

## 6. 实施步骤

### Phase 1：基础设施（无视觉变化）
1. 安装 `framer-motion@^11.18.2` 依赖
2. 新增 `src/lib/motion.ts`
3. 新增 `src/components/motion/PageTransition.tsx`
4. 新增 `src/components/motion/FadeIn.tsx`
5. 新增 `src/components/motion/StaggerList.tsx`

### Phase 2：Chat 对话页（最高价值）
6. MessageBubble 改用 `motion.div + fadeUp`
7. MessageList 包裹 `stagger`
8. AI 思考指示器用 shimmer 骨架
9. 流式光标改 framer
10. ToolCallCard 展开/收起 AnimatePresence
11. ChatInput 发送按钮 whileTap

### Phase 3：侧边栏 + Topbar
12. Sidebar 列表项 whileHover x:2 + 激活指示条
13. Layout 移动端抽屉改用 motion
14. Topbar 通知徽章脉冲

### Phase 4：全局 UI
15. ui/dialog.tsx 重写为 motion + AnimatePresence
16. ui/button.tsx 改 whileTap
17. ui/card.tsx 增加 interactive prop
18. （可选）新增 ui/tooltip.tsx

### Phase 5：路由转场
19. App.tsx 包裹 AnimatePresence + PageTransition
20. 列表页用 StaggerList

### Phase 6：可访问性 & 收尾
21. 集成 useReducedMotion
22. 整体回归测试
23. 性能测试（React DevTools Profiler）
24. 部署到本地 Docker 验证

---

## 7. 测试计划

### 手动测试
- 桌面 Chrome / Safari / Firefox
- 移动 Safari / Chrome
- 系统"减少动效"开启时
- 快速连续点击侧边栏（路由切换正确排队）

### 回归验证
- Chat 发送→流式→完成全流程
- Dialog 打开/关闭
- SessionList 编辑/删除后重排
- 页面转场流畅

### 性能
- React DevTools Profiler 检查 render 次数
- Chrome Performance 录制确认 60fps

---

## 8. 回退方案

- **单组件回退**：移除 motion 包装，恢复 Tailwind 类
- **全量回退**：`git revert`，改动集中在 `web-console/src/components/**`

---

## 9. 决策记录

| 选项 | 决策 | 日期 |
|---|---|---|
| 动画库 | framer-motion v11+ | 2026-06-23 |
| 动画风格 | LibreChat（B）：200ms / 6px / scale | 2026-06-23 |
| 页面转场 | B：新页从下方 10px 滑入 | 2026-06-23 |
| AI 思考指示器 | C：骨架屏 shimmer | 2026-06-23 |
| Dialog | A：scale 0.95→1 + 淡入 | 2026-06-23 |
| Hover | B：背景 + translateX 2px | 2026-06-23 |
| 流式光标 | A：硬切脉冲 steps(2) | 2026-06-23 |
| 范围 | 全场景：Chat / 导航 / UI / 路由 | 2026-06-23 |

---

## 10. 参考

- LibreChat 源码：https://github.com/danny-avila/LibreChat
- framer-motion 文档：https://www.framer.com/motion/
- LibreChat package.json：`framer-motion ^12.40.0`、`@react-spring/web ^9.7.5`、`react-flip-toolkit ^7.1.0`
- 内部相关设计：
  - `2026-06-23-demo-mode-design.md`
  - `2026-06-22-batch-delete-and-creator-display-design.md`
