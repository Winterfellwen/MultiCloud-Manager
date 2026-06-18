import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3004',
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://localhost:3001',
  monitorServiceUrl: process.env.MONITOR_SERVICE_URL || 'http://localhost:3002',
  aiAgentUrl: process.env.AI_AGENT_URL || 'http://localhost:3003',
  jwtSecret: process.env.JWT_SECRET!,
};