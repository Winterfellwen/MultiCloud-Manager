// AI 对话页（Lit 版）：嵌入 <cloudops-chat> Web Component
import { useEffect, useState } from 'react';
import { loadCloudOpsChat } from '@/lib/openclaw-adapter';
import { useAuthStore } from '@/stores/auth';
import { Loader2, AlertCircle } from 'lucide-react';

export default function ChatLit() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.accessToken);
  const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3005/ws';

  useEffect(() => {
    loadCloudOpsChat()
      .then(() => setLoaded(true))
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  }, []);

  if (error) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Lit 组件加载失败：{error}</span>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <cloudops-chat
        gateway-url={wsBaseUrl}
        token={token || ''}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  );
}
