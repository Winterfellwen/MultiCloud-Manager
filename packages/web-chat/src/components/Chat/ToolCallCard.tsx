import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader, CheckCircle, XCircle } from 'lucide-react'
import type { ToolCall } from '../../api/types'

interface ToolCallCardProps {
  tool: ToolCall
}

export function ToolCallCard({ tool }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)

  const statusIcon = () => {
    switch (tool.status) {
      case 'running':
        return <Loader size={12} className="animate-spin text-warning" />
      case 'done':
        return <CheckCircle size={12} className="text-success" />
      case 'error':
        return <XCircle size={12} className="text-danger" />
    }
  }

  const statusText = () => {
    switch (tool.status) {
      case 'running': return 'Running'
      case 'done': return 'Done'
      case 'error': return 'Error'
    }
  }

  return (
    <div className={`tool-card ${tool.status}`}>
      <div
        className="tool-card-header"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="card-icon">🔧</span>
        <span className="card-name">{tool.name}</span>
        <span className={`card-status ${tool.status}`}>
          {statusIcon()} {statusText()}
        </span>
      </div>
      {expanded && (
        <div className="tool-card-body expanded">
          <div className="field-label">Parameters</div>
          <div className="field-code">
            {JSON.stringify(tool.params, null, 2)}
          </div>
          {(tool.result || tool.error) && (
            <>
              <div className="field-label">Result</div>
              <div className="field-result">
                {tool.error || tool.result || ''}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
