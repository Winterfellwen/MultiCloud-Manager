import { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SearchModal } from './SearchModal';
import { DemoBanner } from './common/DemoBanner';
import { Breadcrumb } from './Breadcrumb';
import { useChatStore } from '@/stores/chat';
import { useAuthStore } from '@/stores/auth';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { EASE, DURATION } from '@/lib/motion';

export function Layout() {
  // 全局初始化 WebSocket 连接（所有页面共享，如 AiSettings 的 provider 管理、Chat 的对话）
  const connect = useChatStore((s) => s.connect);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }
  }, [connect, isAuthenticated]);

  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar:collapsed') === 'true';
  });
  const location = useLocation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 路由切换时自动关闭移动端侧边栏
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const toggleCollapse = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar:collapsed', String(next));
      return next;
    });
  }, []);

  // 聊天页面需要全屏布局（无 padding、无 overflow-auto），其他页面保持默认
  const isChatPage = location.pathname.startsWith('/chat');

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 桌面端：固定侧边栏 */}
      {!isMobile && <Sidebar collapsed={sidebarCollapsed} />}

      {/* 移动端：抽屉式侧边栏 */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <>
            {/* 遮罩层 */}
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.base, ease: EASE.out }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={closeSidebar}
            />
            {/* 抽屉 */}
            <motion.div
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: DURATION.base, ease: EASE.out }}
              className="fixed inset-y-0 left-0 z-50"
            >
              <Sidebar />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          onToggleSidebar={toggleSidebar}
          onSearchOpen={() => setSearchOpen(true)}
          onToggleCollapse={toggleCollapse}
          sidebarCollapsed={sidebarCollapsed}
          isMobile={isMobile}
        />
        <DemoBanner />
        {!isChatPage && <Breadcrumb />}
        <main className={cn(
          'flex-1 overflow-hidden',
          isChatPage ? 'p-0' : 'overflow-auto p-3 md:p-6'
        )}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: DURATION.page, ease: EASE.out }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
