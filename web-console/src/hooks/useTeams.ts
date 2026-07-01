import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '../api/teams';
import type { CreateTeamParams, UpdateTeamParams, AssignUserToTeamParams } from '../types/team';

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
  });
}

export function useTeam(id: string | null) {
  return useQuery({
    queryKey: ['team', id],
    enabled: !!id,
    queryFn: () => teamsApi.getById(id!),
  });
}

export function useTeamMembers(teamId: string | null) {
  return useQuery({
    queryKey: ['teamMembers', teamId],
    enabled: !!teamId,
    queryFn: () => teamsApi.getMembers(teamId!),
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateTeamParams) => teamsApi.create(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: UpdateTeamParams }) => teamsApi.update(id, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useAssignUserToTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, params }: { userId: string; params: AssignUserToTeamParams }) =>
      teamsApi.assignUserToTeam(userId, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
