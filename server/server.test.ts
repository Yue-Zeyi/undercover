import assert from 'node:assert/strict';
import { once } from 'node:events';
import { connect as connectTcp } from 'node:net';
import { test } from 'node:test';
import WebSocket from 'ws';
import type { ClientCommand, RoomView, ServerMessage, Session } from '../shared/protocol.js';
import { createGameServer } from './index.js';

class Client {
  messages: ServerMessage[] = [];
  constructor(public ws: WebSocket, public session: Session) {
    ws.on('message', (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
  }
  send(command: ClientCommand) { this.ws.send(JSON.stringify(command)); }
  state() { return this.messages.filter((m) => m.type === 'state').at(-1)?.state; }
  async waitFor(predicate: (state: RoomView) => boolean) {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      const state = this.state();
      if (state && predicate(state)) return state;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out; latest state: ${JSON.stringify(this.state())}`);
  }
}

test('real HTTP and four WebSocket clients complete a game, reconnect and restart', async (t) => {
  const app = createGameServer();
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = (app.server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}`;
  t.after(async () => app.close());
  assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { ok: true });
  const create = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '房主', avatar: 0, settings: { capacity: 4, undercoverCount: 1, category: 'food', turnSeconds: 60 } }) });
  assert.equal(create.status, 201);
  const host = await create.json() as Session;
  const sessions = [host];
  for (let i = 1; i < 4; i++) {
    const response = await fetch(`${url}/api/rooms/${host.roomCode}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: `玩家${i}`, avatar: i }) });
    assert.equal(response.status, 201);
    sessions.push(await response.json() as Session);
  }
  const connect = async (session: Session) => {
    const client = new Client(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${session.token}`), session);
    await once(client.ws, 'open');
    await client.waitFor((state) => state.players.some((p) => p.id === session.playerId && p.connected));
    return client;
  };
  const clients: Client[] = [];
  for (const session of sessions) clients.push(await connect(session));
  for (const client of clients.slice(1)) client.send({ type: 'ready', ready: true });
  await clients[0]!.waitFor((state) => state.players.every((p) => p.ready && p.connected));
  clients[0]!.send({ type: 'start' });
  await Promise.all(clients.map((client) => client.waitFor((state) => state.phase === 'reveal')));
  const words = clients.map((client) => client.state()!.word);
  assert.equal(new Set(words).size, 2);
  clients.forEach((client) => {
    assert.equal(client.state()!.reveal, undefined);
    assert.equal(client.state()!.words, undefined);
  });
  const savedWord = clients[2]!.state()!.word;
  clients[2]!.ws.close();
  await once(clients[2]!.ws, 'close');
  await clients[0]!.waitFor((state) => !state.players[2]!.connected);
  clients[2] = await connect(sessions[2]!);
  assert.equal(clients[2]!.state()!.word, savedWord);
  clients.forEach((client) => client.send({ type: 'reveal-ready' }));
  await clients[0]!.waitFor((state) => state.phase === 'speaking');
  for (let i = 0; i < 4; i++) {
    const speakerId = clients[0]!.state()!.speakerId;
    clients.find((client) => client.session.playerId === speakerId)!.send({ type: 'speak', text: `这是第 ${i + 1} 位玩家的描述` });
    await clients[0]!.waitFor((state) => state.speakerId !== speakerId);
  }
  assert.equal(clients[0]!.state()!.phase, 'voting');
  const minorityWord = words.find((word) => words.filter((other) => word === other).length === 1);
  const undercover = clients.find((client) => client.state()!.word === minorityWord)!;
  for (const client of clients) client.send({ type: 'vote', targetId: client === undercover ? clients.find((c) => c !== undercover)!.session.playerId : undercover.session.playerId });
  await Promise.all(clients.map((client) => client.waitFor((state) => state.phase === 'result')));
  assert.equal(clients[0]!.state()!.winner, 'civilian');
  assert.equal(clients[0]!.state()!.reveal?.length, 4);
  clients[0]!.send({ type: 'restart' });
  await Promise.all(clients.map((client) => client.waitFor((state) => state.phase === 'lobby')));
  assert.equal(clients[0]!.state()!.word, undefined);
  clients[3]!.send({ type: 'leave' });
  await once(clients[3]!.ws, 'close');
  assert.ok(clients[3]!.messages.some((message) => message.type === 'left'));
  await clients[0]!.waitFor((state) => state.players.length === 3);
  const revoked = new Client(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${sessions[3]!.token}`), sessions[3]!);
  await once(revoked.ws, 'close');
  assert.ok(revoked.messages.some((message) => message.type === 'error' && message.fatal));
});

test('network rejects malformed JSON, large bodies and invalid credentials', async (t) => {
  const app = createGameServer();
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = (app.server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}`;
  t.after(async () => app.close());
  for (const body of ['{', JSON.stringify({ nickname: 'a'.repeat(9000), avatar: 0 }), JSON.stringify({ nickname: '玩家', avatar: 0, settings: { capacity: 100 } })]) {
    const response = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json() as { message: string }).message, 'string');
  }
  const response = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '玩家', avatar: 0 }) });
  const session = await response.json() as Session;
  const client = new Client(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${session.token}`), session);
  await once(client.ws, 'open');
  await client.waitFor(() => true);
  client.ws.send('{');
  const [malformed] = await once(client.ws, 'message');
  assert.equal(JSON.parse(malformed.toString()).type, 'error');
  client.send({ type: 'ping' });
  const [pong] = await once(client.ws, 'message');
  assert.equal(JSON.parse(pong.toString()).type, 'pong');
  const invalid = new Client(new WebSocket(`ws://127.0.0.1:${port}/ws?token=invalid`), session);
  await once(invalid.ws, 'close');
  assert.ok(invalid.messages.some((message) => message.type === 'error' && message.fatal));
  const malformedUpgrade = connectTcp(port, '127.0.0.1');
  malformedUpgrade.setTimeout(500, () => malformedUpgrade.destroy());
  malformedUpgrade.on('data', () => {});
  await once(malformedUpgrade, 'connect');
  malformedUpgrade.write('GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
  await once(malformedUpgrade, 'close');
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
});

test('replacing a socket identifies the old session and preserves later reconnects', async (t) => {
  const app = createGameServer();
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = (app.server.address() as { port: number }).port;
  t.after(async () => app.close());
  const response = await fetch(`http://127.0.0.1:${port}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '房主', avatar: 0 }) });
  const session = await response.json() as Session;
  const connect = async () => {
    const client = new Client(new WebSocket(`ws://127.0.0.1:${port}/ws?token=${session.token}`), session);
    await once(client.ws, 'open');
    await client.waitFor((state) => state.selfId === session.playerId && state.players[0]!.connected);
    return client;
  };
  const first = await connect();
  const firstClosed = once(first.ws, 'close');
  const second = await connect();
  await firstClosed;
  assert.ok(first.messages.some((item) => item.type === 'error' && item.fatal && item.code === 'SESSION_REPLACED'));
  assert.equal(second.state()!.players.length, 1);
  const secondClosed = once(second.ws, 'close');
  const third = await connect();
  await secondClosed;
  assert.ok(second.messages.some((item) => item.type === 'error' && item.fatal && item.code === 'SESSION_REPLACED'));
  assert.equal(third.state()!.players.length, 1);
  assert.equal(third.state()!.players[0]!.connected, true);
  third.send({ type: 'ping' });
  const [pong] = await once(third.ws, 'message');
  assert.equal(JSON.parse(pong.toString()).type, 'pong');
});
