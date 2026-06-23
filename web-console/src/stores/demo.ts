// Demo 模式状态管理
// 用于无登录体验所有功能，所有数据来自 mock
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DemoState {
  isDemoMode: boolean;
  setDemoMode: (on: boolean) => void;
  enterDemo: () => void;
  exitDemo: () => void;
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set) => ({
      isDemoMode: false,
      setDemoMode: (on) => set({ isDemoMode: on }),
      enterDemo: () => set({ isDemoMode: true }),
      exitDemo: () => set({ isDemoMode: false }),
    }),
    {
      name: 'cloudops-demo',
    }
  )
);
