// 用户管理页：列表 + 角色分配 + 团队设置 + 删除 + 创建用户
import { useState, useMemo } from 'react';
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
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
import { TableWithPagination, type Column } from '@/components/ui/table-with-pagination';
import type { UserRow } from '@/types/user';
import type { Team } from '@/types/team';

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

  const [userFilters, setUserFilters] = useState<Record<string, string>>({});
  const [teamFilters, setTeamFilters] = useState<Record<string, string>>({});

  const userFilterConfigs: FilterConfig[] = [
    { key: 'search', type: 'search', placeholder: t('common.filterSearchUsername') },
    {
      key: 'role',
      type: 'select',
      label: t('common.filterRole'),
      options: [
        { label: t('common.filterAll'), value: '' },
        ...ROLE_OPTIONS.map((opt) => ({ label: t(`roles.${opt.value}`), value: opt.value })),
      ],
    },
    {
      key: 'team',
      type: 'select',
      label: t('common.filterTeam'),
      options: [
        { label: t('common.filterAll'), value: '' },
        ...(teams || []).map((team) => ({ label: team.name, value: team.id })),
      ],
    },
  ];

  const teamFilterConfigs: FilterConfig[] = [
    { key: 'search', type: 'search', placeholder: t('common.filterSearchName') },
  ];

  const userColumns = useMemo<Column<UserRow>[]>(() => [
    {
      key: 'username',
      header: t('users.username'),
      accessor: 'username',
      className: 'w-[150px]',
      cell: (value) => <span className="font-medium">{String(value)}</span>,
    },
    {
      key: 'email',
      header: t('users.email'),
      accessor: (row) => row.email || '-',
      className: 'w-[200px]',
      cell: (value) => <span className="text-muted-foreground">{String(value)}</span>,
    },
    {
      key: 'role',
      header: t('users.role'),
      accessor: 'role',
      className: 'w-[120px]',
      cell: (_value, row) => (
        currentUser?.id === row.id ? (
          <Badge variant={ROLE_BADGE_VARIANT[row.role]}>
            {t(`roles.${row.role}`)}
          </Badge>
        ) : (
          <Select
            value={row.role}
            onChange={(e) => handleRoleChange(row.id, e.target.value as UserRole)}
            className="h-8 w-[120px] py-1 text-xs"
            disabled={updateRole.isPending}
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(`roles.${opt.value}`)}
              </option>
            ))}
          </Select>
        )
      ),
    },
    {
      key: 'team',
      header: t('users.team'),
      accessor: 'teamId',
      className: 'w-[120px]',
      cell: (_value, row) => (
        currentUser?.id === row.id ? (
          <span className="text-xs text-muted-foreground">
            {row.teamId ? teams?.find(team => team.id === row.teamId)?.name || row.team : '-'}
          </span>
        ) : (
          <Select
            value={row.teamId || ''}
            onChange={(e) => handleUserTeamChange(row.id, e.target.value)}
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
        )
      ),
    },
    {
      key: 'createdAt',
      header: t('users.createdAt'),
      accessor: (row) => formatDate(row.createdAt),
      className: 'w-[160px]',
      cell: (value) => <span className="text-muted-foreground text-xs">{String(value)}</span>,
    },
    {
      key: 'lastLogin',
      header: t('users.lastLogin'),
      accessor: (row) => formatDate(row.lastLoginAt),
      className: 'w-[160px]',
      cell: (value) => <span className="text-muted-foreground text-xs">{String(value)}</span>,
    },
    {
      key: 'actions',
      header: t('users.actions'),
      accessor: () => '',
      className: 'w-[80px]',
      cell: (_value, row) => (
        currentUser?.id === row.id ? (
          <span className="text-xs text-muted-foreground">{t('users.currentUser')}</span>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteTarget({ id: row.id, username: row.username })}
            disabled={deleteUser.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )
      ),
    },
  ], [currentUser, teams, t, updateRole.isPending, assignUserToTeam.isPending, deleteUser.isPending]);

  const filteredUsers = useMemo(() => {
    return (users || []).filter((user) => {
      const s = (userFilters.search || '').toLowerCase();
      if (s && !user.username.toLowerCase().includes(s) && !(user.email || '').toLowerCase().includes(s)) return false;
      if (userFilters.role && user.role !== userFilters.role) return false;
      if (userFilters.team && user.teamId !== userFilters.team) return false;
      return true;
    });
  }, [users, userFilters]);

  const filteredTeams = useMemo(() => {
    return (teams || []).filter((team) => {
      const s = (teamFilters.search || '').toLowerCase();
      if (s && !team.name.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [teams, teamFilters]);

  const teamColumns = useMemo<Column<Team>[]>(() => [
    {
      key: 'name',
      header: t('teams.name'),
      accessor: 'name',
      className: 'w-[200px]',
      cell: (value) => <span className="font-medium">{String(value)}</span>,
    },
    {
      key: 'createdAt',
      header: t('teams.createdAt'),
      accessor: (row) => formatDate(row.createdAt),
      className: 'w-[180px]',
      cell: (value) => <span className="text-muted-foreground text-xs">{String(value)}</span>,
    },
    {
      key: 'actions',
      header: t('teams.actions'),
      accessor: () => '',
      className: 'w-[80px]',
      cell: (_value, row) => (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={() => openEditTeam(row)}
            disabled={updateTeamMutation.isPending}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            onClick={() => handleTeamDelete(row.id)}
            disabled={deleteTeamMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      ),
    },
  ], [t, updateTeamMutation.isPending, deleteTeamMutation.isPending]);

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
    return new Date(s).toLocaleString();
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
      <FilterBar
        filters={userFilterConfigs}
        values={userFilters}
        onChange={setUserFilters}
        className="mb-4"
      />
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {t('users.loadFailed')}：{(error as Error).message}
        </div>
      )}

      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <TableWithPagination
            data={filteredUsers}
            columns={userColumns}
            loading={isLoading}
            emptyTitle={t('users.noUsers')}
            rowKey="id"
          />
        </div>
      </div>
      </TabsContent>

      <TabsContent value="teams">
        <FilterBar
          filters={teamFilterConfigs}
          values={teamFilters}
          onChange={setTeamFilters}
          className="mb-4"
        />
        <div className="rounded-md border">
          <TableWithPagination
            data={filteredTeams}
            columns={teamColumns}
            loading={teamsLoading}
            emptyTitle={t('teams.noTeams')}
            rowKey="id"
          />
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
