import type { WordPair } from './word-bank/types.js';

export function drawWordPair(pool: readonly WordPair[], used: Set<string>, random: () => number, lastId?: string): WordPair {
  if (!pool.length) throw new Error('当前筛选没有可用词库');
  let available = pool.filter(pair => !used.has(pair.id));
  if (!available.length) {
    for (const pair of pool) used.delete(pair.id);
    available = pool.length > 1 ? pool.filter(pair => pair.id !== lastId) : [...pool];
  }
  const pair = available[Math.floor(random() * available.length)]!;
  used.add(pair.id);
  return pair;
}
