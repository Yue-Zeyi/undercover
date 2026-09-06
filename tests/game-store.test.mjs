import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useGameStore } from '../src/stores/game.ts';

const session = { token: 'opaque-token', playerId: 'player-one', roomCode: '123456' };
const snapshot = {
  code: '123456', hostId: 'player-one', selfId: 'player-one',
  settings: { capacity: 6, undercoverCount: 1, category: 'all', turnSeconds: 60 },
  phase: 'lobby', round: 0, players: [], messages: [], voteCandidates: [],
};
let storage;
let sockets;
let store;
let stores;

beforeEach(() => {
  storage = new Map();
  sockets = [];
  globalThis.location = { origin: 'http://localhost:5173' };
  globalThis.uni = {
    getStorageSync(key) { return storage.get(key); },
    setStorageSync(key, value) { storage.set(key, value); },
    removeStorageSync(key) { storage.delete(key); },
    request({ success }) { success({ statusCode: 201, data: session }); },
    connectSocket() {
      const handlers = {};
      const socket = {
        sent: [],
        onOpen(callback) { handlers.open = callback; },
        onMessage(callback) { handlers.message = callback; },
        onClose(callback) { handlers.close = callback; },
        onError(callback) { handlers.error = callback; },
        send({ data }) { this.sent.push(JSON.parse(data)); },
        close() { handlers.close?.({ code: 1000 }); },
        open() { handlers.open?.({}); },
        message(value) { handlers.message?.({ data: JSON.stringify(value) }); },
        drop() { handlers.close?.({ code: 1006 }); },
      };
      sockets.push(socket);
      return socket;
    },
  };
  setActivePinia(createPinia());
  store = useGameStore();
  stores = [store];
});

afterEach(() => {
  for (const current of stores) current.disconnectForBackground();
  delete globalThis.uni;
  delete globalThis.location;
});

test('room creation persists the server credential and waits for the player snapshot', async () => {
  await store.createRoom('测试玩家', 0, snapshot.settings);
  assert.equal(store.session.token, 'opaque-token');
  assert.equal(storage.get('wodi-session-v1').token, 'opaque-token');
  assert.equal(store.room, null);
  assert.equal(store.busy, true);
  sockets[0].open();
  sockets[0].message({ type: 'state', state: snapshot });
  assert.equal(store.room.selfId, 'player-one');
  assert.equal(store.status, 'connected');
  assert.equal(store.busy, false);
});

test('leaving retains credentials and room until the server acknowledges removal', () => {
  storage.set('wodi-session-v1', session);
  store.restore();
  sockets[0].open();
  sockets[0].message({ type: 'state', state: snapshot });
  store.leave();
  assert.equal(store.room.code, '123456');
  assert.equal(store.session.token, 'opaque-token');
  assert.equal(storage.get('wodi-session-v1').pendingLeave, true);
  assert.deepEqual(sockets[0].sent.at(-1), { type: 'leave' });
  sockets[0].message({ type: 'left' });
  assert.equal(store.room, null);
  assert.equal(store.session, null);
  assert.equal(storage.has('wodi-session-v1'), false);
});

test('restored pending leave is sent after synchronization and a revoked token clears it', () => {
  storage.set('wodi-session-v1', { ...session, pendingLeave: true });
  store.restore();
  store.restore();
  assert.equal(sockets.length, 1);
  assert.equal(store.busy, true);
  sockets[0].open();
  assert.deepEqual(sockets[0].sent, []);
  sockets[0].message({ type: 'state', state: snapshot });
  assert.deepEqual(sockets[0].sent.at(-1), { type: 'leave' });
  sockets[0].message({ type: 'error', message: '房间已结束', fatal: true });
  assert.equal(store.session, null);
  assert.equal(store.room, null);
  assert.equal(store.error, '房间已结束');
  assert.equal(store.status, 'idle');
  assert.equal(storage.has('wodi-session-v1'), false);
});

test('background resume preserves the seat and opens exactly one fresh connection', () => {
  storage.set('wodi-session-v1', session);
  store.restore();
  sockets[0].open();
  sockets[0].message({ type: 'state', state: snapshot });
  store.disconnectForBackground();
  assert.equal(store.room.code, '123456');
  assert.equal(store.status, 'idle');
  store.restore();
  store.restore();
  assert.equal(sockets.length, 2);
  assert.equal(store.session.token, 'opaque-token');
  assert.equal(store.status, 'connecting');
});

test('a replaced tab preserves shared credentials so the new tab can restore after refresh', () => {
  storage.set('wodi-session-v1', session);
  store.restore();
  sockets[0].open();
  sockets[0].message({ type: 'state', state: snapshot });
  const newTab = useGameStore(createPinia());
  stores.push(newTab);
  newTab.restore();
  sockets[1].open();
  sockets[1].message({ type: 'state', state: snapshot });

  sockets[0].message({ type: 'error', fatal: true, code: 'SESSION_REPLACED', message: '会话已在其他页面恢复' });

  assert.equal(store.session, null);
  assert.equal(store.room, null);
  assert.equal(store.status, 'idle');
  assert.equal(storage.get('wodi-session-v1')?.token, 'opaque-token');
  assert.equal(newTab.session.token, 'opaque-token');
  newTab.disconnectForBackground();
  const refreshedTab = useGameStore(createPinia());
  stores.push(refreshedTab);
  refreshedTab.restore();
  assert.equal(refreshedTab.session?.token, 'opaque-token');
  assert.equal(refreshedTab.status, 'connecting');
  assert.equal(sockets.length, 3);
});

for (const message of [{ type: 'left' }, { type: 'error', fatal: true, message: '房间已结束' }]) {
  test(`an old tab's ${message.type} response cannot remove a newer saved session`, () => {
    storage.set('wodi-session-v1', session);
    store.restore();
    sockets[0].open();
    sockets[0].message({ type: 'state', state: snapshot });
    storage.set('wodi-session-v1', { token: 'new-token', playerId: 'player-two', roomCode: '654321' });
    const newTab = useGameStore(createPinia());
    stores.push(newTab);
    newTab.restore();

    sockets[0].message(message);

    assert.equal(store.session, null);
    assert.equal(storage.get('wodi-session-v1')?.token, 'new-token');
    assert.equal(newTab.session.token, 'new-token');
    newTab.disconnectForBackground();
    const refreshedTab = useGameStore(createPinia());
    stores.push(refreshedTab);
    refreshedTab.restore();
    assert.equal(refreshedTab.session?.token, 'new-token');
  });
}

function presenceSnapshot(away, extra = {}) {
  return { ...snapshot, players: [{ id: session.playerId, connected: true, ready: !away, away }], ...extra };
}

test('going home keeps the connected seat and credential while requesting away presence', () => {
  storage.set('wodi-session-v1', session);
  store.restore();
  sockets[0].open();
  sockets[0].message({ type: 'state', state: presenceSnapshot(false) });

  store.goHome();

  assert.equal(store.atHome, true);
  assert.equal(store.room.code, '123456');
  assert.equal(store.session.token, 'opaque-token');
  assert.equal(store.status, 'connected');
  assert.equal(storage.get('wodi-session-v1').atHome, true);
  assert.equal(storage.get('wodi-session-v1').pendingLeave, false);
  assert.deepEqual(sockets[0].sent.at(-1), { type: 'away', away: true });
});

test('refreshing a parked session stays on the homepage and synchronizes away presence', () => {
  storage.set('wodi-session-v1', { ...session, atHome: true });
  store.restore();
  assert.equal(store.atHome, true);
  sockets[0].open();
  sockets[0].message({ type: 'state', state: presenceSnapshot(false) });
  assert.deepEqual(sockets[0].sent.at(-1), { type: 'away', away: true });
  const count = sockets[0].sent.length;
  sockets[0].message({ type: 'state', state: presenceSnapshot(true) });
  assert.equal(sockets[0].sent.length, count);
  assert.equal(store.atHome, true);
});

test('returning to the room restores presence in the original game without rejoining or changing its word', () => {
  storage.set('wodi-session-v1', { ...session, atHome: true });
  store.restore();
  sockets[0].open();
  sockets[0].message({ type: 'state', state: presenceSnapshot(true, { phase: 'speaking', word: '测试词' }) });

  store.returnToRoom();

  assert.equal(store.atHome, false);
  assert.equal(storage.get('wodi-session-v1').atHome, false);
  assert.deepEqual(sockets[0].sent.at(-1), { type: 'away', away: false });
  assert.equal(store.room.word, '测试词');
  assert.equal(store.room.selfId, session.playerId);
  assert.equal(sockets.length, 1);
  assert.equal(store.session.token, session.token);
});

test('home navigation while disconnected is reconciled after the connection recovers', () => {
  storage.set('wodi-session-v1', session);
  store.restore();
  sockets[0].open();
  sockets[0].message({ type: 'state', state: presenceSnapshot(false) });
  store.disconnectForBackground();

  store.goHome();
  store.restore();
  assert.equal(store.atHome, true);
  sockets[1].open();
  sockets[1].message({ type: 'state', state: presenceSnapshot(false) });
  assert.deepEqual(sockets[1].sent.at(-1), { type: 'away', away: true });
  assert.equal(store.session.token, session.token);
});

test('an explicit leave from the homepage wins over presence synchronization and clears the saved room', () => {
  storage.set('wodi-session-v1', { ...session, atHome: true });
  store.restore();
  sockets[0].open();
  sockets[0].message({ type: 'state', state: presenceSnapshot(true) });
  store.leave();
  const count = sockets[0].sent.length;
  store.returnToRoom();
  assert.equal(sockets[0].sent.length, count);
  sockets[0].message({ type: 'state', state: presenceSnapshot(false) });
  assert.deepEqual(sockets[0].sent.at(-1), { type: 'leave' });
  sockets[0].message({ type: 'left' });
  assert.equal(store.session, null);
  assert.equal(store.room, null);
  assert.equal(storage.has('wodi-session-v1'), false);
  assert.equal(store.atHome, false);
});
