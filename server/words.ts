import { WORD_CATEGORIES, type WordCatalog, type Difficulty, type WordCategory } from '../shared/word-catalog.js';
import type { WordEntry, WordPair } from './word-bank/types.js';
import { DAILY_WORDS } from './word-bank/daily.js';
import { FOOD_WORDS } from './word-bank/food.js';
import { PLACES_WORDS } from './word-bank/places.js';
import { JOBS_WORDS } from './word-bank/jobs.js';
import { NATURE_WORDS } from './word-bank/nature.js';
import { CULTURE_WORDS } from './word-bank/culture.js';
import { SPORTS_WORDS } from './word-bank/sports.js';
import { TECH_WORDS } from './word-bank/tech.js';

const BANKS: Record<WordCategory, readonly WordEntry[]> = {
  daily: DAILY_WORDS, food: FOOD_WORDS, places: PLACES_WORDS, jobs: JOBS_WORDS,
  nature: NATURE_WORDS, culture: CULTURE_WORDS, sports: SPORTS_WORDS, tech: TECH_WORDS,
};

export const WORD_PAIRS: readonly WordPair[] = WORD_CATEGORIES.flatMap(category =>
  BANKS[category.value].map(([first, second, difficulty, sharedTrait, distinction]) => ({
    id: `${category.value}:${[first, second].sort().join('/')}`,
    category: category.value,
    difficulty,
    words: [first, second] as const,
    sharedTrait,
    distinction,
  })),
);

function countDifficulties(pairs: readonly WordPair[]): Record<Difficulty, number> {
  const counts = { easy: 0, normal: 0, hard: 0 };
  for (const pair of pairs) counts[pair.difficulty]++;
  return counts;
}

export function getWordCatalog(source: readonly WordPair[] = WORD_PAIRS): WordCatalog {
  return {
    total: source.length,
    difficulties: countDifficulties(source),
    categories: WORD_CATEGORIES.map(({ value }) => {
      const pairs = source.filter(pair => pair.category === value);
      return { id: value, count: pairs.length, difficulties: countDifficulties(pairs) };
    }),
  };
}
