<script setup lang="ts">
import { computed } from 'vue';
import type { RoomView } from '../../shared/protocol';
import { DIFFICULTIES, WORD_CATEGORIES } from '../../shared/word-catalog';
import { useGameStore } from '../stores/game';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ room: RoomView }>();
defineEmits<{ invite: [] }>();
const game = useGameStore();
const me = computed(() => props.room.players.find(p => p.id === props.room.selfId));
const isHost = computed(() => props.room.hostId === props.room.selfId);
const readyCount = computed(() => props.room.players.filter(p => p.ready && p.connected && !p.away).length);
const canStart = computed(() => props.room.players.length >= 4 && readyCount.value === props.room.players.length && props.room.settings.undercoverCount < props.room.players.length / 2 && game.status === 'connected');
const slots = computed(() => Array.from({ length: props.room.settings.capacity }, (_, index) => props.room.players[index] || null));
const category = computed(() => WORD_CATEGORIES.find(item => item.value === props.room.settings.category)?.label || '全部主题');
const difficulty = computed(() => DIFFICULTIES.find(item => item.value === props.room.settings.difficulty)?.label || '标准');
const waitingText = computed(() => {
  if (props.room.players.length < 4) return `还差 ${4 - props.room.players.length} 位朋友即可开局`;
  if (props.room.settings.undercoverCount >= props.room.players.length / 2) return '等待更多玩家加入';
  if (props.room.players.some(p => p.away && p.connected)) return '等待挂机玩家回到房间';
  if (readyCount.value < props.room.players.length) return '等待大家准备';
  return isHost.value ? '人齐了，开始这场试探吧' : '全员已准备，等待房主开局';
});
</script>

<template>
  <view class="lobby">
    <view class="room-summary">
      <view class="row"><AppIcon name="users" :size="18" /><text>{{ room.players.length }} / {{ room.settings.capacity }} 人</text></view>
      <view class="summary-separator" />
      <text>{{ room.settings.undercoverCount }} 位卧底</text>
      <view class="summary-separator" />
      <text>{{ category }} · {{ difficulty }}</text>
      <view class="summary-separator" />
      <text>{{ room.settings.turnSeconds }} 秒发言</text>
    </view>

    <view class="row between section-title"><text class="heading">等朋友入座</text><text class="muted small">{{ readyCount }} 人已准备</text></view>
    <view class="seats">
      <view v-for="(player, index) in slots" :key="player?.id || `empty-${index}`" class="seat" :class="{ empty: !player, yours: player?.id === room.selfId }">
        <template v-if="player">
          <view class="seat-number mono">{{ String(index + 1).padStart(2, '0') }}</view>
          <view v-if="player.id === room.hostId" class="host-mark"><AppIcon name="crown" :size="13" /><text>房主</text></view>
          <image class="player-avatar" :src="`/static/avatars/${player.avatar}.svg`" mode="aspectFit" />
          <view class="player-name"><text>{{ player.nickname }}</text><text v-if="player.id === room.selfId" class="self-mark">我</text></view>
          <view class="player-status" :class="{ ready: player.ready && player.connected && !player.away }">
            <AppIcon v-if="player.ready && player.connected && !player.away" name="check" :size="13" />
            <AppIcon v-else-if="player.away && player.connected" name="pause" :size="13" />
            <text>{{ !player.connected ? '暂时离线' : player.away ? '挂机中' : player.ready ? '已准备' : '准备中' }}</text>
          </view>
        </template>
        <button v-else class="empty-seat-button" :aria-label="`邀请第 ${index + 1} 位玩家`" @tap="$emit('invite')">
          <view class="empty-avatar"><AppIcon name="plus" :size="23" /></view>
          <text>虚位以待</text>
        </button>
      </view>
    </view>
    <view class="lobby-actions">
      <view class="waiting"><view class="dot" /><text>{{ waitingText }}</text></view>
      <view class="action-buttons">
        <button class="btn invite-button" @tap="$emit('invite')"><AppIcon name="link" :size="18" /><text>邀请好友</text></button>
        <button v-if="isHost" class="btn btn-primary main-button" :disabled="!canStart" @tap="game.send({ type: 'start' })"><text>开始游戏</text><AppIcon name="arrow-right" :size="18" light /></button>
        <button v-else class="btn main-button" :class="me?.ready ? 'btn-soft' : 'btn-primary'" :disabled="game.status !== 'connected' || me?.away" @tap="game.send({ type: 'ready', ready: !me?.ready })">
          <AppIcon v-if="me?.ready" name="check" :size="18" /><text>{{ me?.ready ? '已准备 · 取消' : '我准备好了' }}</text>
        </button>
      </view>
    </view>
    <view class="lobby-note"><AppIcon name="fingerprint" :size="16" /><text>谁会是这一局的卧底？</text></view>
  </view>
</template>

<style scoped>
.room-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 15px; padding: 16px 0 22px; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--line); }
.summary-separator { width: 1px; height: 12px; background: #dbe2dd; }
.section-title { margin: 28px 0 22px; }
.heading { font-size: 22px; }
.seats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.seat { position: relative; min-height: 183px; border: 1px solid var(--line); background: #fff; border-radius: 8px; display: flex; flex-direction: column; align-items: center; padding: 27px 12px 20px; }
.seat.yours { border-color: #9ec9b7; background: #fcfefd; }
.seat.empty { border-style: dashed; background: transparent; padding: 0; }
.seat-number { position: absolute; top: 12px; left: 14px; font-size: 10px; color: #a2aea6; }
.host-mark { position: absolute; top: 10px; right: 10px; display: flex; gap: 4px; align-items: center; font-size: 10px; color: #957923; }
.player-avatar { width: 60px; height: 60px; border-radius: 50%; margin: 5px 0 11px; }
.player-name { display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 14px; font-weight: 600; width: 100%; overflow-wrap: anywhere; text-align: center; }
.self-mark { font-size: 9px; color: var(--green); border: 1px solid #b2d1bf; padding: 0 3px; border-radius: 3px; flex-shrink: 0; }
.player-status { margin-top: 7px; font-size: 11px; color: #9ba59f; display: flex; align-items: center; gap: 4px; }
.player-status.ready { color: var(--green); }
.empty-seat-button { width: 100%; height: 100%; min-height: 181px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: #a8b1ab; font-size: 12px; }
.empty-avatar { display: flex; justify-content: center; align-items: center; width: 60px; height: 60px; border: 1px dashed #d4ddd7; border-radius: 50%; opacity: .65; }
.lobby-actions { margin-top: 32px; padding-top: 26px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 18px; }
.waiting { display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: 13px; }
.action-buttons { display: flex; gap: 12px; }
.main-button { min-width: 170px; }
.lobby-note { display: flex; justify-content: center; align-items: center; gap: 8px; font-size: 11px; color: #99a39c; margin: 32px 0; }
@media (max-width: 700px) { .seats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; } .lobby-actions { flex-direction: column; } .action-buttons { width: 100%; } .action-buttons .btn { flex: 1; } }
@media (max-width: 480px) {
  .room-summary { gap: 9px; font-size: 10px; }
  .room-summary .row { gap: 5px; }
  .section-title { margin: 23px 0 17px; }
  .heading { font-size: 20px; }
  .seats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .seat { min-height: 163px; padding-top: 25px; }
  .empty-seat-button { min-height: 161px; }
  .player-avatar { width: 52px; height: 52px; margin-bottom: 9px; }
  .main-button { min-width: 0; }
  .lobby-actions { margin-top: 23px; padding-top: 22px; }
  .btn { padding-left: 12px; padding-right: 12px; }
}
</style>
