import { useState, useCallback } from 'react'
import * as sessionsApi from '../api/sessions'
import type { Session } from '../api/types'

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const loadSessions = useCallback(async (params?: {
    page?: number
    sort?: string
    order?: string
    status?: string
    q?: string
  }) => {
    setLoading(true)
    try {
      const res = await sessionsApi.listSessions({
        page: params?.page || page,
        limit,
        sort: params?.sort,
        order: params?.order,
        status: params?.status,
        q: params?.q,
      })
      setSessions(res.sessions || [])
      setTotal(res.total || 0)
      setPage(res.page || 1)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [page])

  const createSession = useCallback(async (title?: string) => {
    const res = await sessionsApi.createSession(title)
    return res.session_id
  }, [])

  const deleteSession = useCallback(async (sid: string) => {
    await sessionsApi.deleteSession(sid)
    setSessions(prev => prev.filter(s => s.session_id !== sid))
  }, [])

  const updateSessionTitle = useCallback(async (sid: string, title: string) => {
    await sessionsApi.updateSession(sid, { title })
    setSessions(prev => prev.map(s =>
      s.session_id === sid ? { ...s, title } : s
    ))
  }, [])

  return {
    sessions,
    loading,
    page,
    total,
    limit,
    loadSessions,
    createSession,
    deleteSession,
    updateSessionTitle,
    setPage,
  }
}
