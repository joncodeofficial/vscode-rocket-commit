import { createServer, Server } from 'http';
import * as vscode from 'vscode';
import { HTTP_SERVER_PORT } from '../constants/config.mjs';
import { ask, generateCommit, getModelName } from './modelService.mjs';

let httpServer: Server | null = null;

export function startServer(): void {
  console.log('[LibreCommit] Iniciando servidor HTTP...');

  httpServer = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/ask' && req.method === 'POST') {
      await handleAskRequest(req, res);
    } else if (req.url === '/commit' && req.method === 'POST') {
      await handleCommitRequest(req, res);
    } else if (req.url === '/health') {
      handleHealthRequest(res);
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  httpServer.listen(HTTP_SERVER_PORT, () => {
    console.log(`[LibreCommit] Servidor HTTP escuchando en puerto ${HTTP_SERVER_PORT}`);
  });
}

export function stopServer(): void {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

async function handleAskRequest(req: any, res: any): Promise<void> {
  let body = '';
  req.on('data', (chunk: any) => (body += chunk));
  req.on('end', async () => {
    try {
      const { question } = JSON.parse(body);
      if (!question) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Requiere "question"' }));
        return;
      }

      console.log('[LibreCommit] Pregunta recibida:', question);
      const start = Date.now();
      const answer = await ask(question);
      const time = ((Date.now() - start) / 1000).toFixed(2);

      console.log('[LibreCommit] Respuesta generada en', time, 's');
      res.end(
        JSON.stringify({
          answer,
          model: getModelName(),
          time: `${time}s`,
        })
      );
    } catch (error: unknown) {
      console.error('[LibreCommit] Error en /ask:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  });
}

async function handleCommitRequest(req: any, res: any): Promise<void> {
  let body = '';
  req.on('data', (chunk: any) => (body += chunk));
  req.on('end', async () => {
    try {
      const { diff } = JSON.parse(body);
      if (!diff) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Requiere "diff"' }));
        return;
      }

      console.log('[LibreCommit] Generando commit para diff de', diff.length, 'caracteres');
      const start = Date.now();
      const message = await generateCommit(diff);
      const time = ((Date.now() - start) / 1000).toFixed(2);

      console.log('[LibreCommit] Commit generado en', time, 's:', message);
      res.end(
        JSON.stringify({
          message,
          model: getModelName(),
          time: `${time}s`,
        })
      );
    } catch (error: unknown) {
      console.error('[LibreCommit] Error en /commit:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: (error as Error).message }));
    }
  });
}

function handleHealthRequest(res: any): void {
  res.end(
    JSON.stringify({
      status: 'ok',
      modelLoaded: true,
    })
  );
}
