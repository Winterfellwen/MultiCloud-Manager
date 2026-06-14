# ToolCallCard 流式输出优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign ToolCallCard to show readable summaries for each tool type, with expandable details for running/done/error states.

**Architecture:** Add `getToolSummary()` function to format tool-specific summaries, update ToolCallCard to use summaries and support state-based expand/collapse, add CSS for progress animation and elapsed timer.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react icons

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/web-chat/src/components/Chat/ToolCallCard.tsx` | Card component with summary, expand/collapse, timer |
| `packages/web-chat/src/components/Chat/MessageItem.tsx` | Use ToolCallCard for all tool calls (remove inline tool-block) |
| `packages/web-chat/src/index.css` | Progress dots animation, elapsed time, summary styles |

---

### Task 1: Add getToolSummary function to ToolCallCard.tsx

**Files:**
- Modify: `packages/web-chat/src/components/Chat/ToolCallCard.tsx`

- [ ] **Step 1: Add getToolSummary function**

```typescript
function getToolSummary(tool: ToolCall): string {
  const { name, params } = tool

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
```

- [ ] **Step 2: Add getParamsLabel function**

```typescript
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
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd packages/web-chat && npx tsc --noEmit`
Expected: No errors

---

### Task 2: Add ProgressDots and ElapsedTimer components

**Files:**
- Modify: `packages/web-chat/src/components/Chat/ToolCallCard.tsx`

- [ ] **Step 1: Add ProgressDots component**

```typescript
function ProgressDots() {
  return (
    <span className="progress-dots">
      <span></span>
      <span></span>
      <span></span>
    </span>
  )
}
```

- [ ] **Step 2: Add ElapsedTimer component**

```typescript
function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return <span className="elapsed-time">{elapsed.toFixed(1)}s</span>
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd packages/web-chat && npx tsc --noEmit`
Expected: No errors

---

### Task 3: Rewrite ToolCallCard component

**Files:**
- Modify: `packages/web-chat/src/components/Chat/ToolCallCard.tsx`

- [ ] **Step 1: Rewrite ToolCallCard with new structure**

```typescript
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Loader, CheckCircle, XCircle } from 'lucide-react'
import type { ToolCall } from '../../api/types'

interface ToolCallCardProps {
  tool: ToolCall
}

function getToolSummary(tool: ToolCall): string {
  // ... (from Task 1)
}

function getParamsLabel(toolName: string): string {
  // ... (from Task 1)
}

function ProgressDots() {
  // ... (from Task 2)
}

function ElapsedTimer() {
  // ... (from Task 2)
}

export function ToolCallCard({ tool }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(tool.status === 'running')

  useEffect(() => {
    setExpanded(tool.status === 'running')
  }, [tool.status])

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

  const summary = getToolSummary(tool)
  const paramsLabel = getParamsLabel(tool.name)

  return (
    <div className={`tool-card ${tool.status}`}>
      <div
        className="tool-card-header"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="card-summary">{summary}</span>
        <span className="card-status-group">
          {tool.status === 'running' && <ProgressDots />}
          {tool.status === 'running' && <ElapsedTimer />}
          <span className={`card-status ${tool.status}`}>
            {statusIcon()}
          </span>
        </span>
      </div>
      {expanded && (
        <div className="tool-card-body expanded">
          {tool.status === 'running' ? (
            <>
              <div className="field-label">{paramsLabel}</div>
              <div className="field-code">
                {JSON.stringify(tool.params, null, 2)}
              </div>
            </>
          ) : (
            <>
              <div className="field-label">{paramsLabel}</div>
              <div className="field-code">
                {JSON.stringify(tool.params, null, 2)}
              </div>
              {tool.result && (
                <>
                  <div className="field-label">Result</div>
                  <div className="field-result">{tool.result}</div>
                </>
              )}
              {tool.error && (
                <>
                  <div className="field-label">Error</div>
                  <div className="field-result field-error">{tool.error}</div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd packages/web-chat && npx tsc --noEmit`
Expected: No errors

---

### Task 4: Add CSS styles for progress dots and elapsed time

**Files:**
- Modify: `packages/web-chat/src/index.css`

- [ ] **Step 1: Add progress dots animation**

```css
/* ============ Progress Animation ============ */
.progress-dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  margin-right: 6px;
}

.progress-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--warning);
  animation: progress-dot 1.2s ease-in-out infinite;
}

.progress-dots span:nth-child(1) { animation-delay: 0s; }
.progress-dots span:nth-child(2) { animation-delay: 0.2s; }
.progress-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes progress-dot {
  0%, 20% { opacity: 1; }
  50% { opacity: 0.3; }
  80%, 100% { opacity: 1; }
}
```

- [ ] **Step 2: Add elapsed time style**

```css
.elapsed-time {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  margin-right: 6px;
}
```

- [ ] **Step 3: Add card summary and status group styles**

```css
.card-summary {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-status-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.card-status {
  font-size: 12px;
}

.field-error {
  border-color: var(--danger);
  color: var(--danger);
}
```

- [ ] **Step 4: Verify CSS compiles**

Run: `cd packages/web-chat && npx vite build`
Expected: Build succeeds

---

### Task 5: Update MessageItem to use ToolCallCard for streaming

**Files:**
- Modify: `packages/web-chat/src/components/Chat/MessageItem.tsx`

- [ ] **Step 1: Import ToolCallCard**

```typescript
import { ToolCallCard } from './ToolCallCard'
```

- [ ] **Step 2: Replace inline tool-block rendering with ToolCallCard**

Change from:
```tsx
{toolCalls.length > 0 && (
  <div className="tool-calls-inline">
    {toolCalls.map((tc) => (
      <ToolCallCard key={tc.id || tc.name} tool={tc} />
    ))}
  </div>
)}
```

To:
```tsx
{toolCalls.length > 0 && (
  <div className="tool-calls-container">
    {toolCalls.map((tc) => (
      <ToolCallCard key={tc.id || tc.name} tool={tc} />
    ))}
  </div>
)}
```

- [ ] **Step 3: Add container style**

Add to index.css:
```css
.tool-calls-container {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `cd packages/web-chat && npx tsc --noEmit`
Expected: No errors

---

### Task 6: Build and verify

**Files:**
- None (verification only)

- [ ] **Step 1: Run full build**

Run: `cd packages/web-chat && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run dev server and test manually**

Run: `cd packages/web-chat && npm run dev`

Test scenarios:
1. `list_cloud_resources` with no params → shows "List all resources"
2. `list_cloud_resources` with cloud_type=azure → shows "List azure resources"
3. `shell_exec` with command → shows command truncated
4. `cloud_api_request` → shows "GET https://..."
5. `start_instance` → shows "Start: vm-xxx"
6. Running state → shows progress dots + timer, default expanded
7. Done state → shows checkmark, default collapsed, expandable with Result
8. Error state → shows X icon, default collapsed, expandable with Error

- [ ] **Step 3: Commit changes**

```bash
git add packages/web-chat/src/components/Chat/ToolCallCard.tsx packages/web-chat/src/components/Chat/MessageItem.tsx packages/web-chat/src/index.css
git commit -m "feat: redesign ToolCallCard with tool-specific summaries and expandable details"
```
