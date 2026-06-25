import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '../api/teams';
import { useDemoStore } from '../stores/demo';
import {
  demoListTeams,
  demoGetTeam,
  demoCreateTeam,
  demoUpdateTeam,
  demoDeleteTeam,
  demoGetTeamMembers,
  demoAssignUserToTeam,
} from '../lib/demo/demo-api';
import type { CreateTeamParams, UpdateTeamParams, AssignUserToTeamParams } from '../types/team';

export function useTeams() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['teams', isDemoMode],
    queryFn: () => isDemoMode ? demoListTeams() : teamsApi.list(),
  });
}

export function useTeam(id: string | null) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['team', id, isDemoMode],
    enabled: !!id,
    queryFn: () => isDemoMode ? demoGetTeam(id!) : teamsApi.getById(id!),
  });
}

export function useTeamMembers(teamId: string | null) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['teamMembers', teamId, isDemoMode],
    enabled: !!teamId,
    queryFn: () => isDemoMode ? demoGetTeamMembers(teamId!) : teamsApi.getMembers(teamId!),
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateTeamParams) => {
      const isDemoMode = useDemoStore.getState().isDemoMode;
      return isDemoMode ? demoCreateTeam(params) : teamsApi.create(params);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: UpdateTeamParams }) => {
      const isDemoMode = useDemoStore.getState().isDemoMode;
      return isDemoMode ? demoUpdateTeam(id, params) : teamsApi.update(id, params);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const isDemoMode = useDemoStore.getState().isDemoMode;
      return isDemoMode ? demoDeleteTeam(id) : teamsApi.delete(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useAssignUserToTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, params }: { userId: string; params: AssignUserToTeamParams }) => {
      const isDemoMode = useDemoStore.getState().isDemoMode;
      return isDemoMode ? demoAssignUserToTeam(userId, params) : teamsApi.assignUserToTeam(userId, params);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}