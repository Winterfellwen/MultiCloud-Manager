import type { ChatMode } from '../../api/types'

interface ModeToggleProps {
  mode: ChatMode
  onChange: (mode: ChatMode) => void
  disabled?: boolean
}

const modes: { value: ChatMode; label: string; description: string }[] = [
  { value: 'plan', label: 'Plan', description: 'Read-only mode' },
  { value: 'build', label: 'Build', description: 'Execute operations' },
  { value: 'confirm', label: 'Confirm', description: 'Requires approval' },
]

export function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  return (
    <div className="mode-toggle" role="radiogroup" aria-label="Chat mode selector">
      {modes.map((m) => (
        <button
          key={m.value}
          className={`mode-btn ${mode === m.value ? 'active' : ''}`}
          onClick={() => onChange(m.value)}
          role="radio"
          aria-checked={mode === m.value}
          aria-label={m.description}
          disabled={disabled}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
