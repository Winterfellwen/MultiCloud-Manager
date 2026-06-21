module.exports = {
  apps: [
    {
      name: 'auth-service',
      script: './auth-service/dist/index.js',
      cwd: '/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
      },
    },
    {
      name: 'api-gateway',
      script: './api-gateway/dist/index.js',
      cwd: '/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'cloud-service',
      script: './cloud-service/dist/index.js',
      cwd: '/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'monitor-service',
      script: './monitor-service/dist/index.js',
      cwd: '/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
    {
      name: 'ai-agent',
      script: './ai-agent/dist/index.js',
      cwd: '/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
    },
    {
      name: 'ai-gateway',
      script: './ai-gateway/dist/index.js',
      cwd: '/app',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
        CLOUD_SERVICE_URL: process.env.CLOUD_SERVICE_URL || 'http://localhost:3001',
        MONITOR_SERVICE_URL: process.env.MONITOR_SERVICE_URL || 'http://localhost:3002',
      },
    },
  ],
};
