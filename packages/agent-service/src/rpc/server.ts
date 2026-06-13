import { Hono } from "hono";
import { handle } from "hono/bun";
import { RPCRequest, RPCResponse } from "./types";
import { methods } from "./methods";

const app = new Hono();

app.post("/rpc", async (c) => {
  const body = await c.req.json<RPCRequest>();
  const result = await methods.handle(body);
  return c.json(result);
});

app.get("/ws", (c) => {
  return handle(c, (ws) => {
    ws.on("message", async (data) => {
      try {
        const req = JSON.parse(data.toString()) as RPCRequest;
        const result = await methods.handle(req);
        ws.send(JSON.stringify(result));
      } catch (e) {
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      }
    });
  });
});

app.get("/sse/:runId", async (c) => {
  const runId = c.req.param("runId");
  return new Response(streamEvents(runId), {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" }
  });
});

async function* streamEvents(runId: string) {
  yield `data: ${JSON.stringify({ type: "connected", runId })}\n\n`;
}

export default app;