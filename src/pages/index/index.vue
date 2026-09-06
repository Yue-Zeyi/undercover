<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { onHide, onLoad, onResize, onShareAppMessage, onShow } from '@dcloudio/uni-app';
import { useGameStore } from '../../stores/game';
import { DEFAULT_SYSTEM_CONFIG, type SystemConfig } from '../../../shared/protocol';
import { requestSystemConfig } from '../../services/connection';
import { isSoundEnabled, setSoundEnabled, playSound } from '../../services/sound';
import AppIcon from '../../components/AppIcon.vue';
import ModalShell from '../../components/ModalShell.vue';
// #ifdef H5
import InviteShare from '../../components/InviteShare.vue';
// #endif
import HomeView from '../../components/HomeView.vue';
import LobbyView from '../../components/LobbyView.vue';
import MatchView from '../../components/MatchView.vue';
import { createEntryUrl, createInviteUrl, roomInviteText } from '../../services/invite';
// #ifdef H5
import PlatformEntryPrompt from '../../components/PlatformEntryPrompt.vue';
// #endif

const game = useGameStore();
const inviteCode = ref('');
const showRules = ref(false);
const showInvite = ref(false);
const showEntryPrompt = ref(false);
const showLeave = ref(false);
const privacyEpoch = ref(0);
const pageInsets = ref<Record<string, string>>({});
const systemConfig = ref<SystemConfig>({ ...DEFAULT_SYSTEM_CONFIG });
const soundEnabled = ref(isSoundEnabled());
function getInviteLink(code: string): string {
  let link = roomInviteText(code);
  // #ifdef H5
  if (typeof window !== 'undefined') link = createInviteUrl(window.location.href, code);
  // #endif
  return link;
}
const inviteUrl = computed(() => game.room ? getInviteLink(game.room.code) : '');
const entryUrl = computed(() => {
  let link = '';
  // #ifdef H5
  if (typeof window !== 'undefined') link = createEntryUrl(window.location.href);
  // #endif
  return link;
});
// #ifdef H5
const ENTRY_PROMPT_KEY = 'wodi:platform-entry-prompt:v1';
function maybeShowEntryPrompt() {
  try {
    if (window.localStorage.getItem(ENTRY_PROMPT_KEY) !== '1') showEntryPrompt.value = true;
  } catch {
    showEntryPrompt.value = true;
  }
}
function dismissEntryPrompt() {
  showEntryPrompt.value = false;
  try { window.localStorage.setItem(ENTRY_PROMPT_KEY, '1'); } catch { /* Private mode may block storage. */ }
}
// #endif
// #ifdef MP-WEIXIN
function updatePageInsets() {
  const { screenHeight, safeArea } = uni.getWindowInfo();
  pageInsets.value = { '--safe-bottom': `${Math.max(0, screenHeight - (safeArea?.bottom ?? screenHeight))}px` };
}
onLoad(updatePageInsets);
onResize(updatePageInsets);
// #endif
const isConnected = computed(() => game.status === 'connected');
watch(() => game.room && !game.atHome ? `${game.room.code}:${game.room.phase}` : 'home', () => {
  nextTick(() => uni.pageScrollTo({ scrollTop: 0, duration: 0 }));
});
const roomActivity = computed(() => {
  if (game.busy) return '正在退出房间';
  if (!game.room) return '正在同步房间';
  const room = game.room;
  const self = room.players.find(player => player.id === room.selfId);
  if (room.phase === 'result') return '本局已结束';
  if (room.phase === 'lobby') return '等待开局';
  if (!self?.alive) return '本局观战中';
  if (room.phase === 'reveal') return '本局已发词';
  if (room.phase === 'voting') return self.hasVoted ? '等待投票结果' : '正在投票';
  return room.speakerId === room.selfId ? '轮到你发言' : `第 ${room.round} 轮发言`;
});

onLoad(query => {
  const value = query?.room;
  if (typeof value === 'string' && /^\d{6}$/.test(value)) inviteCode.value = value;
});
// #ifdef H5
function readInviteFromUrl() {
  const current = new URL(window.location.href);
  const route = new URL(current.hash.slice(1) || '/', current.origin);
  const code = route.searchParams.get('room') || current.searchParams.get('room');
  if (code && /^\d{6}$/.test(code)) inviteCode.value = code;
}
onMounted(() => { readInviteFromUrl(); maybeShowEntryPrompt(); window.addEventListener('hashchange', readInviteFromUrl); });
onUnmounted(() => { window.removeEventListener('hashchange', readInviteFromUrl); });
// #endif
async function loadSystemConfig() {
  try { systemConfig.value = await requestSystemConfig(); } catch { /* Keep the bundled defaults when the server is unavailable. */ }
}
function toggleSound() {
  soundEnabled.value = !soundEnabled.value;
  setSoundEnabled(soundEnabled.value);
  if (soundEnabled.value) playSound('notice');
}
onMounted(() => { void loadSystemConfig(); });
onShow(() => { game.restore(); if (!systemConfig.value.icp) void loadSystemConfig(); });
onHide(() => { privacyEpoch.value++; game.disconnectForBackground(); });
onShareAppMessage(() => ({ title: '谁是卧底？来我的好友房一起玩', path: `/pages/index/index?room=${game.room?.code || ''}` }));

function copyRoom() {
  if (!game.room) return;
  uni.setClipboardData({ data: game.room.code, success: () => uni.showToast({ title: '房间号已复制', icon: 'none' }) });
}
function leaveRoom() {
  showLeave.value = false;
  showInvite.value = false;
  inviteCode.value = '';
  game.leave();
}
function goHome() {
  showLeave.value = false;
  showInvite.value = false;
  inviteCode.value = '';
  privacyEpoch.value++;
  game.goHome();
}
</script>

<template>
  <view class="page-shell" :style="pageInsets">
    <view class="site-header">
      <!-- #ifndef MP-WEIXIN -->
      <view class="brand"><view class="brand-mark"><AppIcon name="fingerprint" :size="24" light /></view><text class="brand-name">{{ systemConfig.systemName }}<text class="brand-divider">/</text><text class="brand-edition">好友局</text></text></view>
      <!-- #endif -->
      <!-- #ifdef MP-WEIXIN -->
      <text class="mini-edition">好友局</text>
      <!-- #endif -->
      <view class="header-actions"><button class="sound-button" :aria-label="soundEnabled ? '关闭音效' : '开启音效'" :title="soundEnabled ? '关闭音效' : '开启音效'" @tap="toggleSound"><AppIcon :name="soundEnabled ? 'messages-square' : 'pause'" :size="16" /><text>{{ soundEnabled ? '音效开' : '音效关' }}</text></button><button class="rules-button" @tap="showRules = true"><AppIcon name="circle-help" :size="17" /><text>玩法规则</text></button></view>
    </view>

    <view v-if="game.error" class="error-banner" role="alert"><AppIcon name="circle-alert" :size="18" /><text>{{ game.error }}</text><button class="icon-button" aria-label="关闭提示" @tap="game.clearError()"><AppIcon name="x" :size="16" /></button></view>

    <view v-if="game.session && !isConnected" class="connection-banner"><view class="connection-spinner" /><text>{{ game.busy ? '正在恢复房间…' : '连接已断开，正在重连…' }}</text><button class="reconnect-button" @tap="game.reconnect()">重新连接</button></view>

    <view v-if="game.session && game.atHome" class="resume-band">
      <view class="resume-info"><view class="resume-title"><AppIcon name="pause" :size="16" /><text>挂机中 · <text class="mono">{{ game.session.roomCode }}</text></text></view><text class="resume-activity">{{ roomActivity }}</text></view>
      <button class="btn btn-primary resume-button" :disabled="game.busy" @tap="game.returnToRoom()"><text>返回房间</text><AppIcon name="arrow-right" :size="17" light /></button>
    </view>

    <view v-if="game.room && !game.atHome" class="room-page">
      <view class="room-header">
        <view><text class="room-label">{{ game.room.phase === 'lobby' ? '好友房' : game.room.phase === 'result' ? '本局结束' : '游戏进行中' }}</text><view class="row room-number"><text class="mono">{{ game.room.code }}</text><button class="icon-button" aria-label="复制房间号" title="复制房间号" @tap="copyRoom"><AppIcon name="copy" :size="18" /></button></view></view>
        <view class="room-tools"><view v-if="isConnected" class="live-status"><view class="dot" /><text>已连接</text></view><button v-if="game.room.phase === 'lobby'" class="icon-button room-share-button" aria-label="邀请好友" title="生成二维码邀请好友" @tap="showInvite = true"><AppIcon name="qr-code" :size="19" /></button><button class="icon-button home-button" aria-label="返回首页" title="返回首页，保留座位" :disabled="game.busy" @tap="goHome"><AppIcon name="house" :size="20" /></button><button class="btn leave-button" aria-label="退出房间" title="退出房间" :disabled="game.busy" @tap="showLeave = true"><AppIcon name="log-out" :size="17" /><text class="leave-label">退出房间</text></button></view>
      </view>
      <LobbyView v-if="game.room.phase === 'lobby'" :room="game.room" @invite="showInvite = true" />
      <MatchView v-else :room="game.room" :privacy-epoch="privacyEpoch" />
    </view>
    <view v-else-if="game.session && !game.atHome" class="restoring"><AppIcon name="refresh-cw" :size="35" /><text>正在回到你的座位</text><button class="btn" :disabled="game.busy" @tap="goHome"><AppIcon name="house" :size="18" /><text>返回首页</text></button></view>
    <HomeView v-else :invite-code="inviteCode" :system-name="systemConfig.systemName" @leave="showLeave = true" />

    <view v-if="systemConfig.icp" class="site-footer">
      <text>{{ systemConfig.systemName }} · </text>
      <!-- #ifndef MP-WEIXIN -->
      <a class="icp-link" href="https://beian.miit.gov.cn/" target="_blank">{{ systemConfig.icp }}</a>
      <!-- #endif -->
      <!-- #ifdef MP-WEIXIN -->
      <text>{{ systemConfig.icp }}</text>
      <!-- #endif -->
    </view>

    <ModalShell v-if="showRules" title="玩法规则" @close="showRules = false">
      <view class="rules-list">
        <view class="rule"><text class="rule-number mono">01</text><view><text class="rule-title">同中有异</text><text class="rule-copy">平民拿到同一个词，卧底拿到另一个相近的词。开局时只知道自己的词语，不知道身份。</text></view></view>
        <view class="rule"><text class="rule-number mono">02</text><view><text class="rule-title">描述，但别说破</text><text class="rule-copy">按顺序用一句话描述自己的词语，不能直接说出原词。发言超时将跳过。</text></view></view>
        <view class="rule"><text class="rule-number mono">03</text><view><text class="rule-title">找出不一样的人</text><text class="rule-copy">每轮投票淘汰一人，不能投自己。最高票平票时，平票玩家再描述一轮后重新投票。</text></view></view>
        <view class="rule"><text class="rule-number mono">04</text><view><text class="rule-title">谁笑到最后</text><text class="rule-copy">卧底全部出局，平民获胜。存活卧底人数不少于平民，卧底获胜。</text></view></view>
      </view>
      <button class="btn btn-primary btn-wide" @tap="showRules = false">明白了</button>
    </ModalShell>

    <!-- #ifdef H5 -->
    <ModalShell v-if="showEntryPrompt" title="先保存平台入口" @close="dismissEntryPrompt">
      <PlatformEntryPrompt :entry-url="entryUrl" :system-name="systemConfig.systemName" @done="dismissEntryPrompt" />
    </ModalShell>
    <!-- #endif -->

    <ModalShell v-if="showInvite && game.room" title="留个座，等你来" @close="showInvite = false">
      <!-- #ifndef MP-WEIXIN -->
      <InviteShare :room-code="game.room.code" :invite-url="inviteUrl" :system-name="systemConfig.systemName" />
      <!-- #endif -->
      <!-- #ifdef MP-WEIXIN -->
      <view class="invite-code"><text class="small muted">房间号</text><text class="mono">{{ game.room.code }}</text></view>
      <button class="btn btn-primary btn-wide" open-type="share"><AppIcon name="send" light :size="18" /><text>邀请微信好友</text></button>
      <button class="text-button copy-code-button" @tap="copyRoom"><AppIcon name="copy" :size="15" /><text>复制房间号</text></button>
      <!-- #endif -->
    </ModalShell>

    <ModalShell v-if="showLeave" title="退出这个房间？" @close="showLeave = false">
      <text class="leave-copy">{{ game.room && ['reveal', 'speaking', 'voting'].includes(game.room.phase) ? '本局还在进行，退出后你将出局。' : '退出后可以重新加入好友房。' }}</text>
      <button v-if="!game.atHome" class="btn btn-primary btn-wide park-button" :disabled="game.busy" @tap="goHome"><AppIcon name="pause" :size="18" light /><text>挂机回首页</text></button>
      <text v-if="!game.atHome" class="park-copy">挂机保留座位，对局倒计时继续。</text>
      <view class="leave-actions"><button class="btn" @tap="showLeave = false">继续留在房间</button><button class="btn btn-danger" @tap="leaveRoom">确认退出</button></view>
    </ModalShell>
  </view>
</template>

<style scoped lang="scss">
.page-shell { --safe-bottom: env(safe-area-inset-bottom, 0px); max-width: 1160px; padding: 0 42px 20px; margin: 0 auto; min-height: 100vh; padding-top: env(safe-area-inset-top); padding-bottom: calc(20px + var(--safe-bottom)); }
.site-header { display: flex; align-items: center; justify-content: space-between; height: 92px; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 11px; }
.brand-mark { width: 37px; height: 37px; display: flex; align-items: center; justify-content: center; background: var(--green); border-radius: 8px; }
.brand-name { font-size: 16px; font-weight: 700; }
.brand-divider { font-weight: 400; color: #bbc5bf; margin: 0 11px; }
.brand-edition { font-size: 12px; color: #839087; font-weight: 400; }
.header-actions { display: flex; align-items: center; gap: 17px; }
.sound-button { display: flex; align-items: center; gap: 5px; color: #748078; font-size: 11px; padding: 8px 0; }
.rules-button { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #748078; padding: 10px 0 10px 10px; }
.room-page { max-width: 960px; margin: 0 auto; }
.room-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 30px; }
.room-label { font-size: 12px; color: var(--muted); }
.room-number { margin-top: 4px; gap: 12px; }
.room-number > .mono { font-size: 32px; font-weight: 650; line-height: 1.3; }
.room-tools { display: flex; align-items: center; gap: 12px; }
.live-status { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--muted); }
.leave-button { font-size: 12px; min-height: 37px; padding: 9px 12px; background: transparent; }
.error-banner { display: flex; align-items: center; gap: 10px; color: #b84f42; background: #fff0eb; border: 1px solid #f0cfc3; padding: 8px 12px; margin: 17px auto 0; border-radius: 6px; max-width: 960px; font-size: 13px; }
.error-banner > text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.connection-banner { display: flex; align-items: center; gap: 10px; padding: 14px; background: #f8f0d9; color: #947529; margin: 17px auto 0; border-radius: 6px; max-width: 960px; font-size: 12px; }
.connection-spinner { width: 13px; height: 13px; border: 2px solid #d7c79a; border-top-color: #947529; border-radius: 50%; animation: spin 1s linear infinite; }
.reconnect-button { margin-left: auto; font-size: 12px; color: #7b611e; padding: 4px; }
.restoring { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; min-height: 420px; color: var(--muted); }
.rules-list { padding: 4px 0 9px; }
.rule { display: flex; gap: 16px; margin-bottom: 23px; }
.rule-number { color: #93b6a3; font-size: 12px; padding-top: 2px; }
.rule-title { font-size: 14px; font-weight: 700; display: block; margin-bottom: 5px; }
.rule-copy { font-size: 12px; color: #7b877f; line-height: 1.9; display: block; }
.invite-code { display: flex; flex-direction: column; align-items: center; padding: 13px 0 30px; }
.invite-code > .mono { font-size: 43px; font-weight: 650; margin-top: 9px; }
.copy-code-button { margin: 14px auto 0; }
.leave-copy { display: block; font-size: 13px; color: var(--muted); margin: 7px 0 25px; }
.leave-actions { display: flex; gap: 12px; }
.leave-actions .btn { flex: 1; padding: 12px 7px; font-size: 12px; }
.park-copy { display: block; font-size: 12px; color: var(--muted); margin: 10px 0 22px; text-align: center; }
.resume-band { max-width: 850px; margin: 0 auto; padding: 20px 0; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.resume-info { min-width: 0; }
.resume-title { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; }
.resume-activity { display: block; color: var(--muted); font-size: 12px; margin-top: 5px; }
.resume-button { flex-shrink: 0; padding: 10px 14px; }
.site-footer { display: flex; justify-content: center; align-items: center; gap: 0; color: #929d95; font-size: 11px; padding: 22px 0 4px; text-align: center; }
.icp-link { color: #7f9186; text-decoration: none; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 740px) { .page-shell { padding-left: 26px; padding-right: 26px; } }
@media (max-width: 480px) {
  .page-shell { padding-left: 18px; padding-right: 18px; }
  .site-header { height: 74px; }
  .brand { gap: 9px; }
  .brand-mark { width: 31px; height: 31px; border-radius: 7px; }
  .brand-name { font-size: 14px; }
  .brand-divider { margin: 0 7px; }
  .brand-edition { font-size: 10px; }
  .rules-button { font-size: 11px; gap: 5px; }
  .header-actions { gap: 10px; }
  .sound-button { font-size: 10px; }
  .room-header { padding-top: 23px; }
  .room-number > .mono { font-size: 28px; }
  .room-tools { gap: 8px; }
  .room-tools .leave-button { width: 40px; height: 40px; padding: 0; }
  .leave-label { display: none; }
  .resume-band { gap: 10px; }
  .resume-title { font-size: 12px; }
  .resume-activity { font-size: 11px; }
  .resume-button { font-size: 12px; padding: 10px; }
  .live-status { display: none; }
  .room-number { gap: 6px; }
  .connection-banner { font-size: 11px; gap: 7px; padding: 10px; }
  .reconnect-button { font-size: 10px; flex-shrink: 0; }
}
/* #ifdef MP-WEIXIN */
.page-shell { padding-top: 0; }
.site-header { height: 44px; }
.mini-edition { color: var(--muted); font-size: 12px; }
.rules-button { min-height: 44px; }
/* #endif */
</style>
