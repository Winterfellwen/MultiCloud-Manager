// 用户管理页：列表 + 角色分配 + 团队设置 + 删除 + 创建用户
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, Loader2, AlertCircle, Users as UsersIcon, Plus, Edit2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { useUsers, useCreateUser, useUpdateUserRole, useDeleteUser } from '@/hooks/useUsers';
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam, useTeamMembers, useAssignUserToTeam } from '@/hooks/useTeams';
import { ROLE_OPTIONS } from '@/types/user';
import type { UserRole } from '@/types/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';

function TeamMembersView({ teamId }: { teamId: string }) {
  const { data: members, isLoading } = useTeamMembers(teamId);
  const { t } = useTranslation();

  if (!teamId) return null;
  if (isLoading) {
    return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  }
  if (!members || members.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('teams.noMembers')}</p>;
  }
  return (
    <ul className="space-y-2">
      {members.map((m) => (
        <li key={m.id} className="flex items-center justify-between">
          <span className="text-sm font-medium">{m.username}</span>
          <span className="text-xs text-muted-foreground">{t(`roles.${m.role}`)}</span>
        </li>
      ))}
    </ul>
  );
}

const ROLE_BADGE_VARIANT: Record<UserRole, 'default' | 'secondary' | 'outline' | 'warning'> = {
  admin: 'default',
  ops_manager: 'secondary',
  ops_engineer: 'outline',
  viewer: 'warning',
};

export default function Users() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const { data: users, isLoading, error } = useUsers();
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const createUser = useCreateUser();
  const updateRole = useUpdateUserRole();
  const deleteUser = useDeleteUser();
  const createTeam = useCreateTeam();

  const updateTeamMutation = useUpdateTeam();
  const deleteTeamMutation = useDeleteTeam();
  const assignUserToTeam = useAssignUserToTeam();

  const [activeTab, setActiveTab] = useState<'users' | 'teams'>('users');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; username: string } | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<{ id: string; name: string } | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '' });
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'viewer' as UserRole,
    team: '',
    teamId: '',
  });

  const handleCreate = async () => {
    if (!form.username || !form.password) return;
    try {
      await createUser.mutateAsync({
        username: form.username,
        email: form.email || undefined,
        password: form.password,
        role: form.role,
        team: form.teamId || undefined,
      });
      setDialogOpen(false);
      setForm({ username: '', email: '', password: '', role: 'viewer', team: '', teamId: '' });
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // 错误由 mutation 状态展示
    }
  };

  const handleTeamCreate = async () => {
    if (!teamForm.name) return;
    try {
      await createTeam.mutateAsync({ name: teamForm.name });
      setTeamDialogOpen(false);
      setTeamForm({ name: '' });
    } catch {
      // 错误由 mutation 状态展示
    }
  };

  const handleTeamUpdate = async () => {
    if (!editingTeam || !teamForm.name) return;
    try {
      await updateTeamMutation.mutateAsync({ id: editingTeam.id, params: { name: teamForm.name } });
      setTeamDialogOpen(false);
      setEditingTeam(null);
      setTeamForm({ name: '' });
    } catch {
      // 错误由 mutation 状态展示
    }
  };

  const handleTeamDelete = async (id: string) => {
    try {
      await deleteTeamMutation.mutateAsync(id);
    } catch {
      // 错误由 mutation 状态展示
    }
  };

  const openEditTeam = (team: { id: string; name: string }) => {
    setEditingTeam(team);
    setTeamForm({ name: team.name });
    setTeamDialogOpen(true);
  };

  const handleUserTeamChange = async (userId: string, teamId: string) => {
    try {
      await assignUserToTeam.mutateAsync({ userId, params: { teamId: teamId || null } });
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
        <h1 className="text-xl sm:text-2xl font-bold">{t('users.title')}</h1>
        <div className="flex gap-2">
          <Button onClick={() => setTeamDialogOpen(true)} size="sm" variant="outline">
            <Plus className="mr-1.5 h-4 w-4" />
            {t('teams.create')}
          </Button>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <UserPlus className="mr-1.5 h-4 w-4" />
            {t('users.create')}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'users' | 'teams')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="users">
            <UsersIcon className="mr-2 h-4 w-4" />
            {t('users.tab')}
          </TabsTrigger>
          <TabsTrigger value="teams">
            <UsersIcon className="mr-2 h-4 w-4" />
            {t('teams.tab')}
          </TabsTrigger>
        </TabsList>

      <TabsContent value="users">
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {t('users.loadFailed')}：{(error as Error).message}
        </div>
      )}

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">{t('users.username')}</TableHead>
                <TableHead className="w-[200px]">{t('users.email')}</TableHead>
                <TableHead className="w-[120px]">{t('users.role')}</TableHead>
                <TableHead className="w-[120px]">{t('users.team')}</TableHead>
                <TableHead className="w-[160px]">{t('users.createdAt')}</TableHead>
                <TableHead className="w-[160px]">{t('users.lastLogin')}</TableHead>
                <TableHead className="w-[80px]">{t('users.actions')}</TableHead>
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
                    {t('users.noUsers')}
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
                          {t(`roles.${user.role}`)}
                        </Badge>
                      ) : (
                        <Select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          className="h-8 w-[120px] py-1 text-xs"
                          disabled={updateRole.isPending}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {t(`roles.${opt.value}`)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {currentUser?.id === user.id ? (
                        <span className="text-xs text-muted-foreground">
                          {user.teamId ? teams?.find(t => t.id === user.teamId)?.name || user.team : '-'}
                        </span>
                      ) : (
                        <Select
                          value={user.teamId || ''}
                          onChange={(e) => handleUserTeamChange(user.id, e.target.value)}
                          className="h-8 w-[120px] py-1 text-xs"
                          disabled={assignUserToTeam.isPending}
                        >
                          <option value="">{t('users.unassigned')}</option>
                          {teams?.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </Select>
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
                        <span className="text-xs text-muted-foreground">{t('users.currentUser')}</span>
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
      </div>
      </TabsContent>

      <TabsContent value="teams">
        {teamsLoading ? (
          <div className="text-center py-8">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : teams && teams.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t('teams.noTeams')}
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">{t('teams.name')}</TableHead>
                    <TableHead className="w-[180px]">{t('teams.createdAt')}</TableHead>
                    <TableHead className="w-[80px]">{t('teams.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams?.map((team) => (
                    <TableRow key={team.id}>
                      <TableCell className="font-medium">{team.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(team.createdAt)}
                      </TableCell>
                      <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => openEditTeam(team)}
                            disabled={updateTeamMutation.isPending}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => handleTeamDelete(team.id)}
                            disabled={deleteTeamMutation.isPending}
                          >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* 团队成员查看对话框 */}
            <Dialog
              open={!!editingTeam}
              onClose={() => setEditingTeam(null)}
              title={t('teams.membersTitle', { name: editingTeam?.name })}
            >
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => openEditTeam(editingTeam!)}>
                    <Edit2 className="mr-1.5 h-4 w-4" />
                    {t('teams.edit')}
                  </Button>
                </div>
                <div className="rounded-md border p-4 max-h-[400px] overflow-y-auto">
                  <TeamMembersView teamId={editingTeam?.id || ''} />
                </div>
                {editingTeam && (
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setEditingTeam(null)}>
                      {t('common.close')}
                    </Button>
                    <Button onClick={handleTeamUpdate} disabled={updateTeamMutation.isPending}>
                      {updateTeamMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      {t('common.save')}
                    </Button>
                  </div>
                )}
              </div>
            </Dialog>
          </>
        )}
      </TabsContent>
      </Tabs>

      {/* 创建用户对话框 */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={t('users.createDialogTitle')}
        description={t('users.createDialogDesc')}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t('users.username')}</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder={t('users.usernamePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('users.emailOptional')}</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder={t('users.emailPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('users.password')}</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t('users.passwordPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">{t('users.role')}</Label>
            <Select
              id="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`roles.${opt.value}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamId">{t('users.teamOptional')}</Label>
            <Select
              id="teamId"
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
            >
              <option value="">{t('users.unassigned')}</option>
              {teams?.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </div>
          {createUser.isError && (
            <p className="text-sm text-destructive">
              {t('users.createFailed')}：{(createUser.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.username || !form.password || createUser.isPending}
            >
              {createUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('common.create')}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 创建/编辑团队对话框 */}
      <Dialog
        open={teamDialogOpen}
        onClose={() => { setTeamDialogOpen(false); setEditingTeam(null); setTeamForm({ name: '' }); }}
        title={editingTeam ? t('teams.editTitle') : t('teams.createDialogTitle')}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teamName">{t('teams.name')}</Label>
            <Input
              id="teamName"
              value={teamForm.name}
              onChange={(e) => setTeamForm({ name: e.target.value })}
              placeholder={t('teams.namePlaceholder') as string}
            />
          </div>
          {createTeam.isError && (
            <p className="text-sm text-destructive">
              {(createTeam.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setTeamDialogOpen(false); setEditingTeam(null); setTeamForm({ name: '' }); }}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={editingTeam ? handleTeamUpdate : handleTeamCreate}
              disabled={!teamForm.name || createTeam.isPending || updateTeamMutation.isPending}
            >
              {(createTeam.isPending || updateTeamMutation.isPending) && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingTeam ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('users.confirmDeleteTitle')}
        description={t('users.confirmDeleteDesc', { name: deleteTarget?.username })}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteUser.isPending}>
            {deleteUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t('users.delete')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
