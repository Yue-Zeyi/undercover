import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DEFAULT_SYSTEM_CONFIG, type SystemConfig } from '../shared/protocol.js';
import { DIFFICULTIES, WORD_CATEGORIES } from '../shared/word-catalog.js';
import { WORD_PAIRS } from './words.js';
import type { WordPair } from './word-bank/types.js';

interface PersistedData {
  config?: Partial<SystemConfig>;
  words?: WordPair[];
  disabledIds?: string[];
}

function validWordPair(value: unknown): value is WordPair {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WordPair>;
  return typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.category === 'string' && WORD_CATEGORIES.some((category) => category.value === item.category) &&
    typeof item.difficulty === 'string' && ['easy', 'normal', 'hard'].includes(item.difficulty) &&
    Array.isArray(item.words) && item.words.length === 2 && item.words.every((word) => typeof word === 'string' && word.trim().length >= 1 && word.trim().length <= 30) &&
    typeof item.sharedTrait === 'string' && item.sharedTrait.trim().length >= 2 && item.sharedTrait.length <= 120 &&
    typeof item.distinction === 'string' && item.distinction.trim().length >= 2 && item.distinction.length <= 240;
}

export class AdminStore {
  private readonly filePath: string;
  private config: SystemConfig = { ...DEFAULT_SYSTEM_CONFIG };
  private words = new Map<string, WordPair>(WORD_PAIRS.map((pair) => [pair.id, pair]));
  private disabled = new Set<string>();

  constructor() {
    const dataDir = process.env.WODI_DATA_DIR?.trim() || join(process.cwd(), 'data');
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, 'wodi-admin.json');
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as PersistedData;
      if (parsed.config) {
        this.config = {
          systemName: typeof parsed.config.systemName === 'string' && parsed.config.systemName.trim() ? parsed.config.systemName.trim().slice(0, 40) : DEFAULT_SYSTEM_CONFIG.systemName,
          icp: typeof parsed.config.icp === 'string' ? parsed.config.icp.trim().slice(0, 40) : DEFAULT_SYSTEM_CONFIG.icp,
        };
      }
      if (Array.isArray(parsed.words)) for (const pair of parsed.words) if (validWordPair(pair)) this.words.set(pair.id, pair);
      if (Array.isArray(parsed.disabledIds)) for (const id of parsed.disabledIds) if (typeof id === 'string') this.disabled.add(id);
    } catch { /* First run or a corrupt file: use the bundled defaults. */ }
  }

  getConfig(): SystemConfig { return { ...this.config }; }

  updateConfig(value: unknown): SystemConfig {
    if (!value || typeof value !== 'object') throw new Error('设置格式不正确');
    const input = value as Partial<SystemConfig>;
    const systemName = typeof input.systemName === 'string' ? input.systemName.trim() : this.config.systemName;
    const icp = typeof input.icp === 'string' ? input.icp.trim() : this.config.icp;
    if (!systemName || systemName.length > 40) throw new Error('系统名称须为 1 至 40 个字符');
    if (icp.length > 40) throw new Error('备案号不能超过 40 个字符');
    this.config = { systemName, icp };
    this.persist();
    return this.getConfig();
  }

  listWords(): WordPair[] {
    return [...this.words.values()].filter((pair) => !this.disabled.has(pair.id)).sort((a, b) => a.category.localeCompare(b.category) || a.words[0].localeCompare(b.words[0]));
  }

  upsertWord(value: unknown, id?: string): WordPair {
    if (!value || typeof value !== 'object') throw new Error('词对格式不正确');
    const input = value as Partial<WordPair>;
    const words = Array.isArray(input.words) ? input.words.map((word) => typeof word === 'string' ? word.trim() : word) : input.words;
    const category = input.category;
    const difficulty = input.difficulty;
    const pair: WordPair = {
      id: id || (typeof input.id === 'string' && input.id.trim() ? input.id.trim() : `custom:${randomBytes(8).toString('hex')}`),
      category: category as WordPair['category'],
      difficulty: difficulty as WordPair['difficulty'],
      words: words as WordPair['words'],
      sharedTrait: typeof input.sharedTrait === 'string' ? input.sharedTrait.trim() : '',
      distinction: typeof input.distinction === 'string' ? input.distinction.trim() : '',
    };
    if (!validWordPair(pair)) throw new Error('请完整填写有效的词对、主题、难度和复盘说明');
    const duplicate = [...this.words.values()].find((existing) => existing.id !== pair.id && existing.words.some((word) => pair.words.includes(word)));
    if (duplicate) throw new Error('词语不能与已有词对重复');
    this.words.set(pair.id, pair);
    this.disabled.delete(pair.id);
    this.persist();
    return pair;
  }

  removeWord(id: string): void {
    const pair = this.words.get(id);
    if (!pair) throw new Error('词对不存在');
    if (this.words.size - this.disabled.size <= 1) throw new Error('至少保留一组词对');
    const categoryCount = [...this.words.values()].filter((item) => item.category === pair.category && !this.disabled.has(item.id)).length;
    if (categoryCount <= 1) throw new Error('每个主题至少保留一组词对');
    this.disabled.add(id);
    this.persist();
  }

  getWordPairs(): readonly WordPair[] { return this.listWords(); }

  private persist(): void {
    const data: PersistedData = { config: this.config, words: [...this.words.values()], disabledIds: [...this.disabled] };
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
