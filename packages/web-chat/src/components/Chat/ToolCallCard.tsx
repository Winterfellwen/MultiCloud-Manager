import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Loader, CheckCircle, XCircle, Terminal, Search, Cloud, BarChart3 } from 'lucide-react'
import type { ToolCall } from '../../api/types'

interface ToolCallCardProps {
  tool: ToolCall
}

function getToolIcon(name: string) {
  switch (name) {
    case 'shell_exec':
    case 'run_script':
      return <Terminal size={12} />
    case 'list_cloud_resources':
    case 'get_cloud_stats':
    case 'list_cloud_accounts':
    case 'get_cloud_credentials':
      return <Search size={12} />
    case 'start_instance':
    case 'stop_instance':
    case 'restart_instance':
    case 'sync_cloud_resources':
      return <Cloud size={12} />
    case 'get_cost_overview':
    case 'get_cost_breakdown':
    case 'get_cost_trend':
    case 'compare_cross_cloud_costs':
    case 'forecast_cost':
      return <BarChart3 size={12} />
    default:
      return <Terminal size={12} />
  }
}

function getToolSummary(tool: ToolCall): string {
  const { name } = tool
  const params = tool.params as Record<string, any> || {}

  switch (name) {
    case 'shell_exec':
      return params.command || 'Execute command'
    case 'run_script':
      return params.script ? params.script.split('\n')[0] : 'Execute script'
    case 'cloud_api_request': {
      const method = params.method || 'GET'
      return `${method} ${params.url || ''}`
    }
    case 'start_instance':
      return params.resource_id ? `Start ${params.resource_id}` : 'Start instance'
    case 'stop_instance':
      return params.resource_id ? `Stop ${params.resource_id}` : 'Stop instance'
    case 'restart_instance':
      return params.resource_id ? `Restart ${params.resource_id}` : 'Restart instance'
    case 'list_cloud_resources': {
      const parts: string[] = ['List']
      if (params.cloud_type) parts.push(params.cloud_type)
      parts.push('resources')
      return parts.join(' ')
    }
    case 'get_cloud_stats':
      return 'Get statistics'
    case 'sync_cloud_resources':
      return 'Sync all clouds'
    case 'list_cloud_accounts':
      return 'List cloud accounts'
    case 'get_cloud_credentials':
      return params.cloud_type ? `Get ${params.cloud_type} credentials` : 'Get credentials'
    case 'get_cost_overview':
      return 'Get cost overview'
    case 'get_cost_breakdown':
      return 'Get cost breakdown'
    case 'get_cost_trend':
      return 'Get cost trend'
    case 'compare_cross_cloud_costs':
      return params.tier ? `Compare ${params.tier} pricing` : 'Compare pricing'
    case 'get_optimization_suggestions':
      return 'Get optimization suggestions'
    case 'apply_optimization':
      return params.suggestion_id ? `Apply: ${params.suggestion_id}` : 'Apply optimization'
    case 'create_optimization_rule':
      return params.name ? `Create rule: ${params.name}` : 'Create rule'
    case 'forecast_cost':
      return 'Forecast costs'
    default:
      return name
  }
}

function getParamsPreview(tool: ToolCall): string {
  const { name } = tool
  const params = tool.params as Record<string, any> || {}

  switch (name) {
    case 'shell_exec':
      return params.command ? `$ ${params.command}` : ''
    case 'run_script':
      return params.script ? params.script.split('\n').slice(0, 3).join('\n') : ''
    case 'cloud_api_request':
      return params.url ? `${params.method || 'GET'} ${params.url}` : ''
    case 'list_cloud_resources':
    case 'start_instance':
    case 'stop_instance':
    case 'restart_instance':
      return params.resource_id || ''
    default:
      return ''
  }
}

function getParamsLabel(toolName: string): string {
  switch (toolName) {
    case 'shell_exec': return 'Command'
    case 'run_script': return 'Script'
    case 'cloud_api_request': return 'Request'
    case 'start_instance':
    case 'stop_instance':
    case 'restart_instance': return 'Resource'
    default: return 'Parameters'
  }
}

function ProgressDots() {
  return (
    <span className="progress-dots">
      <span></span>
      <span></span>
      <span></span>
    </span>
  )
}

function ElapsedTimer({ startTime, status }: { startTime: number; status: string }) {
  const [elapsed, setElapsed] = useState(() => (Date.now() - startTime) / 1000)

  useEffect(() => {
    if (status !== 'running') return
    const interval = setInterval(() => {
      setElapsed((Date.now() - startTime) / 1000)
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime, status])

  return <span className="elapsed-time">{elapsed.toFixed(1)}s</span>
}

export function ToolCallCard({ tool }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [startTime] = useState(() => Date.now())

  const summary = getToolSummary(tool)
  const paramsLabel = getParamsLabel(tool.name)
  const paramsPreview = getParamsPreview(tool)
  const toolIcon = getToolIcon(tool.name)

  const statusIcon = () => {
    switch (tool.status) {
      case 'running':
        return <Loader size={12} className="animate-spin" style={{ color: 'var(--warning)' }} />
      case 'done':
        return <CheckCircle size={12} style={{ color: 'var(--success)' }} />
      case 'error':
        return <XCircle size={12} style={{ color: 'var(--danger)' }} />
    }
  }

  return (
    <div className={`tool-card ${tool.status}`}>
      <div
        className="tool-card-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`card-status ${tool.status}`}>
          {statusIcon()}
        </span>
        {tool.status === 'running' && <ProgressDots />}
        <span className="card-icon">{toolIcon}</span>
        <span className="card-summary">
          {summary}
          {tool.status === 'running' && paramsPreview && (
            <span className="card-running-cmd">{paramsPreview}</span>
          )}
        </span>
        {tool.status !== 'running' && <ElapsedTimer startTime={startTime} status={tool.status} />}
        {expanded ? <ChevronDown size={12} className="card-chevron" /> : <ChevronRight size={12} className="card-chevron" />}
      </div>
      {expanded && (
        <div className="tool-card-body expanded">
          <div className="field-label">{paramsLabel}</div>
          <div className="field-code">
            {JSON.stringify(tool.params, null, 2)}
          </div>
          {tool.status !== 'running' && tool.result && (
            <>
              <div className="field-label">Result</div>
              <div className="field-result">{tool.result}</div>
            </>
          )}
          {tool.status !== 'running' && tool.error && (
            <>
              <div className="field-label">Error</div>
              <div className="field-result field-error">{tool.error}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
