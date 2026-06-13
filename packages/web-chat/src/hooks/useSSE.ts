import { useEffect, useRef, useCallback } from 'react'
import { getEventSourceURL } from '../api/client'
import type { SSEEvent } from '../api/types'

interface UseSSEOptions {
  sessionIds: string[]
  onEvent: (event: SSEEvent) => void
  onError?: (error: Event) => void
  enabled?: boolean
}

export function useSSE({ sessionIds, onEvent, onError, enabled = true }: UseSSEOptions) {
  const sourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    if (!enabled || sessionIds.length === 0) return
    if (sourceRef.current) {
      sourceRef.current.close()
    }

    const url = getEventSourceURL(sessionIds)
    const source = new EventSource(url)
    sourceRef.current = source

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent
        if (event.lastEventId) {
          localStorage.setItem('last_event_id', event.lastEventId)
        }
        onEventRef.current(data)
      } catch {
        // ignore parse errors
      }
    }

    source.onerror = (err) => {
      onError?.(err)
      source.close()
      // Don't auto-reconnect on auth errors
    }
  }, [sessionIds, enabled, onError])

  useEffect(() => {
    connect()
    return () => {
      sourceRef.current?.close()
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [connect])

  return {
    reconnect: connect,
  }
}
