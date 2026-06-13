import { apiFetch } from './client'
import type { ChatMode } from './types'

export interface ChatStreamResponse {
  run_id: string
  session_id: string
  state: string
}

export async function sendChatMessage(params: {
  message: string
  session_id: string
  mode: ChatMode
}): Promise<ChatStreamResponse> {
  return apiFetch('/agent/chat/stream', {
    method: 'POST',
    body: JSON.stringify({
      message: params.message,
      session_id: params.session_id,
      mode: params.mode,
    }),
  })
}

export async function confirmChat(params: {
  run_id: string
  action: 'confirm' | 'reject'
  tool_name?: string
  tool_params?: Record<string, unknown>
}): Promise<void> {
  await apiFetch('/agent/chat/confirm', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function stopChat(runId: string): Promise<void> {
  await apiFetch('/agent/chat/stop', {
    method: 'POST',
    body: JSON.stringify({ run_id: runId }),
  })
}
