import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameEngine } from './engine.js';
import { DEFAULT_SETTINGS, type RoomSettings, type RoomView } from '../shared/protocol.js';
import { DIFFICULTIES, WORD_CATEGORIES } from '../shared/word-catalog.js';
import { WORD_PAIRS } from './words.js';
import type { WordPair } from './word-bank/types.js';

function setup(settings: Partial<RoomSettings> = {}, random: () => number = () => 0) {
  const game = new GameEngine({ now: () => 10_000, random });
  const host = game.create({ nickname: 'Host', avatar: 0, settings: { ...DEFAULT_SETTINGS, capacity: 4, ...settings } });
  const sessions = [host];
  for (let i = 1; i < 4; i++) sessions.push(game.join(host.roomCode, { nickname: `Player ${i}`, avatar: i }));
  sessions.forEach((session) => game.connect(session.token));
  const state = () => game.view(host.token);
  const start = () => {
    sessions.slice(1).forEach((session) => game.command(session.token, { type: 'ready', ready: true }));
    game.command(host.token, { type: 'start' });
  };
  const reveal = () => sessions.forEach((session) => game.command(session.token, { type: 'reveal-ready' }));
  const finishSpeeches = () => {
    while (state().phase === 'speaking') {
      const speaker = sessions.find((session) => session.playerId === state().speakerId)!;
      game.command(speaker.token, { type: 'speak', text: 'A careful description' });
    }
  };
  const selectedPair = () => {
    const assigned = new Set(sessions.map((session) => game.view(session.token).word));
    assert.equal(assigned.size, 2);
    const pair = WORD_PAIRS.find((entry) => entry.words.every((word) => assigned.has(word)));
    assert.ok(pair, 'Dealt words must be a curated pair');
    return pair;
  };
  const voteUndercoverOut = () => {
    const undercover = sessions.find((session) => sessions.filter((other) => game.view(other.token).word === game.view(session.token).word).length === 1)!;
    for (const session of sessions) {
      const target = session === undercover ? sessions.find((other) => other !== undercover)! : undercover;
      game.command(session.token, { type: 'vote', targetId: target.playerId });
    }
    assert.equal(state().phase, 'result');
    assert.equal(state().winner, 'civilian');
  };
  const finish = () => { reveal(); finishSpeeches(); voteUndercoverOut(); };
  return { game, host, sessions, state, start, reveal, finishSpeeches, selectedPair, voteUndercoverOut, finish };
}

function assertPrivate(snapshot: RoomView, pair: WordPair) {
  assert.ok(pair.words.includes(snapshot.word!));
  for (const key of ['wordInfo', 'words', 'reveal', 'wordPair', 'usedWordPairIds']) {
    assert.equal(Object.hasOwn(snapshot, key), false, `${key} must stay private before the result`);
  }
  const { word, ...publicFields } = snapshot;
  const serialized = JSON.stringify(publicFields);
  for (const secret of [...pair.words, pair.sharedTrait, pair.distinction, pair.id]) {
    assert.equal(serialized.includes(JSON.stringify(secret)), false, 'Only the recipient word may be sent');
  }
  assert.equal(serialized.includes('"token"'), false);
  assert.equal(serialized.includes('"role"'), false);
}

for (const category of ['all', ...WORD_CATEGORIES.map((option) => option.value)] as const) {
  for (const { value: difficulty } of DIFFICULTIES) {
    test(`a complete ${category}/${difficulty} game uses the requested word pool`, () => {
      const f = setup({ category, difficulty }, () => 0.999);
      f.start();
      const pair = f.selectedPair();
      assert.equal(f.state().settings.category, category);
      assert.equal(f.state().settings.difficulty, difficulty);
      if (category !== 'all') assert.equal(pair.category, category);
      if (difficulty !== 'all') assert.equal(pair.difficulty, difficulty);
      f.finish();
      assert.deepEqual(f.state().wordInfo, {
        category: pair.category, difficulty: pair.difficulty,
        sharedTrait: pair.sharedTrait, distinction: pair.distinction,
      });
    });
  }
}

test('invalid difficulties are rejected and omitted legacy difficulty uses the default', () => {
  const game = new GameEngine();
  for (const difficulty of ['expert', '', null, 2, [], {}]) {
    assert.throws(() => game.create({ nickname: 'Host', avatar: 0, settings: { ...DEFAULT_SETTINGS, difficulty } }), /难度/);
  }
  const { difficulty, ...legacySettings } = DEFAULT_SETTINGS;
  const host = game.create({ nickname: 'Host', avatar: 0, settings: legacySettings });
  assert.equal(game.view(host.token).settings.difficulty, difficulty);
});

test('restarting the same room exhausts its filtered pool before reuse and avoids an immediate repeat', () => {
  const f = setup({ category: 'daily', difficulty: 'hard' });
  const pool = WORD_PAIRS.filter((pair) => pair.category === 'daily' && pair.difficulty === 'hard');
  assert.ok(pool.length > 1);
  const played: string[] = [];
  for (let i = 0; i < pool.length + 2; i++) {
    f.start();
    const pair = f.selectedPair();
    assert.notEqual(pair.id, played.at(-1), 'Adjacent games must not use the same pair');
    played.push(pair.id);
    f.finish();
    f.game.command(f.host.token, { type: 'restart' });
    assert.equal(f.state().code, f.host.roomCode);
    assert.equal(f.state().players.length, 4);
    assert.equal(f.state().wordInfo, undefined);
    assert.equal(f.state().word, undefined);
  }
  assert.equal(new Set(played.slice(0, pool.length)).size, pool.length);
  assert.deepEqual(new Set(played.slice(0, pool.length)), new Set(pool.map((pair) => pair.id)));
});

test('the same selected pair can assign either word to the civilian side', () => {
  const outcomes = [0.1, 0.9].map((side) => {
    const draws = [0, side];
    const f = setup({ category: 'food', difficulty: 'easy' }, () => draws.shift() ?? 0);
    f.start();
    const pair = f.selectedPair();
    f.finish();
    const expectedCivilian = pair.words[side < 0.5 ? 1 : 0];
    const expectedUndercover = pair.words[side < 0.5 ? 0 : 1];
    assert.deepEqual(f.state().words, { civilian: expectedCivilian, undercover: expectedUndercover });
    for (const entry of f.state().reveal!) assert.equal(entry.word, f.state().words![entry.role]);
    assert.equal(f.state().reveal!.filter((entry) => entry.role === 'undercover').length, 1);
    return { id: pair.id, civilian: expectedCivilian };
  });
  assert.equal(outcomes[0]!.id, outcomes[1]!.id);
  assert.notEqual(outcomes[0]!.civilian, outcomes[1]!.civilian);
});

test('clues, opponent words and identities stay private through all play phases and reconnects', () => {
  const f = setup({ category: 'tech', difficulty: 'hard' });
  f.start();
  const pair = f.selectedPair();
  const checkAllRecipients = () => f.sessions.forEach((session) => assertPrivate(f.game.view(session.token), pair));
  checkAllRecipients();
  f.reveal();
  checkAllRecipients();
  const reconnecting = f.sessions[2]!;
  const originalWord = f.game.view(reconnecting.token).word;
  f.game.disconnect(reconnecting.token);
  const restored = f.game.connect(reconnecting.token);
  assert.equal(restored.word, originalWord);
  assertPrivate(restored, pair);
  f.finishSpeeches();
  checkAllRecipients();
  f.voteUndercoverOut();
  for (const session of f.sessions) {
    const result = f.game.view(session.token);
    assert.deepEqual(result.wordInfo, {
      category: pair.category, difficulty: pair.difficulty,
      sharedTrait: pair.sharedTrait, distinction: pair.distinction,
    });
    assert.deepEqual(new Set(Object.values(result.words!)), new Set(pair.words));
    assert.equal(result.reveal!.length, 4);
    assert.equal(result.reveal!.find((player) => player.playerId === session.playerId)!.word, result.word);
  }
  f.game.command(f.host.token, { type: 'restart' });
  for (const session of f.sessions) {
    const lobby = f.game.view(session.token);
    assert.equal(lobby.word, undefined);
    assert.equal(lobby.wordInfo, undefined);
    assert.equal(lobby.words, undefined);
    assert.equal(lobby.reveal, undefined);
  }
  f.start();
  const nextPair = f.selectedPair();
  assert.notEqual(nextPair.id, pair.id);
  f.sessions.forEach((session) => assertPrivate(f.game.view(session.token), nextPair));
});
