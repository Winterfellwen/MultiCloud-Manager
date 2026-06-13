import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader, CheckCircle, XCircle } from 'lucide-react'
import type { ToolCall } from '../../api/types'

function getToolSummary(tool: ToolCall): string {
  const { name, params: p } = tool
  const params = p as Record<string, any>

  switch (name) {
    case 'shell_exec':
      return params.command
        ? (params.command.length > 50 ? params.command.slice(0, 50) + '...' : params.command)
        : 'Execute command'

    case 'run_script':
      if (params.script) {
        const firstLine = params.script.split('\n')[0]
        return firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine
      }
      return 'Execute script'

    case 'cloud_api_request':
      const method = params.method || 'GET'
      const url = params.url || ''
      const displayUrl = url.length > 50 ? url.slice(0, 50) + '...' : url
      return `${method} ${displayUrl}`

    case 'start_instance':
      return params.resource_id ? `Start: ${params.resource_id}` : 'Start instance'

    case 'stop_instance':
      return params.resource_id ? `Stop: ${params.resource_id}` : 'Stop instance'

    case 'restart_instance':
      return params.resource_id ? `Restart: ${params.resource_id}` : 'Restart instance'

    case 'list_cloud_resources': {
      const parts: string[] = ['List']
      if (params.cloud_type) parts.push(params.cloud_type)
      parts.push('resources')
      if (params.region) parts.push(`in ${params.region}`)
      if (params.status) parts.push(`(${params.status})`)
      return parts.join(' ')
    }

    case 'get_cloud_stats':
      return 'Get statistics'

    case 'sync_cloud_resources':
      return 'Sync all clouds'

    case 'list_cloud_accounts':
      return 'List cloud accounts'

    case 'get_cloud_credentials':
      return params.cloud_type
        ? `Get ${params.cloud_type} credentials`
        : 'Get credentials'

    case 'get_cost_overview':
      return 'Get cost overview'

    case 'get_cost_breakdown':
      return 'Get cost breakdown'

    case 'get_cost_trend':
      return 'Get cost trend'

    case 'compare_cross_cloud_costs':
      return params.tier
        ? `Compare ${params.tier} pricing`
        : 'Compare cross-cloud pricing'

    case 'get_optimization_suggestions':
      return 'Get optimization suggestions'

    case 'apply_optimization':
      return params.suggestion_id
        ? `Apply suggestion: ${params.suggestion_id}`
        : 'Apply optimization'

    case 'create_optimization_rule':
      return params.name
        ? `Create rule: ${params.name}`
        : 'Create optimization rule'

    case 'forecast_cost':
      return 'Forecast costs'

    default:
      return name
  }
}

function getParamsLabel(toolName: string): string {
  switch (toolName) {
    case 'shell_exec':
      return 'Command'
    case 'run_script':
      return 'Script'
    case 'cloud_api_request':
      return 'Request'
    case 'start_instance':
    case 'stop_instance':
    case 'restart_instance':
      return 'Resource'
    default:
      return 'Parameters'
  }
}

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
        <span className="card-summary">{getToolSummary(tool)}</span>
        <span className={`card-status ${tool.status}`}>
          {statusIcon()} {statusText()}
        </span>
      </div>
      {expanded && (
        <div className="tool-card-body expanded">
          <div className="field-label">{getParamsLabel(tool.name)}</div>
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
