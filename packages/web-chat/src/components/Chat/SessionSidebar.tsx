import { useEffect, useState } from 'react'
import { Plus, Trash2, Search } from 'lucide-react'
import { Loading } from '../common/Loading'
import type { Session } from '../../api/types'

interface SessionSidebarProps {
  sessions: Session[]
  currentSessionId: string | null
  loading: boolean
  onSelect: (sessionId: string) => void
  onCreate: () => void
  onDelete: (sessionId: string) => void
  onLoad: (params?: { q?: string; sort?: string; order?: string; status?: string }) => void
}

export function SessionSidebar({
  sessions,
  currentSessionId,
  loading,
  onSelect,
  onCreate,
  onDelete,
  onLoad,
}: SessionSidebarProps) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('updated_at')
  const [order, setOrder] = useState('desc')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    onLoad({ q: search, sort: sortBy, order, status: statusFilter })
  }, [sortBy, order, statusFilter])

  const handleSearch = () => {
    onLoad({ q: search, sort: sortBy, order, status: statusFilter })
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <h3>Sessions</h3>
        <button className="chat-new-btn" onClick={onCreate} title="New Session">
          <Plus size={14} />
        </button>
      </div>

      <div className="session-filters">
        <div className="search-box">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="filters-row">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="updated_at">Last Updated</option>
            <option value="created_at">Created</option>
            <option value="title">Title</option>
          </select>
          <select value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="running">Running</option>
          <option value="done">Done</option>
          <option value="error">Error</option>
          <option value="stopped">Stopped</option>
          <option value="queued">Queued</option>
        </select>
      </div>

      <div className="chat-session-list">
        {loading ? (
          <Loading text="Loading sessions..." />
        ) : sessions.length === 0 ? (
          <div className="empty-state">No sessions found</div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.session_id}
              className={`chat-session-item ${session.session_id === currentSessionId ? 'active' : ''} ${session.status === 'running' ? 'running' : ''}`}
              onClick={() => onSelect(session.session_id)}
            >
              <div className="session-body">
                <div className="session-title">{session.title || 'Untitled'}</div>
                <div className="session-meta">
                  <span className="session-time">{formatDate(session.updated_at)}</span>
                  {session.provider && (
                    <span className="session-provider">{session.provider}</span>
                  )}
                  <SessionStatusBadge status={session.status} />
                </div>
              </div>
              <button
                className="session-del-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('Delete this session?')) onDelete(session.session_id)
                }}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SessionStatusBadge({ status }: { status: string }) {
  const badgeClass = {
    running: 'badge-running',
    done: 'badge-done',
    error: 'badge-error',
    stopped: 'badge-stopped',
    queued: 'badge-queued',
  }[status] || ''

  if (!badgeClass) return null

  return <span className={`session-badge ${badgeClass}`} />
}
