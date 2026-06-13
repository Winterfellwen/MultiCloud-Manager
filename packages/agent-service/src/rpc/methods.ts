import { RPCRequest, RPCResponse, AgentRunRequest } from "./types";
import { AgentRunner } from "../agent/runner";
import { SessionManager } from "../agent/session";

const runner = new AgentRunner({ 
  model: process.env.MODEL || "gpt-4",
  goBackendUrl: process.env.GO_BACKEND_URL || "http://localhost:8099",
  jwtSecret: process.env.JWT_SECRET || ""
});
const sessions = new SessionManager();

export const methods = {
  async handle(req: RPCRequest): Promise<RPCResponse> {
    try {
      switch (req.method) {
        case "agent.run": {
          const params = req.params as AgentRunRequest;
          const runId = await runner.start(params);
          return { jsonrpc: "2.0", id: req.id, result: { runId } };
        }
        case "agent.cancel": {
          await runner.cancel(req.params as { runId: string });
          return { jsonrpc: "2.0", id: req.id, result: { ok: true } };
        }
        case "session.create": {
          const session = await sessions.create(req.params as any);
          return { jsonrpc: "2.0", id: req.id, result: session };
        }
        case "session.get": {
          const session = await sessions.get(req.params as { sessionId: string });
          return { jsonrpc: "2.0", id: req.id, result: session };
        }
        case "session.list": {
          const list = await sessions.list(req.params as any);
          return { jsonrpc: "2.0", id: req.id, result: list };
        }
        default:
          return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } };
      }
    } catch (e) {
      return { jsonrpc: "2.0", id: req.id, error: { code: -32603, message: (e as Error).message } };
    }
  },
};