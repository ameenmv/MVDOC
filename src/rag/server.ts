import http from 'node:http';
import { askQuestion, type ChatMessage } from './chat.js';
import { logger } from '../utils/logger.js';

/**
 * RAG API Server
 * Local HTTP server providing the chat API for the VitePress ChatWidget
 */

export function startRAGServer(
  docsDir: string,
  apiKey: string,
  model: string = 'gemini-2.0-flash',
  port: number = 3456
): http.Server {
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
      try {
        const body = await readBody(req);
        const { question, history } = JSON.parse(body) as {
          question: string;
          history?: ChatMessage[];
        };

        if (!question) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Question is required' }));
          return;
        }

        const response = await askQuestion(question, docsDir, apiKey, {
          model,
          history,
          topK: 5,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (err) {
        logger.debug(`Chat API error: ${err}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', indexed: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, () => {
    logger.success(`RAG chat server running at http://localhost:${port}`);
    logger.info(`  POST /api/chat — Ask a question`);
    logger.info(`  GET  /api/health — Health check`);
  });

  return server;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
