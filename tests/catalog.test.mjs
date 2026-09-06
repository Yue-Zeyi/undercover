import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { requestWordCatalog } from '../src/services/connection.ts';
import { WORD_CATEGORIES } from '../shared/word-catalog.ts';

function catalog() {
  return {
    total: 48,
    difficulties: { easy: 16, normal: 16, hard: 16 },
    categories: WORD_CATEGORIES.map(({ value }) => ({ id: value, count: 6, difficulties: { easy: 2, normal: 2, hard: 2 } })),
  };
}

let response;

beforeEach(() => {
  response = { statusCode: 200, data: catalog() };
  globalThis.location = { origin: 'https://game.example.test' };
  globalThis.uni = {
    request({ success }) { queueMicrotask(() => success(response)); },
  };
});

afterEach(() => {
  delete globalThis.location;
  delete globalThis.uni;
});

test('catalog requests accept a complete response with usable counts for every filter', async () => {
  const result = await requestWordCatalog();
  assert.deepEqual(result, catalog());
  for (const category of result.categories) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      assert.equal(category.difficulties[difficulty], 2);
    }
  }
});

for (const [label, corrupt] of [
  ['null response', () => null],
  ['missing difficulty totals', (data) => { delete data.difficulties; return data; }],
  ['missing all categories', (data) => { data.categories = []; return data; }],
  ['missing a theme', (data) => { data.categories.pop(); return data; }],
  ['duplicated theme', (data) => { data.categories[1] = data.categories[0]; return data; }],
  ['unknown theme', (data) => { data.categories[0].id = 'unknown'; return data; }],
  ['null category', (data) => { data.categories[0] = null; return data; }],
  ['missing category difficulties', (data) => { delete data.categories[0].difficulties; return data; }],
  ['missing one difficulty', (data) => { delete data.categories[0].difficulties.hard; return data; }],
  ['negative count', (data) => { data.categories[0].count = -1; return data; }],
  ['fractional count', (data) => { data.categories[0].difficulties.easy = 1.5; return data; }],
  ['nonnumeric count', (data) => { data.difficulties.normal = '16'; return data; }],
  ['infinite total', (data) => { data.total = Infinity; return data; }],
  ['NaN total', (data) => { data.total = NaN; return data; }],
  ['inconsistent category total', (data) => { data.categories[0].count = 7; return data; }],
  ['inconsistent overall total', (data) => { data.total = 49; return data; }],
  ['inconsistent difficulty totals', (data) => { data.difficulties.easy = 15; data.difficulties.normal = 17; return data; }],
]) {
  test(`catalog requests reject a malformed HTTP 200 response: ${label}`, async () => {
    response.data = corrupt(catalog());
    await assert.rejects(requestWordCatalog(), /词库数量暂时无法加载/);
  });
}

test('catalog requests reject server errors even when the response contains catalog-shaped data', async () => {
  response.statusCode = 503;
  await assert.rejects(requestWordCatalog(), /词库数量暂时无法加载/);
});

test('catalog requests reject network failures so the caller can display its retry state', async () => {
  globalThis.uni.request = ({ fail }) => { queueMicrotask(() => fail({ errMsg: 'request:fail timeout' })); };
  await assert.rejects(requestWordCatalog(), /词库数量暂时无法加载/);
});
