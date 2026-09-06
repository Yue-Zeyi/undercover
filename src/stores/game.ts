import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ClientCommand, RoomSettings, RoomView, Session } from '../../shared/protocol';
import { GameConnection, requestSession } from '../services/connection';
import type { ConnectionStatus } from '../services/connection';

const SESSION_KEY = 'wodi-session-v1';

export const useGameStore = defineStore('game', () => {
  const room = ref<RoomView | null>(null);
  const session = ref<Session | null>(null);
  const status = ref<ConnectionStatus>('idle');
  const busy = ref(false);
  const error = ref('');
  const atHome = ref(false);
  let pendingLeave = false;

  const connection = new GameConnection({
    onStatus(value) { status.value = value; },
    onError(message) { error.value = message; busy.value = false; },
    onMessage(message) {
      if (message.type === 'state') {
        room.value = message.state;
        error.value = '';
        busy.value = pendingLeave;
        if (pendingLeave) connection.send({ type: 'leave' });
        else {
          const self = message.state.players.find(player => player.id === message.state.selfId);
          if (self && self.away !== atHome.value) connection.send({ type: 'away', away: atHome.value });
        }
      } else if (message.type === 'error') {
        error.value = message.message;
        busy.value = false;
        if (message.fatal) reset(message.code === 'SESSION_REPLACED');
      } else if (message.type === 'left') {
        reset();
      }
    },
  });

  function persist(): void {
    if (session.value) {
      uni.setStorageSync(SESSION_KEY, { ...session.value, pendingLeave, atHome: atHome.value });
    }
  }

  function reset(preserveSavedSession = false): void {
    const token = session.value?.token;
    connection.stop();
    room.value = null;
    session.value = null;
    pendingLeave = false;
    atHome.value = false;
    busy.value = false;
    const saved = uni.getStorageSync(SESSION_KEY) as Partial<Session> | undefined;
    if (!preserveSavedSession && token && saved?.token === token) {
      uni.removeStorageSync(SESSION_KEY);
    }
  }

  async function enter(path: string, data: Record<string, unknown>): Promise<void> {
    if (busy.value || session.value) return;
    busy.value = true;
    error.value = '';
    try {
      session.value = await requestSession(path, data);
      persist();
      connection.start(session.value.token);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '进入房间失败，请重试';
      busy.value = false;
    }
  }

  function createRoom(nickname: string, avatar: number, settings: RoomSettings): Promise<void> {
    return enter('/api/rooms', { nickname: nickname.trim(), avatar, settings });
  }

  function joinRoom(code: string, nickname: string, avatar: number): Promise<void> {
    return enter(`/api/rooms/${encodeURIComponent(code.trim())}/join`, { nickname: nickname.trim(), avatar });
  }

  function restore(): void {
    if (!session.value) {
      const saved = uni.getStorageSync(SESSION_KEY) as Partial<Session> & { pendingLeave?: boolean; atHome?: boolean };
      if (!saved || typeof saved.token !== 'string' || typeof saved.playerId !== 'string' ||
        typeof saved.roomCode !== 'string') return;
      session.value = { token: saved.token, playerId: saved.playerId, roomCode: saved.roomCode };
      pendingLeave = saved.pendingLeave === true;
      atHome.value = saved.atHome === true;
      busy.value = pendingLeave;
    }
    connection.start(session.value.token);
  }

  function send(command: ClientCommand): boolean {
    if (pendingLeave) return false;
    const sent = connection.send(command);
    if (!sent) error.value = '连接尚未恢复，请稍后重试';
    return sent;
  }

  function leave(): void {
    if (!session.value) return;
    pendingLeave = true;
    busy.value = true;
    error.value = '';
    persist();
    if (!connection.send({ type: 'leave' })) connection.start(session.value.token);
  }

  function reconnect(): void {
    if (session.value) connection.reconnect(session.value.token);
    else restore();
  }

  function disconnectForBackground(): void {
    connection.stop();
  }

  function changeView(home: boolean): void {
    if (!session.value || pendingLeave) return;
    atHome.value = home;
    persist();
    if (!connection.send({ type: 'away', away: home })) connection.start(session.value.token);
  }

  function goHome(): void { changeView(true); }
  function returnToRoom(): void { changeView(false); }

  function clearError(): void { error.value = ''; }

  return {
    room, session, status, busy, error, atHome,
    createRoom, joinRoom, restore, send, leave, reconnect, disconnectForBackground, clearError, goHome, returnToRoom,
  };
});
