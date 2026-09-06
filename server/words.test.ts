import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getWordCatalog, WORD_PAIRS } from './words.js';
import { WORD_CATEGORIES } from '../shared/word-catalog.js';

test('word bank covers eight themes with at least sixty curated pairs each', () => {
  for (const category of WORD_CATEGORIES) {
    const entries = WORD_PAIRS.filter(pair => pair.category === category.value);
    assert.ok(entries.length >= 60, `${category.label} has only ${entries.length} pairs`);
  }
});

test('pairs and stable identifiers are unique, including reversed pairs across themes', () => {
  const ids = new Set<string>();
  const pairs = new Set<string>();
  for (const pair of WORD_PAIRS) {
    assert.equal(ids.has(pair.id), false, `Duplicate id: ${pair.id}`);
    ids.add(pair.id);
    const key = [...pair.words].map(word => word.normalize('NFKC')).sort().join('|');
    assert.equal(pairs.has(key), false, `Duplicate pair: ${key}`);
    pairs.add(key);
    assert.notEqual(pair.words[0], pair.words[1]);
    for (const word of pair.words) {
      assert.ok(word.length <= 10, `Word is too long: ${word}`);
      assert.match(word, /^(?:[\u3400-\u9fffA-Za-z0-9·]+|[A-Za-z]+-[A-Za-z]+)$/, `Invalid word: ${word}`);
    }
    assert.ok(pair.sharedTrait.trim().length >= 6, `Missing meaningful common trait: ${key}`);
    assert.ok(pair.distinction.trim().length >= 12, `Missing distinction: ${key}`);
    assert.equal(/TODO|TBD|待补/.test(`${pair.sharedTrait}${pair.distinction}`), false);
  }
});

test('each theme has sufficient coverage at every difficulty', () => {
  for (const category of WORD_CATEGORIES) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const count = WORD_PAIRS.filter(pair => pair.category === category.value && pair.difficulty === difficulty).length;
      assert.ok(count >= 15, `${category.label}/${difficulty} has only ${count} pairs`);
    }
  }
});

test('public catalog exposes only accurate counts, never words or clues', () => {
  const catalog = getWordCatalog();
  assert.equal(catalog.total, WORD_PAIRS.length);
  assert.equal(catalog.categories.reduce((sum, category) => sum + category.count, 0), catalog.total);
  assert.equal(Object.values(catalog.difficulties).reduce((a, b) => a + b, 0), catalog.total);
  for (const category of catalog.categories) {
    assert.equal(category.count, WORD_PAIRS.filter(pair => pair.category === category.id).length);
    assert.equal(Object.values(category.difficulties).reduce((a, b) => a + b, 0), category.count);
  }
  const serialized = JSON.stringify(catalog);
  for (const pair of WORD_PAIRS) {
    for (const word of pair.words) assert.equal(serialized.includes(word), false);
    assert.equal(serialized.includes(pair.distinction), false);
  }
});
