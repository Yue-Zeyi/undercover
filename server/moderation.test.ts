import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Session } from '../shared/protocol.js';
import { GameEngine } from './engine.js';

function activeGame() {
  let now = 1_000;
  const game = new GameEngine({ now: () => now, random: () => 0 });
  const host = game.create({ nickname: '房主', avatar: 0, settings: { capacity: 4, undercoverCount: 1, category: 'daily', difficulty: 'normal', turnSeconds: 60 } });
  const sessions: Session[] = [host];
  for (let index = 1; index < 4; index++) sessions.push(game.join(host.roomCode, { nickname: `玩家${index}`, avatar: index }));
  sessions.forEach((session) => game.connect(session.token));
  sessions.slice(1).forEach((session) => game.command(session.token, { type: 'ready', ready: true }));
  game.command(host.token, { type: 'start' });
  sessions.forEach((session) => game.command(session.token, { type: 'reveal-ready' }));
  return { game, sessions, state: () => game.view(host.token), now: (value: number) => { now = value; } };
}

test('early end request passes at half of active voters and enters result', () => {
  const { game, sessions, state } = activeGame();
  game.command(sessions[0]!.token, { type: 'request-end' });
  assert.equal(state().earlyEndRequest?.required, 2);
  assert.deepEqual(state().earlyEndRequest?.approvedIds, [sessions[0]!.playerId]);
  game.command(sessions[1]!.token, { type: 'vote-end', approve: true });
  assert.equal(state().phase, 'result');
  assert.equal(state().endedEarly, true);
  assert.equal(state().resultReason, 'early-end');
});

test('kick request excludes target and revokes the removed player credential', () => {
  const { game, sessions, state } = activeGame();
  game.command(sessions[0]!.token, { type: 'request-kick', targetId: sessions[1]!.playerId });
  assert.equal(state().kickRequest?.required, 2);
  assert.equal(state().kickRequest?.eligibleIds.includes(sessions[1]!.playerId), false);
  assert.throws(() => game.command(sessions[1]!.token, { type: 'vote-kick', agree: true }), /不可参与/);
  game.command(sessions[2]!.token, { type: 'vote-kick', agree: true });
  assert.equal(state().players.find((player) => player.id === sessions[1]!.playerId)?.kicked, true);
  assert.equal(state().players.find((player) => player.id === sessions[1]!.playerId)?.alive, false);
  assert.throws(() => game.view(sessions[1]!.token), /失效/);
});
