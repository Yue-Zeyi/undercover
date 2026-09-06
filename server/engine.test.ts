import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Session } from '../shared/protocol.js';
import { GameEngine } from './engine.js';

function setup(count = 4) {
  let now = 10_000;
  const game = new GameEngine({ now: () => now, random: () => 0 });
  const host = game.create({ nickname: '房主', avatar: 0, settings: { capacity: count, undercoverCount: 1, category: 'daily', turnSeconds: 60 } });
  const sessions = [host];
  for (let i = 1; i < count; i++) sessions.push(game.join(host.roomCode, { nickname: `玩家${i}`, avatar: i % 8 }));
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
      game.command(speaker.token, { type: 'speak', text: '这是日常生活中常见的东西' });
    }
  };
  const voteOut = (target: Session) => {
    for (const session of sessions.filter((s) => state().players.find((p) => p.id === s.playerId)?.alive)) {
      if (state().phase !== 'voting') break;
      const alternative = state().players.find((p) => p.alive && p.id !== target.playerId)!;
      game.command(session.token, { type: 'vote', targetId: session === target ? alternative.id : target.playerId });
    }
  };
  return { game, host, sessions, state, advance, start, reveal, finishSpeeches, voteOut };
}

test('validates profiles, settings, room capacity and start readiness', () => {
  const { game, host, sessions, start } = setup();
  assert.throws(() => game.create({ nickname: ' ', avatar: 0 }), /昵称/);
  assert.throws(() => game.create({ nickname: '甲', avatar: 9 }), /头像/);
  assert.throws(() => game.create({ nickname: '甲', avatar: 1, settings: { capacity: 4, undercoverCount: 2, category: 'all', turnSeconds: 60 } }), /卧底/);
  assert.throws(() => game.join(host.roomCode, { nickname: '满员', avatar: 1 }), /已满/);
  assert.throws(() => game.command(host.token, { type: 'start' }), /准备/);
  assert.throws(() => game.command(sessions[1]!.token, { type: 'start' }), /房主/);
  start();
  assert.throws(() => game.join(host.roomCode, { nickname: '迟到', avatar: 1 }), /已开始/);
});

test('each recipient receives only their word and no role before the result', () => {
  const { game, sessions, start, state } = setup();
  assert.equal(state().word, undefined);
  start();
  const words = sessions.map((session) => game.view(session.token).word);
  assert.equal(new Set(words).size, 2);
  assert.equal(words.filter((word) => word === words[0]).length, 3);
  for (const session of sessions) {
    const snapshot = game.view(session.token);
    assert.equal(snapshot.reveal, undefined);
    assert.equal(snapshot.words, undefined);
    assert.equal(JSON.stringify(snapshot).includes('"role"'), false);
    const opponentWord = words.find((word) => word !== snapshot.word)!;
    assert.equal(JSON.stringify(snapshot).includes(opponentWord), false);
  }
});

test('enforces speaking order, valid commands and one non-self vote per voter', () => {
  const f = setup();
  f.start(); f.reveal();
  assert.throws(() => f.game.command(f.sessions[1]!.token, { type: 'speak', text: '抢先发言' }), /轮到/);
  assert.throws(() => f.game.command(f.host.token, { type: 'speak', text: '甲'.repeat(121) }), /120/);
  assert.throws(() => f.game.command(f.host.token, { type: 'vote', targetId: f.sessions[1]!.playerId }), /投票阶段/);
  assert.throws(() => f.game.command(f.host.token, { type: 'ready', ready: 'yes' } as never), /请求/);
  assert.throws(() => f.game.command(f.host.token, null as never), /请求/);
  f.finishSpeeches();
  assert.throws(() => f.game.command(f.host.token, { type: 'vote', targetId: f.host.playerId }), /自己/);
  f.game.command(f.host.token, { type: 'vote', targetId: f.sessions[1]!.playerId });
  assert.throws(() => f.game.command(f.host.token, { type: 'vote', targetId: f.sessions[2]!.playerId }), /已经投票/);
});

test('tie candidates speak again and the revote is restricted to tied candidates', () => {
  const f = setup(5);
  f.start(); f.reveal(); f.finishSpeeches();
  const [a, b, c, d, e] = f.sessions as [Session, Session, Session, Session, Session];
  f.game.command(a.token, { type: 'vote', targetId: b.playerId });
  f.game.command(b.token, { type: 'vote', targetId: a.playerId });
  f.game.command(c.token, { type: 'vote', targetId: a.playerId });
  f.game.command(d.token, { type: 'vote', targetId: b.playerId });
  f.game.command(e.token, { type: 'vote', targetId: c.playerId });
  assert.equal(f.state().phase, 'speaking');
  assert.deepEqual(f.state().voteCandidates, [a.playerId, b.playerId]);
  assert.deepEqual(f.state().lastVote?.tiedIds, [a.playerId, b.playerId]);
  f.finishSpeeches();
  assert.throws(() => f.game.command(a.token, { type: 'vote', targetId: c.playerId }), /候选/);
  f.voteOut(a);
  assert.equal(f.state().players.find((p) => p.id === a.playerId)?.alive, false);
  assert.equal(f.state().round, 2);
});

test('timers advance reveal, silent turns and zero-vote rounds', () => {
  const f = setup();
  f.start(); f.advance(45_000);
  assert.equal(f.state().phase, 'speaking');
  for (let i = 0; i < 4; i++) f.advance(60_000);
  assert.equal(f.state().phase, 'voting');
  f.advance(45_000);
  assert.equal(f.state().phase, 'speaking');
  assert.equal(f.state().round, 2);
  assert.equal(f.state().players.filter((p) => p.alive).length, 4);
});

test('civilian victory reveals all identities and restart resets secrets', () => {
  const f = setup();
  f.start(); f.reveal(); f.finishSpeeches();
  const wordCounts = new Map<string, Session[]>();
  for (const session of f.sessions) {
    const word = f.game.view(session.token).word!;
    wordCounts.set(word, [...(wordCounts.get(word) ?? []), session]);
  }
  const undercover = [...wordCounts.values()].find((group) => group.length === 1)![0]!;
  f.voteOut(undercover);
  assert.equal(f.state().winner, 'civilian');
  assert.equal(f.state().phase, 'result');
  assert.equal(f.state().reveal?.length, 4);
  assert.ok(f.state().words?.civilian);
  assert.throws(() => f.game.command(f.sessions[1]!.token, { type: 'restart' }), /房主/);
  f.game.command(f.host.token, { type: 'restart' });
  assert.equal(f.state().phase, 'lobby');
  assert.equal(f.state().word, undefined);
  assert.equal(f.state().reveal, undefined);
  assert.equal(f.state().players.filter((p) => p.ready).length, 1);
});

test('undercover wins when two civilians are voted out of a four-player game', () => {
  const f = setup();
  f.start(); f.reveal(); f.finishSpeeches();
  const civilians = f.sessions.filter((s) => f.game.view(s.token).word === f.game.view(f.host.token).word);
  f.voteOut(civilians[1]!);
  assert.equal(f.state().phase, 'speaking');
  f.finishSpeeches();
  f.voteOut(civilians[2]!);
  assert.equal(f.state().winner, 'undercover');
});

test('disconnect preserves a seat and secret, transfers host, reconnect restores snapshot', () => {
  const f = setup();
  f.start();
  const word = f.state().word;
  f.game.disconnect(f.host.token);
  assert.equal(f.state().hostId, f.sessions[1]!.playerId);
  assert.equal(f.state().players.find((p) => p.id === f.host.playerId)?.connected, false);
  f.game.connect(f.host.token);
  assert.equal(f.state().word, word);
  assert.equal(f.state().players.length, 4);
  assert.equal(f.state().players[0]?.connected, true);
});

for (const departure of ['disconnect', 'leave'] as const) {
  test(`new lobby host becomes ready after ${departure} and can start a full room`, () => {
    const f = setup();
    const nextHost = f.sessions[1]!;
    f.sessions.slice(2).forEach((session) => f.game.command(session.token, { type: 'ready', ready: true }));
    assert.equal(f.game.view(nextHost.token).players.find((p) => p.id === nextHost.playerId)?.ready, false);
    if (departure === 'disconnect') f.game.disconnect(f.host.token);
    else f.game.command(f.host.token, { type: 'leave' });
    const transferred = f.game.view(nextHost.token);
    assert.equal(transferred.hostId, nextHost.playerId);
    assert.equal(transferred.players.find((p) => p.id === nextHost.playerId)?.ready, true);
    if (departure === 'disconnect') f.game.connect(f.host.token);
    else {
      const replacement = f.game.join(f.host.roomCode, { nickname: '新玩家', avatar: 4 });
      f.game.connect(replacement.token);
      f.game.command(replacement.token, { type: 'ready', ready: true });
    }
    f.game.command(nextHost.token, { type: 'start' });
    assert.equal(f.game.view(nextHost.token).phase, 'reveal');
  });
}

test('explicit departure removes lobby seats, eliminates active players and revokes tokens', () => {
  const f = setup();
  f.game.command(f.sessions[3]!.token, { type: 'leave' });
  assert.equal(f.state().players.length, 3);
  assert.throws(() => f.game.connect(f.sessions[3]!.token), /失效/);
  assert.throws(() => f.start(), /失效|4/);
  const replacement = f.game.join(f.host.roomCode, { nickname: '新玩家', avatar: 3 });
  f.sessions[3] = replacement;
  f.game.connect(replacement.token);
  f.start(); f.reveal();
  f.game.command(f.host.token, { type: 'leave' });
  const state = f.game.view(f.sessions[1]!.token);
  assert.equal(state.players.find((p) => p.id === f.host.playerId)?.alive, false);
  assert.equal(state.speakerId, f.sessions[1]!.playerId);
  assert.equal(state.hostId, f.sessions[1]!.playerId);
});

test('rooms expire and invalidate all credentials', () => {
  const f = setup();
  f.advance(2 * 60 * 60 * 1000 + 1);
  assert.throws(() => f.game.view(f.host.token), /失效/);
  assert.throws(() => f.game.join(f.host.roomCode, { nickname: '访客', avatar: 2 }), /不存在/);
});
