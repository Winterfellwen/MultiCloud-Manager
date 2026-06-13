import type { ToolCall } from '../../api/types'

interface ConfirmCardProps {
  toolCalls: ToolCall[]
  onConfirm: (toolName: string, params?: Record<string, unknown>) => void
  onReject: (toolName: string) => void
}

export function ConfirmCard({ toolCalls, onConfirm, onReject }: ConfirmCardProps) {
  return (
    <div className="confirm-card">
      <div className="confirm-header">
        <strong>Confirm the following operations:</strong>
      </div>
      {toolCalls.map((tc) => (
        <div key={tc.id} className="confirm-item">
          <div className="confirm-tool">
            <span className="tool-name">{tc.name}</span>
            <span className="tool-params">
              {JSON.stringify(tc.params)}
            </span>
          </div>
          <div className="confirm-actions">
            <button
              className="confirm-btn"
              onClick={() => onConfirm(tc.name, tc.params)}
            >
              Confirm
            </button>
            <button
              className="reject-btn"
              onClick={() => onReject(tc.name)}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
