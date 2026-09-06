import { DEFAULT_SYSTEM_CONFIG, type ClientCommand, type ServerMessage, type Session, type SystemConfig } from '../../shared/protocol';
import { WORD_CATEGORIES, type WordCatalog } from '../../shared/word-catalog';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

function apiBaseUrl(): string {
  let base = import.meta.env?.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || '';
  // #ifdef H5
  if (!base && typeof location !== 'undefined') base = location.origin;
  // #endif
  if (!/^https?:\/\//.test(base)) {
    throw new Error('请在构建前配置有效的 VITE_API_BASE_URL 后端地址');
  }
  return base;
}

export function requestWordCatalog(): Promise<WordCatalog> {
  const difficulties = ['easy', 'normal', 'hard'] as const;
  const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
  const validCounts = (value: WordCatalog['difficulties'] | undefined) =>
    !!value && typeof value === 'object' && difficulties.every(difficulty => isCount(value[difficulty]));
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${apiBaseUrl()}/api/catalog`,
      timeout: 12000,
      success(response) {
        const result = response.data as WordCatalog;
        const valid = response.statusCode === 200 && isCount(result?.total) && validCounts(result.difficulties) &&
          Array.isArray(result.categories) && result.categories.length === WORD_CATEGORIES.length &&
          result.categories.every(category => category && isCount(category.count) && validCounts(category.difficulties) &&
            category.count === difficulties.reduce((sum, difficulty) => sum + category.difficulties[difficulty], 0)) &&
          WORD_CATEGORIES.every(({ value }) => result.categories.some(category => category.id === value)) &&
          result.total === result.categories.reduce((sum, category) => sum + category.count, 0) &&
          difficulties.every(difficulty => result.difficulties[difficulty] ===
            result.categories.reduce((sum, category) => sum + category.difficulties[difficulty], 0));
        if (valid) resolve(result);
        else reject(new Error('词库数量暂时无法加载'));
      },
      fail() { reject(new Error('词库数量暂时无法加载')); },
    });
  });
}

export function requestSystemConfig(): Promise<SystemConfig> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${apiBaseUrl()}/api/config`,
      timeout: 12000,
      success(response) {
        const result = response.data as Partial<SystemConfig>;
        if (response.statusCode === 200 && typeof result?.systemName === 'string' && typeof result?.icp === 'string') {
          resolve({ systemName: result.systemName.trim() || DEFAULT_SYSTEM_CONFIG.systemName, icp: result.icp.trim() });
        } else reject(new Error('系统设置暂时无法加载'));
      },
      fail() { reject(new Error('系统设置暂时无法加载')); },
    });
  });
}

export function requestSession(path: string, data: Record<string, unknown>): Promise<Session> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${apiBaseUrl()}${path}`,
      method: 'POST',
      data,
      timeout: 12000,
      success(response) {
        const result = response.data as Partial<Session> & { message?: string; error?: string };
        if (response.statusCode >= 200 && response.statusCode < 300 &&
          typeof result?.token === 'string' && typeof result.playerId === 'string' &&
          typeof result.roomCode === 'string') {
          resolve(result as Session);
        } else {
          reject(new Error(result?.message || result?.error || '暂时无法进入房间，请稍后重试'));
        }
      },
      fail() { reject(new Error('无法连接服务器，请检查网络后重试')); },
    });
  });
}

interface ConnectionCallbacks {
  onStatus: (status: ConnectionStatus) => void;
  onMessage: (message: ServerMessage) => void;
  onError: (message: string) => void;
}

export class GameConnection {
  private callbacks: ConnectionCallbacks;
  private socket: UniApp.SocketTask | null = null;
  private token: string | null = null;
  private generation = 0;
  private attempt = 0;
  private ready = false;
  private lastReceived = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private syncTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(callbacks: ConnectionCallbacks) {
    this.callbacks = callbacks;
  }

  start(token: string): void {
    if (this.token === token && (this.socket || this.retryTimer)) return;
    this.reconnect(token);
  }

  reconnect(token: string): void {
    this.clearSocket();
    this.token = token;
    this.attempt = 0;
    this.open();
  }

  stop(): void {
    this.token = null;
    this.clearSocket();
    this.callbacks.onStatus('idle');
  }

  send(command: ClientCommand): boolean {
    if (!this.ready || !this.socket) return false;
    return this.write(command, this.generation);
  }

  private write(command: ClientCommand, generation: number): boolean {
    try {
      if (!this.socket) return false;
      this.socket.send({
        data: JSON.stringify(command),
        fail: () => this.scheduleReconnect(generation),
      });
      return true;
    } catch {
      this.scheduleReconnect(generation);
      return false;
    }
  }

  private open(): void {
    if (!this.token) return;
    const generation = ++this.generation;
    this.callbacks.onStatus(this.attempt ? 'reconnecting' : 'connecting');
    let url: string;
    try {
      url = `${apiBaseUrl().replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(this.token)}`;
    } catch (error) {
      this.stop();
      this.callbacks.onError((error as Error).message);
      return;
    }
    try {
      const socket = uni.connectSocket({
        url,
        complete() {},
      });
      this.socket = socket;
      this.syncTimer = setTimeout(() => this.scheduleReconnect(generation), 12000);
      socket.onOpen(() => {
        if (generation !== this.generation) return;
        this.lastReceived = Date.now();
        this.heartbeatTimer = setInterval(() => {
          if (Date.now() - this.lastReceived >= 30000) {
            this.scheduleReconnect(generation);
          } else {
            this.write({ type: 'ping' }, generation);
          }
        }, 10000);
      });
      socket.onMessage(event => {
        if (generation !== this.generation || typeof event.data !== 'string') return;
        let message: ServerMessage;
        try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
        if (!message || typeof message !== 'object') return;
        this.lastReceived = Date.now();
        if (message.type === 'state') {
          clearTimeout(this.syncTimer);
          this.syncTimer = undefined;
          this.ready = true;
          this.attempt = 0;
          this.callbacks.onStatus('connected');
        } else if (message.type === 'left' || (message.type === 'error' && message.fatal)) {
          this.stop();
        }
        this.callbacks.onMessage(message);
      });
      socket.onClose(() => this.scheduleReconnect(generation));
      socket.onError(() => this.scheduleReconnect(generation));
    } catch {
      this.scheduleReconnect(generation);
    }
  }

  private scheduleReconnect(generation: number): void {
    if (generation !== this.generation || !this.token) return;
    this.clearSocket();
    this.attempt += 1;
    this.callbacks.onStatus('reconnecting');
    const delay = Math.min(1000 * 2 ** Math.min(this.attempt - 1, 4), 15000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.open();
    }, delay);
  }

  private clearSocket(): void {
    // Invalidate callbacks before close(), which can synchronously emit a close event.
    this.generation += 1;
    this.ready = false;
    clearTimeout(this.retryTimer);
    clearTimeout(this.syncTimer);
    clearInterval(this.heartbeatTimer);
    this.retryTimer = undefined;
    this.syncTimer = undefined;
    this.heartbeatTimer = undefined;
    const socket = this.socket;
    this.socket = null;
    try { socket?.close({ code: 1000 }); } catch { /* Already closed. */ }
  }
}
