export const WORD_CATEGORIES = [
  { value: 'daily', label: '日常生活', icon: 'coffee' },
  { value: 'food', label: '吃吃喝喝', icon: 'utensils' },
  { value: 'places', label: '出行天地', icon: 'map-pin' },
  { value: 'jobs', label: '职业身份', icon: 'briefcase-business' },
  { value: 'nature', label: '自然万物', icon: 'leaf' },
  { value: 'culture', label: '文娱时光', icon: 'clapperboard' },
  { value: 'sports', label: '运动休闲', icon: 'medal' },
  { value: 'tech', label: '数码科技', icon: 'monitor' },
] as const;

export type WordCategory = typeof WORD_CATEGORIES[number]['value'];
export type Difficulty = 'easy' | 'normal' | 'hard';
export type DifficultyFilter = 'all' | Difficulty;
export const DIFFICULTIES: { value: DifficultyFilter; label: string }[] = [
  { value: 'all', label: '混合' },
  { value: 'easy', label: '轻松' },
  { value: 'normal', label: '标准' },
  { value: 'hard', label: '烧脑' },
];

export interface WordCatalog {
  total: number;
  difficulties: Record<Difficulty, number>;
  categories: { id: WordCategory; count: number; difficulties: Record<Difficulty, number> }[];
}
