import { WebSocket } from "ws";

export function createWebSocketServer(port: number) {
  const wss = new WebSocket.Server({ port });

  wss.on("connection", (ws, req) => {
    ws.on("message", async (data) => {
      // Handle WebSocket messages
    });
  });

  return wss;
}