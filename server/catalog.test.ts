import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WordCatalog } from '../shared/word-catalog.js';
import { WORD_CATEGORIES } from '../shared/word-catalog.js';
import { createGameServer } from './index.js';
import { WORD_PAIRS } from './words.js';

test('the public HTTP catalog returns accurate counts without serving words or clues', async (t) => {
  const app = createGameServer();
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => app.close());
  const port = (app.server.address() as { port: number }).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/catalog`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /application\/json/);
  const catalog = await response.json() as WordCatalog;
  assert.deepEqual(Object.keys(catalog).sort(), ['categories', 'difficulties', 'total']);
  assert.equal(catalog.total, WORD_PAIRS.length);
  assert.deepEqual(catalog.categories.map((category) => category.id), WORD_CATEGORIES.map((category) => category.value));
  for (const category of catalog.categories) {
    assert.deepEqual(Object.keys(category).sort(), ['count', 'difficulties', 'id']);
    assert.equal(category.count, WORD_PAIRS.filter((pair) => pair.category === category.id).length);
    assert.deepEqual(Object.keys(category.difficulties).sort(), ['easy', 'hard', 'normal']);
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      assert.equal(category.difficulties[difficulty], WORD_PAIRS.filter((pair) => pair.category === category.id && pair.difficulty === difficulty).length);
    }
  }
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    assert.equal(catalog.difficulties[difficulty], WORD_PAIRS.filter((pair) => pair.difficulty === difficulty).length);
  }
  const serialized = JSON.stringify(catalog);
  for (const pair of WORD_PAIRS) {
    for (const secret of [...pair.words, pair.sharedTrait, pair.distinction]) {
      assert.equal(serialized.includes(JSON.stringify(secret)), false);
    }
  }
});
