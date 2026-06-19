import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cloudApi } from '@/api/cloud';
import type { ListInstancesParams, CreateInstanceParams } from '@/types/cloud';

export function useInstances(params?: ListInstancesParams) {
  return useQuery({
    queryKey: ['instances', params],
    queryFn: () => cloudApi.listInstances(params),
  });
}

export function useInstance(id: string | undefined) {
  return useQuery({
    queryKey: ['instance', id],
    queryFn: () => cloudApi.getInstance(id!),
    enabled: !!id,
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateInstanceParams) => cloudApi.createInstance(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
}

export function useInstanceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'start' | 'stop' | 'reboot' | 'delete' }) => {
      if (action === 'start') return cloudApi.startInstance(id);
      if (action === 'stop') return cloudApi.stopInstance(id);
      if (action === 'reboot') return cloudApi.rebootInstance(id);
      return cloudApi.deleteInstance(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
}

export function useSyncInstances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider?: string) => cloudApi.syncInstances(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
}

export function useProviders() {
  return useQuery({ queryKey: ['providers'], queryFn: () => cloudApi.getProviders() });
}

export function useRegions(provider: string | undefined) {
  return useQuery({
    queryKey: ['regions', provider],
    queryFn: () => cloudApi.getRegions(provider!),
    enabled: !!provider,
  });
}

export function useInstanceTypes(provider: string | undefined, region: string | undefined) {
  return useQuery({
    queryKey: ['instance-types', provider, region],
    queryFn: () => cloudApi.getInstanceTypes(provider!, region!),
    enabled: !!provider && !!region,
  });
}

export function useImages(provider: string | undefined) {
  return useQuery({
    queryKey: ['images', provider],
    queryFn: () => cloudApi.getImages(provider!),
    enabled: !!provider,
  });
}
