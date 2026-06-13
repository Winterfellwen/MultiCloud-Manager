import app from "./rpc/server";
import { config } from "./config";

const server = {
  fetch: app.fetch,
  port: config.port,
};

export default server;

console.log(`Agent service running on port ${config.port}`);