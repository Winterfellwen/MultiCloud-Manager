const API_BASE = '/api'

let JWT_TOKEN = localStorage.getItem('token') || ''

export function setToken(token: string) {
  JWT_TOKEN = token
  localStorage.setItem('token', token)
}

export function getToken(): string {
  return JWT_TOKEN
}

export function clearToken() {
  JWT_TOKEN = ''
  localStorage.removeItem('token')
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }

  if (JWT_TOKEN) {
    headers['Authorization'] = `Bearer ${JWT_TOKEN}`
  }

  const res = await fetch(url.startsWith('http') ? url : `${API_BASE}${url}`, {
    ...options,
    headers,
  })

  if (res.status === 401) {
    clearToken()
    window.location.href = '/login.html'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }

  return res.json()
}

export function getEventSourceURL(sessionIds?: string[]): string {
  const params = new URLSearchParams()
  if (JWT_TOKEN) params.set('token', JWT_TOKEN)
  if (sessionIds && sessionIds.length > 0) {
    params.set('session_ids', sessionIds.join(','))
  }
  const lastId = localStorage.getItem('last_event_id')
  if (lastId) params.set('last_event_id', lastId)
  return `${API_BASE}/agent/events?${params.toString()}`
}
