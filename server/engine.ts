import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS, type ClientCommand, type GameMessage, type Phase, type PlayerView, type Role, type RoomSettings, type RoomView, type Session } from '../shared/protocol.js';
import { WORD_PAIRS } from './words.js';
import { DIFFICULTIES, WORD_CATEGORIES } from '../shared/word-catalog.js';
import type { WordPair } from './word-bank/types.js';
import { drawWordPair } from './word-selection.js';

interface Player extends PlayerView { token: string; role?: Role; word?: string; left: boolean; disconnectedAt?: number }
interface VoteRequest { proposerId: string; targetId?: string; votes: Map<string, boolean> }
interface Room {
  code: string;
  hostId: string;
  settings: RoomSettings;
  players: Player[];
  phase: Phase;
  round: number;
  messages: GameMessage[];
  queue: string[];
  votes: Map<string, string>;
  voteCandidates: string[];
  lastVote?: RoomView['lastVote'];
  words?: RoomView['words'];
  winner?: Role;
  endedEarly?: boolean;
  endRequest?: VoteRequest;
  kickRequest?: VoteRequest;
  resultReason?: 'normal' | 'early-end';
  deadline?: number;
  lastActivity: number;
  usedWordPairIds: Set<string>;
  wordPair?: WordPair;
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), '请求格式不正确');
  return value as Record<string, unknown>;
}

function profile(value: unknown) {
  const input = object(value);
  requireValue(typeof input.nickname === 'string', '请填写昵称');
  const nickname = input.nickname.trim();
  requireValue(nickname.length >= 1 && [...nickname].length <= 12 && !/[\u0000-\u001f\u007f]/.test(nickname), '昵称须为 1 至 12 个字符');
  requireValue(Number.isInteger(input.avatar) && (input.avatar as number) >= 0 && (input.avatar as number) <= 7, '请选择有效头像');
  return { nickname, avatar: input.avatar as number };
}

function settings(value: unknown): RoomSettings {
  const input = object(value ?? DEFAULT_SETTINGS);
  requireValue(Number.isInteger(input.capacity) && (input.capacity as number) >= 4 && (input.capacity as number) <= 12, '房间人数须为 4 至 12 人');
  requireValue(Number.isInteger(input.undercoverCount) && (input.undercoverCount as number) >= 1 && (input.undercoverCount as number) < (input.capacity as number) / 2, '卧底人数须少于总人数的一半');
  requireValue(input.category === 'all' || WORD_CATEGORIES.some(category => category.value === input.category), '请选择有效词库');
  const difficulty = input.difficulty === undefined ? DEFAULT_SETTINGS.difficulty : input.difficulty;
  requireValue(DIFFICULTIES.some(option => option.value === difficulty), '请选择有效难度');
  requireValue([60, 90, 120].includes(input.turnSeconds as number), '发言时间须为 60、90 或 120 秒');
  return { capacity: input.capacity, undercoverCount: input.undercoverCount, category: input.category, difficulty, turnSeconds: input.turnSeconds } as RoomSettings;
}

function commandInput(value: unknown): ClientCommand {
  const input = object(value);
  requireValue(['ready', 'away', 'start', 'reveal-ready', 'speak', 'vote', 'restart', 'request-end', 'vote-end', 'request-kick', 'vote-kick', 'leave', 'ping'].includes(input.type as string), '请求类型不正确');
  if (input.type === 'ready') requireValue(typeof input.ready === 'boolean', '请求格式不正确');
  if (input.type === 'away') requireValue(typeof input.away === 'boolean', '请求格式不正确');
  if (input.type === 'speak') requireValue(typeof input.text === 'string' && input.text.trim().length > 0 && [...input.text.trim()].length <= 120, '发言须为 1 至 120 个字符');
  if (input.type === 'vote') requireValue(typeof input.targetId === 'string' && input.targetId.length <= 64, '投票请求格式不正确');
  if (input.type === 'vote-end' || input.type === 'vote-kick') requireValue(typeof (input.type === 'vote-end' ? input.approve : input.agree) === 'boolean', '投票请求格式不正确');
  if (input.type === 'request-kick') requireValue(typeof input.targetId === 'string' && input.targetId.length <= 64, '踢人请求格式不正确');
  return input as unknown as ClientCommand;
}

export class GameEngine {
  private rooms = new Map<string, Room>();
  private tokens = new Map<string, { room: Room; player: Player }>();
  private now: () => number;
  private random: () => number;
  private wordPairs: () => readonly WordPair[];
  onChange?: (code: string) => void;

  constructor(options: { now?: () => number; random?: () => number; wordPairs?: () => readonly WordPair[] } = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? (() => randomInt(0, 0x100000000) / 0x100000000);
    this.wordPairs = options.wordPairs ?? (() => WORD_PAIRS);
  }

  private activeVoters(room: Room, excludeId?: string): Player[] {
    return room.players.filter((p) => p.alive && !p.left && p.connected && !p.away && p.id !== excludeId);
  }

  private requestView(room: Room, request: VoteRequest): NonNullable<RoomView['earlyEndRequest']> {
    const eligibleIds = this.activeVoters(room, request.targetId).map((p) => p.id);
    const approvedIds = eligibleIds.filter((id) => request.votes.get(id) === true);
    return {
      proposerId: request.proposerId,
      targetId: request.targetId,
      eligibleIds,
      approvedIds,
      votedIds: eligibleIds.filter((id) => request.votes.has(id)),
      required: Math.max(1, Math.ceil(eligibleIds.length / 2)),
    };
  }

  private requestEnd(room: Room, player: Player): void {
    requireValue(room.phase !== 'lobby' && room.phase !== 'result', '当前阶段不能申请提前结束');
    requireValue(player.alive && player.connected && !player.away, '请先返回房间再发起申请');
    requireValue(!room.endRequest, '已有提前结束申请，请先完成投票');
    room.endRequest = { proposerId: player.id, votes: new Map([[player.id, true]]) };
    this.message(room, `${player.nickname} 发起了提前结束申请。`);
    this.resolveEndRequest(room);
  }

  private voteEnd(room: Room, player: Player, agree: boolean): void {
    requireValue(room.endRequest, '当前没有提前结束申请');
    const request = room.endRequest;
    const eligible = this.activeVoters(room).map((p) => p.id);
    requireValue(eligible.includes(player.id), '当前不可参与投票');
    requireValue(!request.votes.has(player.id), '你已经投过票');
    request.votes.set(player.id, agree);
    this.resolveEndRequest(room);
  }

  private resolveEndRequest(room: Room): void {
    if (!room.endRequest) return;
    const view = this.requestView(room, room.endRequest);
    const approvals = view.approvedIds.length;
    if (approvals >= view.required) {
      delete room.endRequest;
      room.resultReason = 'early-end';
      room.endedEarly = true;
      room.phase = 'result';
      room.queue = [];
      delete room.deadline;
      this.message(room, '经多数玩家同意，本局提前结束。');
      return;
    }
    if (view.votedIds.length >= view.eligibleIds.length) {
      const proposer = room.players.find((p) => p.id === room.endRequest?.proposerId);
      delete room.endRequest;
      this.message(room, `${proposer?.nickname || '玩家'} 的提前结束申请未通过。`);
    }
  }

  private requestKick(room: Room, player: Player, targetId: string): void {
    requireValue(room.phase !== 'lobby' && room.phase !== 'result', '当前阶段不能发起踢人申请');
    requireValue(player.alive && player.connected && !player.away, '请先返回房间再发起申请');
    requireValue(!room.kickRequest, '已有踢人申请，请先完成投票');
    const target = room.players.find((p) => p.id === targetId && p.alive && !p.left);
    requireValue(target && target.id !== player.id, '请选择有效的其他玩家');
    room.kickRequest = { proposerId: player.id, targetId, votes: new Map([[player.id, true]]) };
    this.message(room, `${player.nickname} 发起了将 ${target.nickname} 请出房间的申请。`);
    this.resolveKickRequest(room);
  }

  private voteKick(room: Room, player: Player, agree: boolean): void {
    requireValue(room.kickRequest?.targetId, '当前没有踢人申请');
    const request = room.kickRequest;
    const eligible = this.activeVoters(room, request.targetId).map((p) => p.id);
    requireValue(eligible.includes(player.id), '当前不可参与投票');
    requireValue(!request.votes.has(player.id), '你已经投过票');
    request.votes.set(player.id, agree);
    this.resolveKickRequest(room);
  }

  private resolveKickRequest(room: Room): void {
    if (!room.kickRequest?.targetId) return;
    const request = room.kickRequest;
    const view = this.requestView(room, request);
    if (view.approvedIds.length >= view.required) {
      const target = room.players.find((p) => p.id === request.targetId && !p.left);
      delete room.kickRequest;
      if (target) this.kick(room, target);
      return;
    }
    if (view.votedIds.length >= view.eligibleIds.length) {
      const target = room.players.find((p) => p.id === request.targetId);
      delete room.kickRequest;
      this.message(room, `将 ${target?.nickname || '玩家'} 请出房间的申请未通过。`);
    }
  }

  create(value: unknown): Session {
    const input = object(value);
    const info = profile(input);
    const roomSettings = settings(input.settings);
    this.tick();
    requireValue(this.rooms.size < 500, '房间暂时已满，请稍后重试');
    let code: string;
    do { code = String(randomInt(100000, 1000000)); } while (this.rooms.has(code));
    const room: Room = { code, hostId: '', settings: roomSettings, players: [], phase: 'lobby', round: 0, messages: [], queue: [], votes: new Map(), voteCandidates: [], lastActivity: this.now(), usedWordPairIds: new Set() };
    this.rooms.set(code, room);
    const session = this.addPlayer(room, info);
    room.hostId = session.playerId;
    room.players[0]!.ready = true;
    return session;
  }

  join(code: string, value: unknown): Session {
    const info = profile(value);
    requireValue(/^\d{6}$/.test(code), '请输入六位房间号');
    this.tick();
    const room = this.rooms.get(code);
    requireValue(room, '房间不存在或已过期');
    requireValue(room.phase === 'lobby', '游戏已开始，请等待下一局');
    requireValue(room.players.length < room.settings.capacity, '房间已满');
    const session = this.addPlayer(room, info);
    this.changed(room);
    return session;
  }

  private addPlayer(room: Room, info: ReturnType<typeof profile>): Session {
    const player: Player = { ...info, id: randomUUID(), token: randomBytes(24).toString('hex'), connected: false, away: false, ready: false, alive: true, hasRevealed: false, hasVoted: false, left: false, disconnectedAt: this.now() };
    room.players.push(player);
    room.lastActivity = this.now();
    this.tokens.set(player.token, { room, player });
    return { token: player.token, playerId: player.id, roomCode: room.code };
  }

  private member(token: string) {
    const member = this.tokens.get(token);
    requireValue(member, '房间凭证已失效，请重新加入');
    return member;
  }

  connect(token: string): RoomView {
    const { room, player } = this.member(token);
    this.pruneLobby(room);
    this.member(token);
    player.connected = true;
    delete player.disconnectedAt;
    this.transferHost(room);
    this.changed(room);
    return this.view(token);
  }

  disconnect(token: string): void {
    const member = this.tokens.get(token);
    if (!member) return;
    if (member.player.connected) member.player.disconnectedAt = this.now();
    member.player.connected = false;
    this.transferHost(member.room);
    this.resolveEndRequest(member.room);
    this.resolveKickRequest(member.room);
    this.changed(member.room);
  }

  view(token: string): RoomView {
    const { room, player } = this.member(token);
    const state: RoomView = {
      code: room.code, hostId: room.hostId, selfId: player.id, settings: { ...room.settings }, phase: room.phase, round: room.round,
      players: room.players.map(({ id, nickname, avatar, connected, away, ready, alive, hasRevealed, hasVoted, kicked }) => ({ id, nickname, avatar, connected, away, ready, alive, hasRevealed, hasVoted, kicked })),
      messages: room.messages.map((message) => ({ ...message })), voteCandidates: [...room.voteCandidates],
    };
    if (room.phase !== 'lobby') state.word = player.word;
    if (room.deadline) state.deadline = room.deadline;
    if (room.phase === 'speaking') state.speakerId = room.queue[0];
    if (room.lastVote) state.lastVote = { ...room.lastVote, counts: { ...room.lastVote.counts }, tiedIds: [...room.lastVote.tiedIds] };
    if (room.phase === 'result') {
      state.winner = room.winner;
      state.resultReason = room.resultReason ?? 'normal';
      state.endedEarly = room.resultReason === 'early-end';
      state.words = { ...room.words! };
      const pair = room.wordPair!;
      state.wordInfo = { category: pair.category, difficulty: pair.difficulty, sharedTrait: pair.sharedTrait, distinction: pair.distinction };
      state.reveal = room.players.map((p) => ({ playerId: p.id, role: p.role!, word: p.word! }));
    }
    if (room.endRequest) state.earlyEndRequest = this.requestView(room, room.endRequest);
    if (room.kickRequest?.targetId) state.kickRequest = { ...this.requestView(room, room.kickRequest), targetId: room.kickRequest.targetId };
    return state;
  }

  command(token: string, value: unknown): 'left' | 'pong' | undefined {
    const action = commandInput(value);
    const { room, player } = this.member(token);
    this.pruneLobby(room);
    this.member(token);
    if (this.advanceDeadline(room)) {
      requireValue(!['reveal-ready', 'speak', 'vote'].includes(action.type), '当前阶段已超时，请按最新状态操作');
    }
    if (action.type === 'ping') return 'pong';
    if (action.type === 'leave') {
      this.leave(room, player);
      return 'left';
    }
    switch (action.type) {
      case 'away':
        if (player.away !== action.away) {
          player.away = action.away;
          if (room.phase === 'lobby') player.ready = !player.away && player.id === room.hostId;
        }
        this.transferHost(room);
        this.resolveEndRequest(room);
        this.resolveKickRequest(room);
        break;
      case 'ready':
        requireValue(room.phase === 'lobby', '只能在准备阶段操作');
        requireValue(!action.ready || !player.away, '请先返回房间再准备');
        player.ready = action.ready;
        break;
      case 'start':
        requireValue(player.id === room.hostId, '只有房主可以开始游戏');
        requireValue(room.phase === 'lobby', '游戏已经开始');
        requireValue(room.players.length >= 4, '至少需要 4 位玩家');
        requireValue(room.players.every((p) => p.ready && p.connected && !p.away), '请等待所有玩家返回房间、上线并准备');
        requireValue(room.settings.undercoverCount < room.players.length / 2, '当前人数不足，请减少卧底人数或等待更多玩家');
        this.start(room);
        break;
      case 'reveal-ready':
        requireValue(room.phase === 'reveal' && player.alive, '当前不是看词阶段');
        player.hasRevealed = true;
        if (room.players.filter((p) => p.alive).every((p) => p.hasRevealed)) this.beginRound(room);
        break;
      case 'speak':
        requireValue(room.phase === 'speaking' && room.queue[0] === player.id && player.alive, '还没有轮到你发言');
        this.message(room, action.text.trim(), player);
        this.nextSpeaker(room);
        break;
      case 'vote':
        requireValue(room.phase === 'voting' && player.alive, '当前不是你的投票阶段');
        requireValue(!player.hasVoted, '你已经投票，请等待其他玩家');
        requireValue(action.targetId !== player.id, '不能投票给自己');
        requireValue(room.voteCandidates.includes(action.targetId) && room.players.some((p) => p.id === action.targetId && p.alive), '请选择有效候选玩家');
        room.votes.set(player.id, action.targetId);
        player.hasVoted = true;
        if (room.players.filter((p) => p.alive).every((p) => p.hasVoted)) this.resolveVotes(room);
        break;
      case 'request-end':
        this.requestEnd(room, player);
        break;
      case 'vote-end':
        this.voteEnd(room, player, action.approve);
        break;
      case 'request-kick':
        this.requestKick(room, player, action.targetId);
        break;
      case 'vote-kick':
        this.voteKick(room, player, action.agree);
        break;
      case 'restart':
        requireValue(player.id === room.hostId, '只有房主可以再来一局');
        requireValue(room.phase === 'result', '请等待本局结束');
        room.players = room.players.filter((p) => !p.left);
        room.players.forEach((p) => { p.ready = p.id === room.hostId && !p.away; p.alive = true; p.hasRevealed = false; p.hasVoted = false; delete p.word; delete p.role; });
        room.phase = 'lobby'; room.round = 0; room.messages = []; room.queue = []; room.votes.clear(); room.voteCandidates = [];
        delete room.words; delete room.winner; delete room.deadline; delete room.lastVote; delete room.resultReason; delete room.endedEarly; delete room.endRequest; delete room.kickRequest;
        break;
    }
    this.pruneLobby(room);
    this.changed(room);
  }

  private start(room: Room) {
    const pool = this.wordPairs().filter(pair => (room.settings.category === 'all' || pair.category === room.settings.category) &&
      (room.settings.difficulty === 'all' || pair.difficulty === room.settings.difficulty));
    const pair = drawWordPair(pool, room.usedWordPairIds, this.random, room.wordPair?.id);
    room.wordPair = pair;
    const swapped = this.random() < 0.5;
    room.words = { civilian: pair.words[swapped ? 1 : 0], undercover: pair.words[swapped ? 0 : 1] };
    const shuffled = [...room.players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const undercover = new Set(shuffled.slice(0, room.settings.undercoverCount).map((p) => p.id));
    room.players.forEach((p) => { p.role = undercover.has(p.id) ? 'undercover' : 'civilian'; p.word = room.words![p.role]; });
    room.phase = 'reveal'; room.deadline = this.now() + 45_000;
    this.message(room, '游戏开始，请查看自己的词语。');
  }

  private beginRound(room: Room) {
    room.round++;
    room.voteCandidates = room.players.filter((p) => p.alive).map((p) => p.id);
    this.beginSpeaking(room, room.voteCandidates);
  }

  private beginSpeaking(room: Room, ids: string[]) {
    room.phase = 'speaking';
    room.queue = [...ids];
    room.votes.clear();
    room.players.forEach((p) => { p.hasVoted = false; });
    room.deadline = this.now() + room.settings.turnSeconds * 1000;
  }

  private nextSpeaker(room: Room) {
    room.queue.shift();
    if (room.queue.length) room.deadline = this.now() + room.settings.turnSeconds * 1000;
    else this.beginVoting(room);
  }

  private beginVoting(room: Room) {
    room.phase = 'voting'; room.deadline = this.now() + 45_000;
    this.message(room, '发言结束，开始投票。');
  }

  private resolveVotes(room: Room) {
    const counts: Record<string, number> = {};
    for (const target of room.votes.values()) {
      if (room.voteCandidates.includes(target)) counts[target] = (counts[target] ?? 0) + 1;
    }
    const max = Math.max(0, ...Object.values(counts));
    const tiedIds = room.voteCandidates.filter((id) => counts[id] === max);
    room.lastVote = { counts, tiedIds: tiedIds.length > 1 ? tiedIds : [] };
    if (!max) {
      this.message(room, '本轮无人投票，进入下一轮。');
      this.beginRound(room);
    } else if (tiedIds.length > 1) {
      room.voteCandidates = tiedIds;
      this.message(room, '票数相同，平票玩家补充发言后重新投票。');
      this.beginSpeaking(room, tiedIds);
    } else {
      const eliminated = room.players.find((p) => p.id === tiedIds[0])!;
      eliminated.alive = false;
      room.lastVote.eliminatedId = eliminated.id;
      this.message(room, `${eliminated.nickname} 被投票出局。`);
      if (!this.checkWinner(room)) this.beginRound(room);
    }
  }

  private checkWinner(room: Room): boolean {
    const alive = room.players.filter((p) => p.alive);
    const undercover = alive.filter((p) => p.role === 'undercover').length;
    if (!undercover) room.winner = 'civilian';
    else if (undercover >= alive.length - undercover) room.winner = 'undercover';
    else return false;
    room.phase = 'result'; room.queue = []; delete room.deadline;
    delete room.endRequest;
    delete room.kickRequest;
    room.resultReason = 'normal';
    this.message(room, room.winner === 'civilian' ? '平民获胜！' : '卧底获胜！');
    return true;
  }

  private kick(room: Room, player: Player): void {
    this.tokens.delete(player.token);
    player.left = true;
    player.kicked = true;
    player.connected = false;
    player.alive = false;
    if (room.phase === 'lobby') room.players = room.players.filter((p) => p.id !== player.id);
    this.transferHost(room);
    if (!room.players.some((p) => !p.left)) {
      this.rooms.delete(room.code);
      this.onChange?.(room.code);
      return;
    }
    if (room.phase !== 'lobby' && room.phase !== 'result') {
      this.message(room, `${player.nickname} 已被多数玩家请出本局。`);
      const wasSpeaker = room.queue[0] === player.id;
      room.queue = room.queue.filter((id) => id !== player.id);
      room.voteCandidates = room.voteCandidates.filter((id) => id !== player.id);
      room.votes.delete(player.id);
      for (const [voterId, targetId] of room.votes) {
        if (targetId !== player.id) continue;
        room.votes.delete(voterId);
        const voter = room.players.find((p) => p.id === voterId && p.alive);
        if (voter) voter.hasVoted = false;
      }
      if (!this.checkWinner(room)) {
        if (room.phase === 'reveal' && room.players.filter((p) => p.alive).every((p) => p.hasRevealed)) this.beginRound(room);
        else if (room.phase === 'speaking' && !room.queue.length) this.beginVoting(room);
        else if (room.phase === 'speaking' && wasSpeaker) room.deadline = this.now() + room.settings.turnSeconds * 1000;
        else if (room.phase === 'voting' && room.players.filter((p) => p.alive).every((p) => p.hasVoted)) this.resolveVotes(room);
      }
    }
    this.resolveEndRequest(room);
    this.resolveKickRequest(room);
    this.changed(room);
  }

  private leave(room: Room, player: Player) {
    if (room.endRequest?.proposerId === player.id) delete room.endRequest;
    if (room.kickRequest?.proposerId === player.id || room.kickRequest?.targetId === player.id) delete room.kickRequest;
    this.tokens.delete(player.token);
    player.left = true; player.connected = false; player.alive = false;
    if (room.phase === 'lobby') room.players = room.players.filter((p) => p.id !== player.id);
    this.transferHost(room);
    if (!room.players.some((p) => !p.left)) {
      this.rooms.delete(room.code);
      this.onChange?.(room.code);
      return;
    }
    if (room.phase !== 'lobby' && room.phase !== 'result') {
      this.message(room, `${player.nickname} 离开了本局。`);
      if (!this.checkWinner(room)) {
        const wasSpeaker = room.queue[0] === player.id;
        room.queue = room.queue.filter((id) => id !== player.id);
        room.voteCandidates = room.voteCandidates.filter((id) => id !== player.id);
        room.votes.delete(player.id);
        for (const [voterId, targetId] of room.votes) {
          if (targetId !== player.id) continue;
          room.votes.delete(voterId);
          const voter = room.players.find((p) => p.id === voterId && p.alive);
          if (voter) voter.hasVoted = false;
        }
        if (room.phase === 'reveal' && room.players.filter((p) => p.alive).every((p) => p.hasRevealed)) this.beginRound(room);
        else if (room.phase === 'speaking' && !room.queue.length) this.beginVoting(room);
        else if (room.phase === 'speaking' && wasSpeaker) room.deadline = this.now() + room.settings.turnSeconds * 1000;
        else if (room.phase === 'voting' && room.players.filter((p) => p.alive).every((p) => p.hasVoted)) this.resolveVotes(room);
      }
    }
    this.resolveEndRequest(room);
    this.resolveKickRequest(room);
    this.changed(room);
  }

  private transferHost(room: Room) {
    const current = room.players.find((p) => p.id === room.hostId && !p.left);
    if (current?.connected && !current.away) return;
    const next = room.players.find((p) => p.connected && !p.away && !p.left) ?? current ?? room.players.find((p) => !p.left);
    if (next) {
      room.hostId = next.id;
      if (room.phase === 'lobby') next.ready = !next.away;
    }
  }

  private message(room: Room, text: string, player?: Player) {
    room.messages.push({ id: randomUUID(), playerId: player?.id ?? '', nickname: player?.nickname ?? '系统', text, round: room.round, kind: player ? 'speech' : 'system', createdAt: this.now() });
    if (room.messages.length > 160) room.messages.splice(0, room.messages.length - 160);
  }

  private changed(room: Room) {
    room.lastActivity = this.now();
    this.onChange?.(room.code);
  }

  private pruneLobby(room: Room) {
    if (room.phase !== 'lobby') return;
    const expired = room.players.filter((p) => !p.connected && p.disconnectedAt !== undefined && this.now() - p.disconnectedAt >= 120_000);
    expired.forEach((player) => this.leave(room, player));
  }

  private advanceDeadline(room: Room): boolean {
    if (room.deadline === undefined || room.deadline > this.now()) return false;
    if (room.phase === 'reveal') this.beginRound(room);
    else if (room.phase === 'speaking') this.nextSpeaker(room);
    else if (room.phase === 'voting') this.resolveVotes(room);
    this.onChange?.(room.code);
    return true;
  }

  tick() {
    for (const room of this.rooms.values()) {
      if (this.now() - room.lastActivity > 2 * 60 * 60 * 1000) {
        this.rooms.delete(room.code);
        room.players.forEach((p) => this.tokens.delete(p.token));
        this.onChange?.(room.code);
      } else {
        this.pruneLobby(room);
        this.advanceDeadline(room);
      }
    }
  }
}
