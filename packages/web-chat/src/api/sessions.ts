import { apiFetch } from './client'
import type { Session } from './types'

export async function listSessions(params?: {
  page?: number
  limit?: number
  sort?: string
  order?: string
  status?: string
  q?: string
}): Promise<{ sessions: Session[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.sort) query.set('sort', params.sort)
  if (params?.order) query.set('order', params.order)
  if (params?.status) query.set('status', params.status)
  if (params?.q) query.set('q', params.q)
  return apiFetch(`/agent/sessions?${query.toString()}`)
}

export async function getSession(sid: string): Promise<Session & {
  messages: Array<{ role: string; content: string; created_at?: string }>
  active_run_id?: string
  active_run_events?: unknown[]
  pending_runs?: unknown[]
  incomplete_runs?: unknown[]
}> {
  return apiFetch(`/agent/sessions/${sid}`)
}

export async function createSession(title?: string): Promise<{ session_id: string }> {
  return apiFetch('/agent/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: title || 'New Session' }),
  })
}

export async function deleteSession(sid: string): Promise<void> {
  await apiFetch(`/agent/sessions/${sid}`, { method: 'DELETE' })
}

export async function updateSession(sid: string, data: { title?: string }): Promise<void> {
  await apiFetch(`/agent/sessions/${sid}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}
