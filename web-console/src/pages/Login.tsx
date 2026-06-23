import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useDemoStore } from '@/stores/demo';
import { ApiError } from '@/api/client';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setTokens = useAuthStore((s) => s.setTokens);
  const enterDemo = useDemoStore((s) => s.enterDemo);
  const exitDemo = useDemoStore((s) => s.exitDemo);

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
      exitDemo();
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

  function handleDemoLogin() {
    // 解析 demo JWT：sub、username、role 直接以 base64 形式构造
    const demoPayload = btoa(JSON.stringify({
      sub: 'demo-u-1',
      username: 'demo-admin',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 86400,
    }));
    const jwt = `demo-header.${demoPayload}.demo-signature`;
    setTokens({
      accessToken: jwt,
      refreshToken: 'demo-refresh-token',
      expiresIn: 86400,
    });
    enterDemo();
    navigate(from, { replace: true });
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
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">或</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleDemoLogin}
            >
              🎭 Demo 演示（无需登录）
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Demo 模式使用模拟数据体验所有功能
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
