import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameEngine } from './engine.js';

function setup(count = 6) {
  let now = 10_000;
  const game = new GameEngine({ now: () => now, random: () => 0 });
  const host = game.create({ nickname: 'Host', avatar: 0, settings: { capacity: count, undercoverCount: 1, category: 'daily', turnSeconds: 60 } });
  const sessions = [host];
  for (let i = 1; i < count; i++) sessions.push(game.join(host.roomCode, { nickname: `Player ${i}`, avatar: i % 8 }));
  sessions.forEach((session) => game.connect(session.token));
  const state = () => game.view(host.token);
  const elapse = (ms: number) => { now += ms; };
  const start = () => {
    sessions.slice(1).forEach((session) => game.command(session.token, { type: 'ready', ready: true }));
    game.command(host.token, { type: 'start' });
  };
  const reveal = () => sessions.forEach((session) => game.command(session.token, { type: 'reveal-ready' }));
  const finishSpeeches = () => {
    while (state().phase === 'speaking') {
      const speaker = sessions.find((session) => session.playerId === state().speakerId)!;
      game.command(speaker.token, { type: 'speak', text: 'A description' });
    }
  };
  return { game, host, sessions, state, elapse, start, reveal, finishSpeeches };
}

test('lobby disconnects keep their seat for two minutes, then expire without losing connected players', () => {
  const f = setup(4);
  const departed = f.sessions[3]!;
  f.game.disconnect(departed.token);
  f.elapse(119_999); f.game.tick();
  assert.equal(f.state().players.length, 4);
  f.elapse(1); f.game.tick();
  assert.equal(f.state().players.length, 3);
  assert.throws(() => f.game.connect(departed.token), /失效/);
  assert.equal(f.state().players.every((player) => player.connected), true);
});

test('reconnecting during the grace period cancels lobby seat expiration', () => {
  const f = setup(4);
  const player = f.sessions[3]!;
  f.game.disconnect(player.token);
  f.elapse(119_999);
  f.game.connect(player.token);
  f.elapse(120_000); f.game.tick();
  assert.equal(f.state().players.length, 4);
  assert.equal(f.game.view(player.token).selfId, player.playerId);
});

test('reconnecting after the grace period cannot recover an expired lobby reservation', () => {
  const f = setup(4);
  const player = f.sessions[3]!;
  f.game.disconnect(player.token);
  f.elapse(120_000);
  assert.throws(() => f.game.connect(player.token), /失效/);
  assert.equal(f.state().players.length, 3);
});

test('joining reclaims never-connected reservations before reporting a full room', () => {
  const f = setup(4);
  f.game.command(f.sessions[3]!.token, { type: 'leave' });
  const abandoned = f.game.join(f.host.roomCode, { nickname: 'Abandoned', avatar: 4 });
  f.elapse(120_000);
  const replacement = f.game.join(f.host.roomCode, { nickname: 'Replacement', avatar: 5 });
  assert.equal(f.state().players.length, 4);
  assert.equal(f.game.view(replacement.token).selfId, replacement.playerId);
  assert.throws(() => f.game.view(abandoned.token), /失效/);
});

test('starting reclaims expired lobby seats before checking readiness', () => {
  const f = setup(5);
  f.sessions.slice(1).forEach((session) => f.game.command(session.token, { type: 'ready', ready: true }));
  f.game.disconnect(f.sessions[4]!.token);
  f.elapse(120_000);
  f.game.command(f.host.token, { type: 'start' });
  assert.equal(f.state().phase, 'reveal');
  assert.equal(f.state().players.length, 4);
});

test('expired hosts transfer ownership to remaining reservations and empty lobbies disappear', () => {
  let now = 0;
  const game = new GameEngine({ now: () => now });
  const host = game.create({ nickname: 'Host', avatar: 0 });
  now = 60_000;
  const next = game.join(host.roomCode, { nickname: 'Next', avatar: 1 });
  now = 120_000; game.tick();
  assert.throws(() => game.view(host.token), /失效/);
  assert.equal(game.view(next.token).hostId, next.playerId);
  now = 180_000; game.tick();
  assert.throws(() => game.view(next.token), /失效/);
  assert.throws(() => game.join(host.roomCode, { nickname: 'Late', avatar: 2 }), /不存在/);
});

test('active disconnects retain their word until restart removes expired lobby seats', () => {
  const f = setup(6);
  f.start(); f.reveal();
  const disconnected = f.sessions[5]!;
  const secret = f.game.view(disconnected.token).word;
  f.game.disconnect(disconnected.token);
  f.elapse(120_000); f.game.tick();
  assert.equal(f.game.view(disconnected.token).word, secret);
  assert.equal(f.state().players.length, 6);
  const undercover = f.sessions.find((session) => f.sessions.filter((other) => f.game.view(other.token).word === f.game.view(session.token).word).length === 1)!;
  f.game.command(undercover.token, { type: 'leave' });
  assert.equal(f.state().phase, 'result');
  assert.equal(f.game.view(disconnected.token).word, secret);
  f.game.command(f.host.token, { type: 'restart' });
  assert.equal(f.state().phase, 'lobby');
  assert.equal(f.state().players.length, 4);
  assert.throws(() => f.game.view(disconnected.token), /失效/);
});

test('votes for departing candidates can be recast while other votes remain valid', () => {
  const f = setup(6);
  f.start(); f.reveal(); f.finishSpeeches();
  const [host, target, departed, voter, other] = f.sessions;
  f.game.command(host!.token, { type: 'vote', targetId: departed!.playerId });
  f.game.command(voter!.token, { type: 'vote', targetId: departed!.playerId });
  f.game.command(other!.token, { type: 'vote', targetId: target!.playerId });
  f.game.command(departed!.token, { type: 'leave' });
  assert.equal(f.state().phase, 'voting');
  assert.equal(f.state().players.find((player) => player.id === host!.playerId)?.hasVoted, false);
  assert.equal(f.state().players.find((player) => player.id === voter!.playerId)?.hasVoted, false);
  assert.equal(f.state().players.find((player) => player.id === other!.playerId)?.hasVoted, true);
  f.game.command(host!.token, { type: 'vote', targetId: target!.playerId });
  f.game.command(voter!.token, { type: 'vote', targetId: target!.playerId });
  f.elapse(45_000); f.game.tick();
  assert.equal(f.state().lastVote?.counts[target!.playerId], 3);
  assert.equal(f.state().lastVote?.counts[departed!.playerId], undefined);
});

test('an expired reveal confirmation advances the round but does not acknowledge the old stage', () => {
  const f = setup(4);
  f.start(); f.elapse(45_000);
  assert.throws(() => f.game.command(f.host.token, { type: 'reveal-ready' }), /超时/);
  assert.equal(f.state().phase, 'speaking');
  assert.equal(f.state().players[0]!.hasRevealed, false);
  const deadline = f.state().deadline;
  f.game.tick();
  assert.equal(f.state().deadline, deadline);
  assert.equal(f.state().speakerId, f.host.playerId);
});

test('an expired speech advances exactly one turn without publishing the late message', () => {
  const f = setup(4);
  f.start(); f.reveal(); f.elapse(60_000);
  assert.throws(() => f.game.command(f.host.token, { type: 'speak', text: 'Late description' }), /超时/);
  assert.equal(f.state().speakerId, f.sessions[1]!.playerId);
  assert.equal(f.state().messages.some((message) => message.text === 'Late description'), false);
  f.game.tick();
  assert.equal(f.state().speakerId, f.sessions[1]!.playerId);
});

test('an expired vote resolves the existing ballot without counting the late vote', () => {
  const f = setup(6);
  f.start(); f.reveal(); f.finishSpeeches();
  f.game.command(f.sessions[1]!.token, { type: 'vote', targetId: f.sessions[2]!.playerId });
  f.elapse(45_000);
  assert.throws(() => f.game.command(f.host.token, { type: 'vote', targetId: f.sessions[3]!.playerId }), /超时/);
  assert.equal(f.state().lastVote?.eliminatedId, f.sessions[2]!.playerId);
  assert.equal(f.state().lastVote?.counts[f.sessions[3]!.playerId], undefined);
  assert.equal(f.state().round, 2);
  f.game.tick();
  assert.equal(f.state().round, 2);
  assert.equal(f.state().speakerId, f.host.playerId);
});
