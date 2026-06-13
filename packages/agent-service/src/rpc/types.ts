export interface RPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface RPCResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface AgentRunRequest {
  sessionId: string;
  message: string;
  mode: "plan" | "build" | "confirm";
  userRole: "admin" | "user" | "viewer";
}

export interface AgentRunResponse {
  runId: string;
  sessionId: string;
}

export interface AgentStreamEvent {
  type: "token" | "reasoning" | "tool_start" | "tool_result" | "done" | "error";
  runId: string;
  content?: string;
  tool?: { name: string; args: unknown };
  result?: string;
  error?: string;
}

export interface SessionCreateRequest {
  title?: string;
  userId: string;
}

export interface ToolExecuteRequest {
  name: string;
  args: Record<string, unknown>;
  sessionId: string;
}