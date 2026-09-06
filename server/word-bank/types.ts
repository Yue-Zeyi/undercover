import type { Difficulty, WordCategory } from '../../shared/word-catalog.js';

export type WordEntry = readonly [
  first: string,
  second: string,
  difficulty: Difficulty,
  sharedTrait: string,
  distinction: string,
];

export interface WordPair {
  id: string;
  category: WordCategory;
  difficulty: Difficulty;
  words: readonly [string, string];
  sharedTrait: string;
  distinction: string;
}
