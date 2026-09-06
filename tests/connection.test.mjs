import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { GameConnection } from '../src/services/connection.ts';

let sockets;
let connection;

beforeEach(() => {
  sockets = [];
  globalThis.location = { origin: 'http://localhost:5173' };
  globalThis.uni = {
    connectSocket({ url }) {
      const handlers = {};
      const socket = {
        url, sent: [], closed: false,
        onOpen(callback) { handlers.open = callback; },
        onMessage(callback) { handlers.message = callback; },
        onClose(callback) { handlers.close = callback; },
        onError(callback) { handlers.error = callback; },
        send({ data }) { this.sent.push(JSON.parse(data)); },
        close() { this.closed = true; handlers.close?.({ code: 1000 }); },
        open() { handlers.open?.({}); },
        message(value) { handlers.message?.({ data: JSON.stringify(value) }); },
        drop() { handlers.close?.({ code: 1006 }); },
      };
      sockets.push(socket);
      return socket;
    },
  };
});

afterEach(() => {
  connection?.stop();
  delete globalThis.uni;
  delete globalThis.location;
});

test('does not allow game commands until the authoritative snapshot arrives', () => {
  const statuses = [];
  connection = new GameConnection({ onStatus: value => statuses.push(value), onMessage() {}, onError() {} });
  connection.start('private-token');
  sockets[0].open();
  assert.equal(statuses.at(-1), 'connecting');
  assert.equal(connection.send({ type: 'start' }), false);
  sockets[0].message({ type: 'state', state: { code: '123456' } });
  assert.equal(statuses.at(-1), 'connected');
  assert.equal(connection.send({ type: 'start' }), true);
  assert.deepEqual(sockets[0].sent.at(-1), { type: 'start' });
});

test('duplicate restore does not open sockets and old callbacks cannot overwrite a reconnect', () => {
  const messages = [];
  connection = new GameConnection({ onStatus() {}, onMessage: message => messages.push(message), onError() {} });
  connection.start('same-token');
  connection.start('same-token');
  assert.equal(sockets.length, 1);
  connection.reconnect('same-token');
  assert.equal(sockets.length, 2);
  sockets[0].message({ type: 'error', message: 'Old session', fatal: true });
  sockets[0].drop();
  assert.deepEqual(messages, []);
  sockets[1].open();
  sockets[1].message({ type: 'state', state: { code: '654321' } });
  assert.equal(messages.at(-1).state.code, '654321');
});

test('lost connections reconnect and still wait for a new snapshot', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const statuses = [];
  connection = new GameConnection({ onStatus: value => statuses.push(value), onMessage() {}, onError() {} });
  connection.start('token');
  sockets[0].open();
  sockets[0].message({ type: 'state', state: { code: '123456' } });
  sockets[0].drop();
  assert.equal(statuses.at(-1), 'reconnecting');
  assert.equal(connection.send({ type: 'vote', targetId: 'other' }), false);
  context.mock.timers.tick(1000);
  assert.equal(sockets.length, 2);
  sockets[1].open();
  assert.equal(statuses.at(-1), 'reconnecting');
  sockets[1].message({ type: 'state', state: { code: '123456' } });
  assert.equal(statuses.at(-1), 'connected');
});

test('a silent socket is replaced when the heartbeat deadline expires', context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const statuses = [];
  connection = new GameConnection({ onStatus: value => statuses.push(value), onMessage() {}, onError() {} });
  connection.start('token');
  sockets[0].open();
  sockets[0].message({ type: 'state', state: { code: '123456' } });
  context.mock.timers.tick(45000);
  assert.equal(sockets[0].closed, true);
  assert.equal(statuses.at(-1), 'reconnecting');
});
