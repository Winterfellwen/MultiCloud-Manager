import { defineConfig } from 'vite';

// 构建为 IIFE bundle（Web Component），供 React 动态加载
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'CloudOpsChat',
      formats: ['iife'],
      fileName: () => 'cloudops-chat.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
