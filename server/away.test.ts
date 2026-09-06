import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameEngine } from './engine.js';

function setup(count = 4) {
  let now = 10_000;
  const game = new GameEngine({ now: () => now, random: () => 0 });
  const host = game.create({ nickname: 'Host', avatar: 0, settings: { capacity: count, undercoverCount: 1, category: 'daily', turnSeconds: 60 } });
  const sessions = [host];
  for (let i = 1; i < count; i++) sessions.push(game.join(host.roomCode, { nickname: `Player ${i}`, avatar: i % 8 }));
  sessions.forEach((session) => game.connect(session.token));
  const state = () => game.view(host.token);
  const advance = (ms: number) => { now += ms; game.tick(); };
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
  return { game, host, sessions, state, advance, start, reveal, finishSpeeches };
}

test('away presence synchronizes without disconnecting or expiring the lobby seat', () => {
  const f = setup();
  const guest = f.sessions[1]!;
  assert.equal(f.state().players[1]!.away, false);
  let changes = 0;
  f.game.onChange = () => { changes++; };
  f.game.command(guest.token, { type: 'away', away: true });
  assert.equal(changes, 1);
  assert.equal(f.state().players[1]!.away, true);
  assert.equal(f.state().players[1]!.connected, true);
  f.advance(120_000);
  assert.equal(f.state().players.length, 4);
  assert.equal(f.game.view(guest.token).selfId, guest.playerId);
  f.game.command(guest.token, { type: 'away', away: false });
  assert.equal(f.state().players[1]!.away, false);
});

test('away cancels guest readiness and prevents starting until the guest returns and prepares', () => {
  const f = setup();
  const guest = f.sessions[1]!;
  f.sessions.slice(1).forEach((session) => f.game.command(session.token, { type: 'ready', ready: true }));
  f.game.command(guest.token, { type: 'away', away: true });
  assert.equal(f.state().players[1]!.ready, false);
  assert.throws(() => f.game.command(guest.token, { type: 'ready', ready: true }), /挂机|返回/);
  assert.throws(() => f.game.command(f.host.token, { type: 'start' }), /挂机|返回|准备/);
  f.game.command(guest.token, { type: 'away', away: false });
  assert.equal(f.state().players[1]!.ready, false);
  assert.throws(() => f.game.command(f.host.token, { type: 'start' }), /准备/);
  f.game.command(guest.token, { type: 'ready', ready: true });
  f.game.command(guest.token, { type: 'away', away: false });
  assert.equal(f.state().players[1]!.ready, true);
  f.game.command(f.host.token, { type: 'start' });
  assert.equal(f.state().phase, 'reveal');
});

test('an away host transfers ownership to an active guest and returning does not reclaim it', () => {
  const f = setup();
  f.game.command(f.sessions[1]!.token, { type: 'away', away: true });
  f.game.command(f.host.token, { type: 'away', away: true });
  assert.equal(f.state().hostId, f.sessions[2]!.playerId);
  assert.equal(f.state().players[0]!.ready, false);
  assert.equal(f.state().players[2]!.ready, true);
  f.game.command(f.host.token, { type: 'away', away: false });
  assert.equal(f.state().hostId, f.sessions[2]!.playerId);
  assert.equal(f.state().players[0]!.ready, false);
});

test('a lone away host keeps ownership and an active guest can take over later', () => {
  const game = new GameEngine();
  const host = game.create({ nickname: 'Host', avatar: 0 });
  game.connect(host.token);
  game.command(host.token, { type: 'away', away: true });
  assert.equal(game.view(host.token).hostId, host.playerId);
  assert.equal(game.view(host.token).players[0]!.ready, false);
  game.command(host.token, { type: 'away', away: false });
  assert.equal(game.view(host.token).players[0]!.ready, true);
  game.command(host.token, { type: 'away', away: true });
  const guest = game.join(host.roomCode, { nickname: 'Guest', avatar: 1 });
  game.connect(guest.token);
  assert.equal(game.view(host.token).hostId, guest.playerId);
  assert.equal(game.view(host.token).players[1]!.ready, true);
});

test('disconnect and reconnect never promote an away player over an active player', () => {
  const f = setup();
  f.game.command(f.sessions[1]!.token, { type: 'away', away: true });
  f.game.disconnect(f.host.token);
  assert.equal(f.state().hostId, f.sessions[2]!.playerId);
  f.game.disconnect(f.sessions[1]!.token);
  f.game.connect(f.sessions[1]!.token);
  assert.equal(f.state().hostId, f.sessions[2]!.playerId);
  assert.equal(f.state().players[1]!.away, true);
});

test('away during a match retains the word and turn until its ordinary deadline', () => {
  const f = setup();
  f.start(); f.reveal();
  const before = f.state();
  f.game.command(f.host.token, { type: 'away', away: true });
  const away = f.state();
  assert.equal(away.word, before.word);
  assert.equal(away.speakerId, before.speakerId);
  assert.equal(away.deadline, before.deadline);
  assert.equal(away.players[0]!.alive, true);
  assert.equal(away.players[0]!.connected, true);
  assert.equal(away.words, undefined);
  assert.equal(away.reveal, undefined);
  assert.equal(away.wordInfo, undefined);
  assert.equal(away.messages.filter((message) => message.kind === 'speech').length, 0);
  f.advance(60_000);
  assert.equal(f.state().speakerId, f.sessions[1]!.playerId);
  assert.equal(f.state().players[0]!.alive, true);
  f.game.command(f.host.token, { type: 'away', away: false });
  assert.equal(f.state().word, before.word);
});

test('away keeps an existing ballot private and does not fabricate an uncast vote', () => {
  const f = setup(6);
  f.start(); f.reveal(); f.finishSpeeches();
  const voter = f.sessions[3]!;
  const target = f.sessions[4]!;
  f.game.command(voter.token, { type: 'vote', targetId: target.playerId });
  f.game.command(voter.token, { type: 'away', away: true });
  f.game.command(target.token, { type: 'away', away: true });
  assert.equal(f.state().players[3]!.hasVoted, true);
  assert.equal(f.state().players[4]!.hasVoted, false);
  assert.equal(f.state().lastVote, undefined);
  assert.equal(f.state().voteCandidates.includes(target.playerId), true);
  const snapshot = f.game.view(voter.token);
  assert.equal(snapshot.reveal, undefined);
  assert.equal(snapshot.words, undefined);
  assert.equal(JSON.stringify(snapshot).includes('"targetId"'), false);
  f.game.command(voter.token, { type: 'away', away: false });
  assert.throws(() => f.game.command(voter.token, { type: 'vote', targetId: f.host.playerId }), /已经投票/);
  f.advance(45_000);
  assert.deepEqual(f.state().lastVote?.counts, { [target.playerId]: 1 });
});

test('restart preserves away seats without preparing them automatically', () => {
  const f = setup(6);
  f.start();
  const away = f.sessions[5]!;
  f.game.command(away.token, { type: 'away', away: true });
  const undercover = f.sessions.find((session) => f.sessions.filter((other) => f.game.view(other.token).word === f.game.view(session.token).word).length === 1)!;
  f.game.command(undercover.token, { type: 'leave' });
  assert.equal(f.state().phase, 'result');
  f.game.command(f.host.token, { type: 'restart' });
  const restored = f.game.view(away.token);
  assert.equal(restored.phase, 'lobby');
  assert.equal(restored.players.find((player) => player.id === away.playerId)!.away, true);
  assert.equal(restored.players.find((player) => player.id === away.playerId)!.ready, false);
  assert.equal(restored.word, undefined);
  assert.equal(restored.players.filter((player) => player.ready).length, 1);
});

test('away only accepts a boolean and invalid requests leave presence unchanged', () => {
  const f = setup();
  for (const away of [undefined, null, 'true', 1, {}, []]) {
    assert.throws(() => f.game.command(f.host.token, { type: 'away', away }), /请求格式/);
    assert.equal(f.state().players[0]!.away, false);
  }
});
