import type { Request, Response } from 'express';
import { config } from '../config';
import { proxyAuthMiddleware, forwardAuthHeader } from '../middleware/auth';

interface ProxyRoute {
  prefix: string;
  target: string;
  requireAuth: boolean;
}

const routes: ProxyRoute[] = [
  { prefix: '/auth', target: config.authServiceUrl, requireAuth: false },
  { prefix: '/users', target: config.authServiceUrl, requireAuth: true },
  { prefix: '/audit', target: config.authServiceUrl, requireAuth: true },
  { prefix: '/cloud', target: config.cloudServiceUrl, requireAuth: true },
  { prefix: '/monitor', target: config.monitorServiceUrl, requireAuth: true },
  { prefix: '/ai', target: config.aiAgentUrl, requireAuth: true },
];

function buildTargetUrl(target: string, requestUrl: string): string {
  const url = new URL(target);
  url.pathname = requestUrl;
  return url.toString();
}

async function proxyRequest(req: Request, res: Response, target: string) {
  const targetUrl = buildTargetUrl(target, req.originalUrl || req.url);
  
  const headers: Record<string, string> = {
    'Content-Type': req.headers['content-type'] || 'application/json',
  };

  const forwardedAuth = (req as any).forwardedAuth;
  if (forwardedAuth) {
    headers['Authorization'] = forwardedAuth;
  }

  const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) 
    ? JSON.stringify(req.body) 
    : undefined;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));
    
    res.status(response.status);
    Object.entries(response.headers).forEach(([key, value]) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });
    res.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({
        error: 'GATEWAY_TIMEOUT',
        message: 'Upstream service timeout',
      });
    }
    console.error('Proxy error:', error);
    res.status(502).json({
      error: 'BAD_GATEWAY',
      message: 'Failed to reach upstream service',
    });
  }
}

export function proxyRoutes(app: any) {
  app.use(forwardAuthHeader);

  for (const route of routes) {
    const handler = [
      proxyAuthMiddleware({ required: route.requireAuth }),
      (req: Request, res: Response) => proxyRequest(req, res, route.target),
    ];

    app.all(`${route.prefix}/*`, ...handler);
    app.all(`${route.prefix}`, ...handler);
  }
}