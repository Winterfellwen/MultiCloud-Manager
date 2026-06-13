export const config = {
  port: parseInt(process.env.PORT || "3001"),
  goBackendUrl: process.env.GO_BACKEND_URL || "http://localhost:8099",
  jwtSecret: process.env.JWT_SECRET || "",
  databaseUrl: process.env.DATABASE_URL || "",
  logLevel: process.env.LOG_LEVEL || "info",
};