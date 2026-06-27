import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cloudApi } from '@/api/cloud';
import { useDemoStore } from '@/stores/demo';
import {
  demoListInstances,
  demoGetInstance,
  demoStartInstance,
  demoStopInstance,
  demoRebootInstance,
  demoDeleteInstance,
  demoCreateInstance,
} from '@/lib/demo/demo-api';
import type { ListInstancesParams, CreateInstanceParams } from '@/types/cloud';

export function useInstances(params?: ListInstancesParams, options?: { enabled?: boolean }) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['instances', params, isDemoMode],
    queryFn: () => isDemoMode ? demoListInstances(params) : cloudApi.listInstances(params),
    gcTime: 5 * 60_000,
    enabled: options?.enabled,
  });
}

export function useInstance(id: string | undefined) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['instance', id, isDemoMode],
    queryFn: () => isDemoMode ? demoGetInstance(id!) : cloudApi.getInstance(id!),
    enabled: !!id,
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useMutation({
    mutationFn: (params: CreateInstanceParams) => isDemoMode ? demoCreateInstance(params) : cloudApi.createInstance(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
}

export function useInstanceAction() {
  const qc = useQueryClient();
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'start' | 'stop' | 'reboot' | 'delete' }) => {
      if (isDemoMode) {
        if (action === 'start') return demoStartInstance(id);
        if (action === 'stop') return demoStopInstance(id);
        if (action === 'reboot') return demoRebootInstance(id);
        return demoDeleteInstance(id);
      }
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
