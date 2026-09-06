import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMessage } from '../shared/protocol.js';
import { GameEngine } from './engine.js';
import { getWordCatalog } from './words.js';
import { AdminStore } from './admin-store.js';

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage, maxSize = 8192): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('请求须使用 JSON 格式');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxSize) throw new Error('请求内容过长');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('JSON 格式不正确'); }
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function message(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export function createGameServer() {
  const adminStore = new AdminStore();
  const game = new GameEngine({ wordPairs: () => adminStore.getWordPairs() });
  const adminTokens = new Map<string, number>();
  const adminUsername = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const isAdmin = (request: IncomingMessage) => {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const expiresAt = adminTokens.get(token);
    if (!token || !expiresAt || expiresAt <= Date.now()) return false;
    adminTokens.set(token, Date.now() + 12 * 60 * 60 * 1000);
    return true;
  };
  const sockets = new Map<string, { socket: WebSocket; roomCode: string }>();
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && pathname === '/api/health') return json(response, 200, { ok: true });
      if (request.method === 'GET' && pathname === '/api/catalog') return json(response, 200, getWordCatalog(adminStore.getWordPairs()));
      if (request.method === 'GET' && pathname === '/api/config') return json(response, 200, adminStore.getConfig());
      if (request.method === 'POST' && pathname === '/api/admin/login') {
        const input = await body(request);
        const username = input && typeof input === 'object' ? (input as { username?: unknown }).username : undefined;
        const password = input && typeof input === 'object' ? (input as { password?: unknown }).password : undefined;
        if (!adminPassword || username !== adminUsername || password !== adminPassword) return json(response, 401, { message: '管理员账号或密码错误' });
        const token = randomBytes(24).toString('hex');
        adminTokens.set(token, Date.now() + 12 * 60 * 60 * 1000);
        return json(response, 200, { token, expiresIn: 12 * 60 * 60 });
      }
      if (pathname.startsWith('/api/admin/')) {
        if (!isAdmin(request)) return json(response, 401, { message: '请先登录管理后台' });
        if (request.method === 'GET' && pathname === '/api/admin/config') return json(response, 200, adminStore.getConfig());
        if (request.method === 'PUT' && pathname === '/api/admin/config') return json(response, 200, adminStore.updateConfig(await body(request)));
        if (request.method === 'GET' && pathname === '/api/admin/words') return json(response, 200, adminStore.listWords());
        if (request.method === 'POST' && pathname === '/api/admin/words') return json(response, 201, adminStore.upsertWord(await body(request, 32_000)));
        const wordPath = /^\/api\/admin\/words\/([^/]+)$/.exec(pathname);
        if (wordPath && request.method === 'PUT') return json(response, 200, adminStore.upsertWord(await body(request, 32_000), decodeURIComponent(wordPath[1]!)));
        if (wordPath && request.method === 'DELETE') { adminStore.removeWord(decodeURIComponent(wordPath[1]!)); return json(response, 200, { ok: true }); }
      }
      if (request.method === 'POST' && pathname === '/api/rooms') return json(response, 201, game.create(await body(request)));
      const join = /^\/api\/rooms\/(\d{6})\/join$/.exec(pathname);
      if (request.method === 'POST' && join) return json(response, 201, game.join(join[1]!, await body(request)));
      json(response, 404, { message: '接口不存在' });
    } catch (error) {
      if (!response.headersSent) json(response, 400, { message: message(error) });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== '/ws') { socket.destroy(); return; }
      wss.handleUpgrade(request, socket, head, (client) => wss.emit('connection', client, request));
    } catch { socket.destroy(); }
  });

  const pending = new Set<string>();
  game.onChange = (code) => {
    if (pending.has(code)) return;
    pending.add(code);
    queueMicrotask(() => {
      pending.delete(code);
      for (const [token, entry] of sockets) {
        if (entry.roomCode !== code) continue;
        try { send(entry.socket, { type: 'state', state: game.view(token) }); }
        catch (error) { send(entry.socket, { type: 'error', message: message(error), fatal: true }); entry.socket.close(4000); }
      }
    });
  };

  wss.on('connection', (socket, request) => {
    const token = new URL(request.url ?? '/', 'http://localhost').searchParams.get('token') ?? '';
    // Protocol errors must not become unhandled process errors.
    socket.on('error', () => socket.terminate());
    try {
      const state = game.view(token);
      const previous = sockets.get(token);
      if (previous) {
        send(previous.socket, { type: 'error', message: '此玩家已在其他页面连接', fatal: true, code: 'SESSION_REPLACED' });
        previous.socket.close(4001);
      }
      sockets.set(token, { socket, roomCode: state.code });
      game.connect(token);
    } catch (error) {
      if (sockets.get(token)?.socket === socket) {
        sockets.delete(token);
        game.disconnect(token);
      }
      send(socket, { type: 'error', message: message(error), fatal: true });
      socket.close(4000);
      return;
    }

    let windowStart = Date.now();
    let requestCount = 0;
    socket.on('message', (data, binary) => {
      if (sockets.get(token)?.socket !== socket) return;
      try {
        if (Date.now() - windowStart > 10_000) { windowStart = Date.now(); requestCount = 0; }
        if (++requestCount > 60) throw new Error('操作过于频繁，请稍后重试');
        if (binary) throw new Error('请求须使用 JSON 文本');
        let action: unknown;
        try { action = JSON.parse(data.toString()); }
        catch { throw new Error('JSON 格式不正确'); }
        const result = game.command(token, action);
        if (result === 'pong') send(socket, { type: 'pong' });
        if (result === 'left') {
          sockets.delete(token);
          send(socket, { type: 'left' });
          socket.close(1000);
        }
      } catch (error) {
        send(socket, { type: 'error', message: message(error) });
      }
    });
    socket.on('close', () => {
      if (sockets.get(token)?.socket !== socket) return;
      sockets.delete(token);
      game.disconnect(token);
    });
  });

  const tick = setInterval(() => game.tick(), 250);
  tick.unref();
  const alive = new WeakSet<WebSocket>();
  wss.on('connection', (socket) => { alive.add(socket); socket.on('pong', () => alive.add(socket)); });
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) { socket.terminate(); continue; }
      alive.delete(socket);
      socket.ping();
    }
  }, 20_000);
  heartbeat.unref();

  const close = async () => {
    clearInterval(tick); clearInterval(heartbeat);
    for (const socket of wss.clients) socket.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  };
  return { server, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createGameServer();
  const port = Number(process.env.PORT ?? 3001);
  app.server.listen(port, '0.0.0.0', () => console.log(`Game server listening on http://0.0.0.0:${port}`));
  const shutdown = () => { void app.close().then(() => process.exit(0)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
