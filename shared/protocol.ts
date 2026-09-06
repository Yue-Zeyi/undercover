import type { Difficulty, DifficultyFilter, WordCategory } from './word-catalog';

export type Phase = 'lobby' | 'reveal' | 'speaking' | 'voting' | 'result';
export type Role = 'civilian' | 'undercover';
export type Category = 'all' | WordCategory;

export interface RoomSettings {
  capacity: number;
  undercoverCount: number;
  category: Category;
  difficulty: DifficultyFilter;
  turnSeconds: 60 | 90 | 120;
}

export interface PlayerView {
  id: string;
  nickname: string;
  avatar: number;
  connected: boolean;
  away: boolean;
  ready: boolean;
  alive: boolean;
  hasRevealed: boolean;
  hasVoted: boolean;
  kicked?: boolean;
}

export interface ModerationRequestView {
  proposerId: string;
  targetId?: string;
  eligibleIds: string[];
  approvedIds: string[];
  votedIds: string[];
  required: number;
}

export interface SystemConfig {
  systemName: string;
  icp: string;
}

export interface GameMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  round: number;
  kind: 'speech' | 'system';
  createdAt: number;
}

export interface RoomView {
  code: string;
  hostId: string;
  selfId: string;
  settings: RoomSettings;
  phase: Phase;
  round: number;
  players: PlayerView[];
  word?: string;
  speakerId?: string;
  deadline?: number;
  messages: GameMessage[];
  voteCandidates: string[];
  lastVote?: { counts: Record<string, number>; eliminatedId?: string; tiedIds: string[] };
  winner?: Role;
  endedEarly?: boolean;
  reveal?: { playerId: string; role: Role; word: string }[];
  words?: { civilian: string; undercover: string };
  wordInfo?: { category: WordCategory; difficulty: Difficulty; sharedTrait: string; distinction: string };
  earlyEndRequest?: ModerationRequestView;
  kickRequest?: ModerationRequestView;
  resultReason?: 'normal' | 'early-end';
}

export interface Session {
  token: string;
  playerId: string;
  roomCode: string;
}

export type ClientCommand =
  | { type: 'ready'; ready: boolean }
  | { type: 'away'; away: boolean }
  | { type: 'start' }
  | { type: 'reveal-ready' }
  | { type: 'speak'; text: string }
  | { type: 'vote'; targetId: string }
  | { type: 'restart' }
  | { type: 'request-end' }
  | { type: 'vote-end'; approve: boolean }
  | { type: 'request-kick'; targetId: string }
  | { type: 'vote-kick'; agree: boolean }
  | { type: 'leave' }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'state'; state: RoomView }
  | { type: 'error'; message: string; fatal?: boolean; code?: 'SESSION_REPLACED' }
  | { type: 'pong' }
  | { type: 'left' };

export const DEFAULT_SETTINGS: RoomSettings = {
  capacity: 6,
  undercoverCount: 1,
  category: 'all',
  difficulty: 'normal',
  turnSeconds: 60,
};

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  systemName: '谁是卧底',
  icp: '',
};
