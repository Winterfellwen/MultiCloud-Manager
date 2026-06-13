# React Chat UI 实施计划

**日期:** 2026-06-12
**目标:** 将 web/index.html 中的 vanilla JS 聊天 UI 重写为 React 组件

## 项目结构

```
packages/web-chat/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── api/
│   │   ├── client.ts
│   │   ├── sessions.ts
│   │   ├── chat.ts
│   │   └── types.ts
│   ├── hooks/
│   │   ├── useSSE.ts
│   │   ├── useSessions.ts
│   │   └── useChat.ts
│   ├── components/
│   │   ├── Chat/
│   │   │   ├── ChatPage.tsx
│   │   │   ├── SessionSidebar.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageItem.tsx
│   │   │   ├── ToolCallCard.tsx
│   │   │   ├── ConfirmCard.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   └── ModeToggle.tsx
│   │   ├── Files/
│   │   │   └── FilesSidebar.tsx
│   │   └── common/
│   │       ├── Modal.tsx
│   │       └── Loading.tsx
│   ├── contexts/
│   │   └── ChatContext.tsx
│   └── utils/
│       ├── markdown.ts
│       └── theme.ts
```

## 实施步骤

| 步骤 | 内容 | 状态 |
|------|------|------|
| 0 | 保存计划文件 | ✅ |
| 1 | 项目初始化 (Vite + React + TS + Tailwind) | ⏳ |
| 2 | 设计 tokens + 全局样式 | ⏳ |
| 3 | API 客户端 + 类型定义 | ⏳ |
| 4 | useSSE Hook | ⏳ |
| 5 | useSessions Hook | ⏳ |
| 6 | useChat Hook | ⏳ |
| 7 | SessionSidebar 组件 | ⏳ |
| 8 | MessageList + MessageItem | ⏳ |
| 9 | ToolCallCard + ConfirmCard | ⏳ |
| 10 | ChatInput + ModeToggle | ⏳ |
| 11 | FilesSidebar 组件 | ⏳ |
| 12 | ChatPage + App 组装 | ⏳ |
| 13 | 主题切换 + 响应式设计 | ⏳ |
| 14 | 虚拟滚动优化 | ⏳ |
| 15 | 编译验证 | ⏳ |

## 技术选型

- **框架:** React 18 + TypeScript
- **构建:** Vite 5
- **样式:** Tailwind CSS 3
- **状态:** React Context + useReducer
- **Markdown:** react-markdown + remark-gfm
- **代码高亮:** react-syntax-highlighter
- **虚拟滚动:** @tanstack/react-virtual
- **图标:** Lucide React
