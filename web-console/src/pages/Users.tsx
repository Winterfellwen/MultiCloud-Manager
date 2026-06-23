// 用户管理页：列表 + 角色分配 + 团队设置 + 删除 + 创建用户
import { useState } from 'react';
import { UserPlus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useUsers, useCreateUser, useUpdateUserRole, useUpdateUserTeam, useDeleteUser } from '@/hooks/useUsers';
import { ROLE_OPTIONS, ROLE_LABELS } from '@/types/user';
import type { UserRole } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';

const ROLE_BADGE_VARIANT: Record<UserRole, 'default' | 'secondary' | 'outline' | 'warning'> = {
  admin: 'default',
  ops_manager: 'secondary',
  ops_engineer: 'outline',
  viewer: 'warning',
};

export default function Users() {
  const currentUser = useAuthStore((s) => s.user);
  const { data: users, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const updateRole = useUpdateUserRole();
  const updateTeam = useUpdateUserTeam();
  const deleteUser = useDeleteUser();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; username: string } | null>(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'viewer' as UserRole,
    team: '',
  });

  const handleCreate = async () => {
    if (!form.username || !form.password) return;
    try {
      await createUser.mutateAsync({
        username: form.username,
        email: form.email || undefined,
        password: form.password,
        role: form.role,
        team: form.team || undefined,
      });
      setDialogOpen(false);
      setForm({ username: '', email: '', password: '', role: 'viewer', team: '' });
    } catch {
      // 错误由 mutation 状态展示
    }
  };

  const handleRoleChange = async (id: string, role: UserRole) => {
    try {
      await updateRole.mutateAsync({ id, params: { role } });
    } catch {
      // 错误由 mutation 状态展示
    }
  };

  const handleTeamChange = async (id: string, team: string) => {
    try {
      await updateTeam.mutateAsync({ id, params: { team } });
    } catch {
      // 错误由 mutation 状态展示
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // 错误由 mutation 状态展示
    }
  };

  const formatDate = (s: string | null) => {
    if (!s) return '-';
    return new Date(s).toLocaleString('zh-CN');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">用户管理</h1>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <UserPlus className="mr-1.5 h-4 w-4" />
          创建用户
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          加载失败：{(error as Error).message}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">用户名</TableHead>
              <TableHead className="w-[200px]">邮箱</TableHead>
              <TableHead className="w-[150px]">角色</TableHead>
              <TableHead className="w-[150px]">团队</TableHead>
              <TableHead className="w-[180px]">创建时间</TableHead>
              <TableHead className="w-[180px]">最后登录</TableHead>
              <TableHead className="w-[80px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : users && users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  暂无用户
                </TableCell>
              </TableRow>
            ) : (
              users?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email || '-'}</TableCell>
                  <TableCell>
                    {currentUser?.id === user.id ? (
                      <Badge variant={ROLE_BADGE_VARIANT[user.role]}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    ) : (
                      <Select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                        className="h-8 w-[130px] py-1 text-xs"
                        disabled={updateRole.isPending}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    {currentUser?.id === user.id ? (
                      <span className="text-xs text-muted-foreground">{user.team || '-'}</span>
                    ) : (
                      <Input
                        value={user.team || ''}
                        onChange={(e) => handleTeamChange(user.id, e.target.value)}
                        placeholder="未分配"
                        className="h-8 w-[120px] py-1 text-xs"
                        disabled={updateTeam.isPending}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(user.lastLoginAt)}
                  </TableCell>
                  <TableCell>
                    {currentUser?.id === user.id ? (
                      <span className="text-xs text-muted-foreground">当前用户</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget({ id: user.id, username: user.username })}
                        disabled={deleteUser.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 创建用户对话框 */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="创建用户"
        description="新用户将通过用户名和密码登录"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="3-64 字符"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">邮箱（可选）</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="user@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="至少 8 字符"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">角色</Label>
            <Select
              id="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="team">团队（可选）</Label>
            <Input
              id="team"
              value={form.team}
              onChange={(e) => setForm({ ...form, team: e.target.value })}
              placeholder="如：SRE、DBA、开发组"
            />
          </div>
          {createUser.isError && (
            <p className="text-sm text-destructive">
              创建失败：{(createUser.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.username || !form.password || createUser.isPending}
            >
              {createUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              创建
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="确认删除"
        description={`确定要删除用户 "${deleteTarget?.username}" 吗？此操作不可撤销。`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteUser.isPending}>
            {deleteUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            删除
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
