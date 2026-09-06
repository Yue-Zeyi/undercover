import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawWordPair } from './word-selection.js';
import type { WordPair } from './word-bank/types.js';

const pairs: WordPair[] = ['a', 'b', 'c'].map(id => ({ id, category: 'daily', difficulty: 'normal', words: [id, `${id}2`], sharedTrait: '共同特点', distinction: '两者存在区别' }));

test('a room exhausts its pool before reusing a pair even with a constant RNG', () => {
  const used = new Set<string>();
  const draws = Array.from({ length: pairs.length }, () => drawWordPair(pairs, used, () => 0).id);
  assert.equal(new Set(draws).size, pairs.length);
  assert.equal(used.size, pairs.length);
});

test('recycling a pool avoids an immediate repeat and preserves other-theme history', () => {
  const used = new Set([...pairs.map(pair => pair.id), 'other-theme']);
  const drawn = drawWordPair(pairs, used, () => 0, pairs[0]!.id);
  assert.notEqual(drawn.id, pairs[0]!.id);
  assert.equal(used.has('other-theme'), true);
  assert.equal(used.has(drawn.id), true);
});

test('selection handles a single remaining pair and a one-pair pool', () => {
  const used = new Set(['a', 'b']);
  assert.equal(drawWordPair(pairs, used, () => 0.999).id, 'c');
  assert.equal(drawWordPair([pairs[0]!], new Set(['a']), () => 0, 'a').id, 'a');
  assert.throws(() => drawWordPair([], new Set(), () => 0), /词库/);
});
