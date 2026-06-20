// exec.approval RPC 方法 + 审批请求机制
// - handleExecApprovalList: 返回待审批列表
// - handleExecApprovalResolve: 批准/拒绝审批
// - requestApproval: 在 runner 中调用，推送 exec.approval.requested 事件并等待结果
//
// 审批状态存储在内存 Map 中（简单实现，进程重启丢失）
// 审批超时：60 秒无响应自动拒绝，避免对话卡死

import type { ClientConnection } from '../gateway/server-broadcast.js';
import { broadcastEvent } from '../gateway/server-broadcast.js';
import type { ToolCall, DangerLevel } from '../agent/tools.js';
import type { ChatAbortControllerEntry } from '../gateway/chat-abort.js';

// ============ 类型定义 ============

export interface ExecApprovalContext {
  clients: Map<string, ClientConnection>;
  /** chatAbortControllers 引用，用于清理孤儿审批（run 已结束但审批还 pending） */
  chatAbortControllers?: Map<string, ChatAbortControllerEntry>;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout';

export interface ApprovalRequest {
  /** 审批 ID */
  id: string;
  /** 关联的 run ID */
  runId: string;
  /** 关联的 sessionKey */
  sessionKey: string;
  /** 触发审批的工具调用 */
  toolCall: ToolCall;
  /** 工具名 */
  toolName: string;
  /** 工具危险级别 */
  dangerLevel: DangerLevel;
  /** 审批状态 */
  status: ApprovalStatus;
  /** 创建时间 */
  createdAt: number;
  /** 解决时间 */
  resolvedAt?: number;
  /** 解决人 userId */
  resolvedBy?: string;
}

// ============ 内存存储 ============

/** 所有审批请求（包括已解决的，延迟清理） */
const approvalStore = new Map<string, ApprovalRequest>();

/** 待处理的 Promise resolver */
const pendingResolvers = new Map<
  string,
  { resolve: (approved: boolean) => void; reject: (err: Error) => void }
>();

/** 审批超时时间（毫秒） */
const APPROVAL_TIMEOUT_MS = 60000;

// ============ 审批请求（供 runner 调用） ============

/**
 * 请求审批（在 runner 中调用）
 * 推送 exec.approval.requested 事件，并等待客户端通过 exec.approval.resolve 解决
 * 返回 true=批准，false=拒绝/超时；若 run 被中止则抛错
 */
export function requestApproval(params: {
  runId: string;
  sessionKey: string;
  toolCall: ToolCall;
  toolName: string;
  dangerLevel: DangerLevel;
  context: ExecApprovalContext;
  signal: AbortSignal;
}): Promise<boolean> {
  const id = `appr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const request: ApprovalRequest = {
    id,
    runId: params.runId,
    sessionKey: params.sessionKey,
    toolCall: params.toolCall,
    toolName: params.toolName,
    dangerLevel: params.dangerLevel,
    status: 'pending',
    createdAt: Date.now(),
  };
  approvalStore.set(id, request);
  console.log('[exec-approval] requestApproval created', {
    approvalId: id,
    runId: params.runId,
    sessionKey: params.sessionKey,
    toolName: params.toolName,
    dangerLevel: params.dangerLevel,
  });

  // 推送 exec.approval.requested 事件给订阅了该 session 的客户端
  broadcastEvent(params.context.clients, {
    event: 'exec.approval.requested',
    targetSessionKey: params.sessionKey,
    payload: {
      approvalId: id,
      runId: params.runId,
      sessionKey: params.sessionKey,
      toolCall: params.toolCall,
      toolName: params.toolName,
      dangerLevel: params.dangerLevel,
      createdAt: request.createdAt,
    },
  });

  return new Promise<boolean>((resolve, reject) => {
    // 超时自动拒绝（避免客户端不响应导致对话卡死）
    const timeoutTimer = setTimeout(() => {
      if (approvalStore.has(id)) {
        const req = approvalStore.get(id)!;
        if (req.status === 'pending') {
          console.log('[exec-approval] TIMEOUT - auto-rejecting', { approvalId: id });
          req.status = 'timeout';
          req.resolvedAt = Date.now();
          pendingResolvers.delete(id);
          resolve(false); // 超时视为拒绝
          // 延迟清理
          setTimeout(() => approvalStore.delete(id), 60000);
        }
      }
    }, APPROVAL_TIMEOUT_MS);

    pendingResolvers.set(id, {
      resolve: (approved) => {
        console.log('[exec-approval] resolver called', { approvalId: id, approved });
        clearTimeout(timeoutTimer);
        resolve(approved);
      },
      reject: (err) => {
        console.log('[exec-approval] resolver rejected', { approvalId: id, error: err.message });
        clearTimeout(timeoutTimer);
        reject(err);
      },
    });

    // 支持 run 中止时取消等待
    const onAbort = () => {
      console.log('[exec-approval] ABORT - rejecting', { approvalId: id });
      clearTimeout(timeoutTimer);
      if (approvalStore.has(id)) {
        approvalStore.delete(id);
        pendingResolvers.delete(id);
        reject(new Error('Run aborted'));
      }
    };
    if (params.signal.aborted) {
      console.log('[exec-approval] signal already aborted', { approvalId: id });
      onAbort();
      return;
    }
    params.signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ============ RPC 方法 ============

/**
 * exec.approval.list - 返回待审批列表（仅 pending 状态）
 * 注意：已解决（approved/rejected/timeout）的审批不返回，避免刷新后重复弹出
 * 同时清理孤儿审批（run 已结束但审批还 pending）
 */
export function handleExecApprovalList(
  _client: ClientConnection,
  params: { sessionKey?: string },
  context: ExecApprovalContext,
  respond: (ok: boolean, payload: unknown) => void
): void {
  const all = Array.from(approvalStore.values());
  console.log('[exec-approval] handleExecApprovalList called', {
    totalApprovals: all.length,
    pendingApprovals: all.filter(a => a.status === 'pending').length,
    chatAbortControllersSize: context.chatAbortControllers?.size || 0,
    chatAbortControllerKeys: context.chatAbortControllers ? Array.from(context.chatAbortControllers.keys()) : [],
  });

  // 清理孤儿审批：run 已不在 chatAbortControllers 中（已结束），但审批还 pending
  if (context.chatAbortControllers) {
    for (const req of all) {
      if (req.status === 'pending') {
        const hasRun = context.chatAbortControllers.has(req.runId);
        console.log('[exec-approval] checking orphan', {
          approvalId: req.id,
          runId: req.runId,
          hasRunInControllers: hasRun,
        });
        if (!hasRun) {
          // run 已结束，清理孤儿审批
          console.log('[exec-approval] ORPHAN cleanup - rejecting approval', { approvalId: req.id, runId: req.runId });
          req.status = 'timeout';
          req.resolvedAt = Date.now();
          const resolver = pendingResolvers.get(req.id);
          if (resolver) {
            pendingResolvers.delete(req.id);
            resolver.resolve(false); // 视为拒绝
          }
          setTimeout(() => approvalStore.delete(req.id), 5000);
        }
      }
    }
  }

  // 只返回 pending 状态的审批，并将 id 映射为 approvalId 以匹配前端接口
  const filtered = (params.sessionKey
    ? all.filter(a => a.sessionKey === params.sessionKey && a.status === 'pending')
    : all.filter(a => a.status === 'pending')
  ).map(a => ({
    approvalId: a.id,
    runId: a.runId,
    sessionKey: a.sessionKey,
    toolCall: a.toolCall,
    toolName: a.toolName,
    dangerLevel: a.dangerLevel,
    status: a.status,
    createdAt: a.createdAt,
  }));
  console.log('[exec-approval] returning approvals', { count: filtered.length, ids: filtered.map(a => a.approvalId) });
  respond(true, { approvals: filtered });
}

/**
 * exec.approval.resolve - 批准/拒绝审批
 */
export function handleExecApprovalResolve(
  client: ClientConnection,
  params: { approvalId: string; decision: 'approve' | 'reject' },
  _context: ExecApprovalContext,
  respond: (ok: boolean, payload: unknown) => void
): void {
  const req = approvalStore.get(params.approvalId);
  if (!req) {
    respond(false, { error: 'APPROVAL_NOT_FOUND' });
    return;
  }
  if (req.status !== 'pending') {
    respond(false, { error: 'APPROVAL_ALREADY_RESOLVED', status: req.status });
    return;
  }

  const approved = params.decision === 'approve';
  req.status = approved ? 'approved' : 'rejected';
  req.resolvedAt = Date.now();
  req.resolvedBy = client.userId;

  // 解决等待中的 Promise
  const resolver = pendingResolvers.get(params.approvalId);
  if (resolver) {
    pendingResolvers.delete(params.approvalId);
    resolver.resolve(approved);
  }

  // 延迟清理已处理的审批记录（供查询历史）
  setTimeout(() => approvalStore.delete(params.approvalId), 60000);

  respond(true, { approvalId: params.approvalId, status: req.status });
}
