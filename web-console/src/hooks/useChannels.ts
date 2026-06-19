import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';
import type { CreateChannelParams } from '@/types/monitor';

export function useChannels() {
  return useQuery({ queryKey: ['channels'], queryFn: () => monitorApi.listChannels() });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateChannelParams) => monitorApi.createChannel(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => monitorApi.deleteChannel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}
