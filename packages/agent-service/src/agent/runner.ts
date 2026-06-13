export interface AgentConfig {
  model: string;
  goBackendUrl: string;
  jwtSecret: string;
}

export interface AgentRunInput {
  sessionId: string;
  message: string;
  mode: "plan" | "build" | "confirm";
  userRole: "admin" | "user" | "viewer";
  messages: Array<{ role: string; content: string; tool_calls?: any[] }>;
}

export type AgentEvent =
  | { type: "token"; content: string; runId: string }
  | { type: "reasoning"; content: string; runId: string }
  | { type: "tool_start"; tool: { name: string; args: any }; runId: string }
  | { type: "tool_result"; tool: { name: string; args: any }; result: string; runId: string }
  | { type: "done"; runId: string }
  | { type: "error"; error: string; runId: string };

export class AgentRunner {
  private agent: any;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.agent = null;
  }

  async start(input: AgentRunInput): Promise<string> {
    const runId = `run_${crypto.randomUUID()}`;
    // In real implementation, start the agent loop
    // For now, return the runId
    return runId;
  }

  async cancel(runId: string): Promise<void> {
    // Cancel the running agent
  }

  private buildTools() {
    return {
      "cloud.listResources": async (args: any) => this.callGo("listResources", args),
      "cloud.startInstance": async (args: any) => this.callGo("startInstance", args),
      "cloud.stopInstance": async (args: any) => this.callGo("stopInstance", args),
      "cloud.restartInstance": async (args: any) => this.callGo("restartInstance", args),
      "cloud.syncResources": async (args: any) => this.callGo("sync", args),
      "cloud.getCredentials": async (args: any) => this.callGo("getCredentials", args),
      "cloud.doRawRequest": async (args: any) => this.callGo("doRawRequest", args),
    };
  }

  private async callGo(method: string, args: any) {
    const res = await fetch(`${this.config.goBackendUrl}/internal/cloud/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.config.jwtSecret}` },
      body: JSON.stringify(args),
    });
    return res.json();
  }
}