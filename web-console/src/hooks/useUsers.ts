import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { useDemoStore } from '../stores/demo';
import { demoListUsers } from '../lib/demo/demo-api';
import type { CreateUserParams, UpdateRoleParams, UpdateTeamParams } from '../types/user';

export function useUsers() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['users', isDemoMode],
    queryFn: () => isDemoMode ? demoListUsers() : usersApi.list(),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateUserParams) => usersApi.create(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: UpdateRoleParams }) => usersApi.updateRole(id, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUserTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: UpdateTeamParams }) => usersApi.updateTeam(id, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
