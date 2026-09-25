// Health Check + Metrics HTTP Server (lightweight, no external deps)

import http from 'http';
import { query } from '../db/postgres-client';
import logger from './logger';

const PORT = parseInt(process.env.HEALTH_PORT || '9090');
let startTime = Date.now();

export function startHealthServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/health') {
        let dbOk = false;
        try { await query('SELECT 1'); dbOk = true; } catch {}
        const status = dbOk ? 'healthy' : 'degraded';
        res.writeHead(dbOk ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status, database: dbOk ? 'ok' : 'error', uptime: (Date.now() - startTime) / 1000 }));
      } else if (req.url === '/ready') {
        try { await query('SELECT 1'); res.writeHead(200); res.end('{"ready":true}'); }
        catch { res.writeHead(503); res.end('{"ready":false}'); }
      } else {
        res.writeHead(404); res.end('Not Found');
      }
    } catch (err: any) {
      res.writeHead(500); res.end(`Error: ${err.message}`);
    }
  });

  server.listen(PORT, () => { logger.info(`Health server on port ${PORT}`); });
  return server;
}
