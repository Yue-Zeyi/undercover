<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { RoomView } from '../../shared/protocol';
import { DIFFICULTIES, WORD_CATEGORIES } from '../../shared/word-catalog';
import { useGameStore } from '../stores/game';
import AppIcon from './AppIcon.vue';
import { playSound } from '../services/sound';

const props = defineProps<{ room: RoomView; privacyEpoch: number }>();
const game = useGameStore();
const visibleWord = ref(false);
const hasSeenWord = ref(false);
const draft = ref('');
const voteTarget = ref('');
const showHistory = ref(false);
const kickTarget = ref('');
const now = ref(Date.now());
const clock = setInterval(() => { now.value = Date.now(); }, 500);
onUnmounted(() => clearInterval(clock));
const me = computed(() => props.room.players.find(p => p.id === props.room.selfId));
const speaker = computed(() => props.room.players.find(p => p.id === props.room.speakerId));
const isMyTurn = computed(() => props.room.phase === 'speaking' && props.room.speakerId === props.room.selfId);
const secondsLeft = computed(() => Math.max(0, Math.ceil(((props.room.deadline || now.value) - now.value) / 1000)));
const alivePlayers = computed(() => props.room.players.filter(p => p.alive));
const votedCount = computed(() => alivePlayers.value.filter(p => p.hasVoted).length);
const canVote = computed(() => props.room.phase === 'voting' && me.value?.alive && !me.value.hasVoted && game.status === 'connected');
const candidatePlayers = computed(() => props.room.players.filter(p => p.alive && props.room.voteCandidates.includes(p.id)));
const lastMessageId = computed(() => `message-${props.room.messages[props.room.messages.length - 1]?.id || 'empty'}`);
const phaseTitle = computed(() => props.room.phase === 'reveal' ? '你的秘密，已就位' : props.room.phase === 'voting' ? '这一票，投给谁？' : isMyTurn.value ? '轮到你发言了' : `等待 ${speaker.value?.nickname || '玩家'} 发言`);
const canModerate = computed(() => !!me.value?.alive && !!me.value?.connected && !me.value.away && props.room.phase !== 'result' && props.room.phase !== 'lobby');
const kickCandidates = computed(() => props.room.players.filter(player => player.alive && player.id !== props.room.selfId));
const endRequestVoted = computed(() => !!props.room.earlyEndRequest?.votedIds.includes(props.room.selfId));
const kickRequestTarget = computed(() => props.room.players.find(player => player.id === props.room.kickRequest?.targetId));
const kickRequestVoted = computed(() => !!props.room.kickRequest?.votedIds.includes(props.room.selfId));
watch(() => props.privacyEpoch, () => { visibleWord.value = false; });
watch(() => props.room.phase, () => { voteTarget.value = ''; visibleWord.value = false; draft.value = ''; });
watch(() => props.room.speakerId, () => { draft.value = ''; });
// #ifdef MP-WEIXIN
watch(isMyTurn, value => { if (!value) uni.hideKeyboard(); });
// #endif
watch(() => props.room.deadline, () => { now.value = Date.now(); });
watch(candidatePlayers, candidates => {
  if (!candidates.some(player => player.id === voteTarget.value)) voteTarget.value = '';
});
watch(() => props.room.phase, (phase, previous) => {
  if (phase === previous) return;
  if (phase === 'reveal') playSound('reveal');
  else if (phase === 'speaking') playSound('turn');
  else if (phase === 'voting') playSound('vote');
  else if (phase === 'result') playSound('result');
});
watch(() => props.room.messages.at(-1)?.id, (id, previous) => {
  if (!id || id === previous) return;
  const latest = props.room.messages.at(-1);
  if (latest?.kind === 'system' && latest.text.includes('出局')) playSound('eliminate');
  else if (latest?.kind === 'system') playSound('notice');
});

function toggleWord() { visibleWord.value = !visibleWord.value; if (visibleWord.value) hasSeenWord.value = true; }
function speak() {
  if (!draft.value.trim() || !isMyTurn.value) return;
  game.send({ type: 'speak', text: draft.value.trim() });
}
function vote() { if (canVote.value && voteTarget.value) game.send({ type: 'vote', targetId: voteTarget.value }); }
function requestEnd() { if (canModerate.value) game.send({ type: 'request-end' }); }
function voteEnd(approve: boolean) { if (canModerate.value && !endRequestVoted.value) game.send({ type: 'vote-end', approve }); }
function selectKickTarget(event: { detail: { value: string | number } }) { kickTarget.value = kickCandidates.value[Number(event.detail.value)]?.id || ''; }
function requestKick() { if (canModerate.value && kickTarget.value) game.send({ type: 'request-kick', targetId: kickTarget.value }); }
function voteKick(agree: boolean) { if (canModerate.value && !kickRequestVoted.value && kickRequestTarget.value?.id !== props.room.selfId) game.send({ type: 'vote-kick', agree }); }
function roleName(role: string) { return role === 'undercover' ? '卧底' : '平民'; }
</script>

<template>
  <view v-if="room.phase === 'result'" class="result-view">
    <view class="result-top">
      <view class="trophy"><AppIcon name="trophy" :size="37" /></view>
      <text class="result-title">{{ room.endedEarly ? '游戏提前结束' : room.winner === 'civilian' ? '平民获胜' : '卧底获胜' }}</text>
      <text class="result-subtitle">{{ room.endedEarly ? '本局已提前收场，下面公开本局词语和身份。' : room.winner === 'civilian' ? '真相大白，伪装到此为止。' : '漂亮的伪装，藏到了最后。' }}</text>
    </view>
    <view class="result-words">
      <view class="result-word"><text class="word-label">平民词语</text><text class="word-value">{{ room.words?.civilian }}</text></view>
      <view class="result-word undercover-word"><text class="word-label">卧底词语</text><text class="word-value">{{ room.words?.undercover }}</text></view>
    </view>
    <view v-if="room.wordInfo" class="word-review">
      <view class="word-review-heading"><AppIcon name="layers" :size="16" /><text>词语复盘</text><text class="word-review-meta">{{ WORD_CATEGORIES.find(item => item.value === room.wordInfo?.category)?.label }} · {{ DIFFICULTIES.find(item => item.value === room.wordInfo?.difficulty)?.label }}</text></view>
      <view class="word-review-row"><text class="review-label">共同点</text><text>{{ room.wordInfo.sharedTrait }}</text></view>
      <view class="word-review-row"><text class="review-label">区别</text><text>{{ room.wordInfo.distinction }}</text></view>
    </view>
    <view class="result-players">
      <view v-for="player in room.players" :key="player.id" class="result-player">
        <image class="small-avatar" :src="`/static/avatars/${player.avatar}.svg`" mode="aspectFit" />
        <text class="result-name">{{ player.nickname }}{{ player.id === room.selfId ? '（我）' : '' }}</text>
        <text class="survival">{{ player.alive ? '存活' : '出局' }}</text>
        <text class="role-label" :class="{ undercover: room.reveal?.find(p => p.playerId === player.id)?.role === 'undercover' }">{{ roleName(room.reveal?.find(p => p.playerId === player.id)?.role || '') }}</text>
      </view>
    </view>
    <button v-if="room.hostId === room.selfId" class="btn btn-primary btn-wide" :disabled="game.status !== 'connected'" @tap="game.send({ type: 'restart' })"><AppIcon name="refresh-cw" light :size="18" /><text>再来一局</text></button>
    <view v-else class="result-wait muted">等待房主开启下一局</view>
    <button class="text-button history-toggle" @tap="showHistory = !showHistory"><AppIcon name="messages-square" :size="16" /><text>{{ showHistory ? '收起发言记录' : '本局发言记录' }}</text></button>
    <view v-if="showHistory" class="result-history"><view v-for="message in room.messages" :key="message.id" class="history-row"><text class="small muted">第 {{ message.round }} 轮 · {{ message.nickname }}</text><text>{{ message.text }}</text></view></view>
  </view>

  <view v-else class="match-view">
    <view class="phase-strip">
      <view class="phase-step" :class="{ active: room.phase === 'reveal' }"><AppIcon name="eye" :size="15" /><text>查看词语</text></view>
      <AppIcon name="chevron-right" :size="13" />
      <view class="phase-step" :class="{ active: room.phase === 'speaking' }"><AppIcon name="messages-square" :size="15" /><text>轮流描述</text></view>
      <AppIcon name="chevron-right" :size="13" />
      <view class="phase-step" :class="{ active: room.phase === 'voting' }"><AppIcon name="vote" :size="15" /><text>投票淘汰</text></view>
    </view>

    <view v-if="room.phase === 'reveal'" class="reveal-view">
      <text class="heading">{{ phaseTitle }}</text>
      <text class="reveal-progress muted">{{ room.players.filter(p => p.hasRevealed).length }} / {{ room.players.length }} 人已看词 · {{ secondsLeft }} 秒</text>
      <button class="secret-card" :class="{ revealed: visibleWord }" :aria-label="visibleWord ? '隐藏词语' : '查看我的词语'" @tap="toggleWord">
        <view class="secret-card-top"><AppIcon name="fingerprint" :size="24" :light="!visibleWord" /><text>仅你可见</text></view>
        <template v-if="visibleWord"><text class="secret-word">{{ room.word }}</text><view class="row secret-card-bottom"><AppIcon name="eye-off" :size="15" /><text>隐藏词语</text></view></template>
        <template v-else><image class="secret-illustration" src="/static/mission-art.svg" mode="aspectFit" /><view class="row secret-card-bottom"><AppIcon name="eye" :size="16" light /><text>查看我的词语</text></view></template>
      </button>
      <button class="btn btn-primary confirm-word" :disabled="!hasSeenWord || me?.hasRevealed || game.status !== 'connected'" @tap="game.send({ type: 'reveal-ready' }); visibleWord = false"><AppIcon v-if="me?.hasRevealed" name="check" light :size="18" /><text>{{ me?.hasRevealed ? '已记住，等待其他玩家' : '记住了，开始吧' }}</text></button>
    </view>

    <template v-else>
      <view class="match-heading">
        <view><view class="round-label">第 {{ room.round }} 轮 <text v-if="room.lastVote?.tiedIds.length" class="tie-label">· 平票加赛</text></view><text class="heading">{{ phaseTitle }}</text></view>
        <view class="timer" :class="{ urgent: secondsLeft <= 10 }"><AppIcon name="clock" :size="18" /><text class="mono">{{ String(secondsLeft).padStart(2, '0') }}</text><text class="small">秒</text></view>
      </view>
      <view v-if="canModerate" class="match-actions">
        <button class="text-button moderation-button" :disabled="!!room.earlyEndRequest" @tap="requestEnd"><AppIcon name="pause" :size="16" /><text>{{ room.earlyEndRequest ? '提前结束申请进行中' : '申请提前结束' }}</text></button>
        <view class="kick-action">
          <picker :range="kickCandidates" range-key="nickname" @change="selectKickTarget">
            <view class="text-button moderation-button"><AppIcon name="users" :size="16" /><text>{{ kickTarget ? kickCandidates.find(player => player.id === kickTarget)?.nickname : '选择玩家' }}</text><AppIcon name="chevron-down" :size="14" /></view>
          </picker>
          <button class="text-button moderation-button" :disabled="!kickTarget || !!room.kickRequest" @tap="requestKick"><AppIcon name="circle-alert" :size="16" /><text>申请踢出</text></button>
        </view>
      </view>
      <view v-if="room.earlyEndRequest" class="request-card">
        <view class="request-copy"><text class="request-title">提前结束申请</text><text class="small muted">{{ room.earlyEndRequest.approvedIds.length }} / {{ room.earlyEndRequest.required }} 人同意</text></view>
        <view v-if="!endRequestVoted && canModerate" class="request-buttons"><button class="btn btn-primary request-button" @tap="voteEnd(true)">同意</button><button class="btn request-button" @tap="voteEnd(false)">不同意</button></view>
        <text v-else class="small muted">{{ endRequestVoted ? '已完成投票，等待其他玩家' : '当前不可参与投票' }}</text>
      </view>
      <view v-if="room.kickRequest" class="request-card kick-request-card">
        <view class="request-copy"><text class="request-title">申请请出 {{ kickRequestTarget?.nickname || '玩家' }}</text><text class="small muted">{{ room.kickRequest.approvedIds.length }} / {{ room.kickRequest.required }} 人同意</text></view>
        <view v-if="!kickRequestVoted && canModerate && kickRequestTarget?.id !== room.selfId" class="request-buttons"><button class="btn btn-primary request-button" @tap="voteKick(true)">同意</button><button class="btn request-button" @tap="voteKick(false)">不同意</button></view>
        <text v-else class="small muted">{{ kickRequestTarget?.id === room.selfId ? '你是本次申请对象' : kickRequestVoted ? '已完成投票，等待其他玩家' : '当前不可参与投票' }}</text>
      </view>
      <view v-if="!me?.alive" class="spectator-note"><AppIcon name="eye" :size="16" /><text>你已出局，正在观战</text></view>
      <view class="play-layout">
        <view class="play-main">
          <template v-if="room.phase === 'voting'">
            <view class="vote-heading"><text>{{ me?.hasVoted ? '已投票，等待大家的选择' : '选出你怀疑的卧底' }}</text><text class="small muted">{{ votedCount }} / {{ alivePlayers.length }} 已投票</text></view>
            <view class="vote-grid">
              <button v-for="player in candidatePlayers" :key="player.id" class="vote-option" :class="{ selected: voteTarget === player.id }" :disabled="!canVote || player.id === room.selfId" :aria-label="`投票给${player.nickname}`" :aria-pressed="voteTarget === player.id" @tap="voteTarget = player.id">
                <image class="vote-avatar" :src="`/static/avatars/${player.avatar}.svg`" mode="aspectFit" />
                <text class="vote-name">{{ player.nickname }}{{ player.id === room.selfId ? '（我）' : '' }}</text>
                <view class="vote-circle"><AppIcon v-if="voteTarget === player.id" name="check" :size="13" light /></view>
              </button>
            </view>
            <button class="btn btn-ink btn-wide vote-submit" :disabled="!canVote || !voteTarget" @tap="vote"><AppIcon name="vote" light :size="18" /><text>{{ me?.hasVoted ? '投票已提交' : '确认投票' }}</text></button>
          </template>
          <view class="conversation-heading"><AppIcon name="messages-square" :size="16" /><text>本局发言</text><text class="message-count mono">{{ room.messages.filter(m => m.kind === 'speech').length }}</text></view>
          <scroll-view scroll-y class="conversation" :class="{ compact: room.phase === 'voting' }" :scroll-into-view="lastMessageId" scroll-with-animation>
            <view v-if="!room.messages.length" class="conversation-empty"><AppIcon name="messages-square" :size="30" /><text>第一句描述，会是什么？</text></view>
            <view v-for="message in room.messages" :id="`message-${message.id}`" :key="message.id" class="message" :class="{ system: message.kind === 'system', own: message.playerId === room.selfId }">
              <template v-if="message.kind === 'system'"><text>{{ message.text }}</text></template>
              <template v-else>
                <image class="message-avatar" :src="`/static/avatars/${room.players.find(p => p.id === message.playerId)?.avatar || 0}.svg`" mode="aspectFit" />
                <view class="message-body"><view class="message-meta"><text>{{ message.nickname }}</text><text>第 {{ message.round }} 轮</text></view><view class="message-bubble">{{ message.text }}</view></view>
              </template>
            </view>
          </scroll-view>
          <view v-if="room.phase === 'speaking'" class="composer" :class="{ 'my-turn': isMyTurn }">
            <textarea v-model="draft" class="speech-input" :disabled="!isMyTurn || game.status !== 'connected'" :maxlength="120" :placeholder="isMyTurn ? '描述你的词语…' : !me?.alive ? '你正在观战' : `等待 ${speaker?.nickname || '玩家'} 的描述…`" aria-label="我的描述" :show-confirm-bar="false" :cursor-spacing="96" :adjust-position="true" />
            <view class="row between composer-footer"><text class="small muted">{{ draft.length }} / 120</text><button class="btn btn-primary speak-button" :disabled="!isMyTurn || !draft.trim() || game.status !== 'connected'" @tap="speak"><text>结束发言</text><AppIcon name="send" light :size="16" /></button></view>
          </view>
        </view>

        <view class="play-aside">
          <view class="word-peek"><view><text class="small muted">我的词语</text><text class="peek-word">{{ visibleWord ? room.word : '••••' }}</text></view><button class="icon-button" :aria-label="visibleWord ? '隐藏词语' : '查看词语'" :title="visibleWord ? '隐藏词语' : '查看词语'" @tap="toggleWord"><AppIcon :name="visibleWord ? 'eye-off' : 'eye'" :size="19" /></button></view>
          <view class="row between roster-heading"><text>在场玩家</text><text class="small muted">{{ alivePlayers.length }} 人存活</text></view>
          <view class="roster">
            <view v-for="(player, index) in room.players" :key="player.id" class="roster-player" :class="{ eliminated: !player.alive, current: player.id === room.speakerId }">
              <text class="seat-index mono">{{ String(index + 1).padStart(2, '0') }}</text>
              <image class="small-avatar" :src="`/static/avatars/${player.avatar}.svg`" mode="aspectFit" />
              <view class="roster-name"><text>{{ player.nickname }}</text><text v-if="player.id === room.selfId" class="small muted">（我）</text></view>
              <text class="roster-status">{{ !player.alive ? '出局' : !player.connected ? '离线' : player.away ? '挂机中' : player.id === room.speakerId ? '发言中' : room.phase === 'voting' && player.hasVoted ? '已投票' : '' }}</text>
            </view>
          </view>
          <view v-if="room.lastVote?.eliminatedId" class="last-vote"><AppIcon name="vote" :size="16" /><text>上轮出局：{{ room.players.find(p => p.id === room.lastVote?.eliminatedId)?.nickname }}</text></view>
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.phase-strip { display: flex; align-items: center; justify-content: center; gap: 27px; padding: 21px 0; border-bottom: 1px solid var(--line); color: #a3aea7; }
.phase-step { display: flex; align-items: center; gap: 7px; font-size: 12px; }
.phase-step.active { color: var(--green); font-weight: 700; }
.reveal-view { display: flex; flex-direction: column; align-items: center; padding: 36px 0 48px; }
.reveal-progress { margin-top: 9px; font-size: 12px; }
.secret-card { display: flex; flex-direction: column; align-items: center; justify-content: space-between; background: var(--ink); color: white; border-radius: 8px; border: 1px solid var(--ink); width: 272px; height: 315px; padding: 24px; margin: 28px 0 24px; box-shadow: 7px 7px 0 #dfe8e0; }
.secret-card.revealed { background: #eff7f2; border-color: #a7cbbc; color: var(--ink); }
.secret-card-top { width: 100%; display: flex; align-items: center; justify-content: space-between; font-size: 11px; opacity: .7; }
.secret-illustration { width: 223px; height: 176px; }
.secret-word { font-size: 32px; font-weight: 750; text-align: center; overflow-wrap: anywhere; }
.secret-card-bottom { justify-content: center; font-size: 12px; }
.confirm-word { width: 290px; max-width: 100%; }
.match-heading { display: flex; align-items: center; justify-content: space-between; padding: 25px 0 24px; gap: 15px; }
.match-heading > view:first-child { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.round-label { color: var(--muted); font-size: 12px; margin-bottom: 5px; }
.tie-label { color: #b47833; }
.timer { display: flex; align-items: center; gap: 9px; flex-shrink: 0; color: var(--green); }
.timer .mono { font-size: 28px; font-weight: 650; }
.timer.urgent { color: #c65846; }
.play-layout { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 30px; align-items: start; }
.play-main { border: 1px solid var(--line); border-radius: 8px; background: #fff; overflow: hidden; }
.conversation-heading { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #edf0ee; padding: 16px 20px; font-size: 12px; color: #748078; }
.message-count { margin-left: auto; }
.conversation { height: 340px; }
.conversation.compact { height: 190px; }
.conversation-empty { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 250px; gap: 14px; color: #a7b2aa; font-size: 12px; }
.message { display: flex; gap: 10px; padding: 12px 20px; align-items: flex-start; }
.message-avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.message-body { min-width: 0; max-width: calc(100% - 45px); }
.message-meta { display: flex; align-items: center; gap: 12px; font-size: 10px; color: #92a096; margin-bottom: 5px; }
.message-bubble { background: #f2f5f3; padding: 10px 13px; border-radius: 0 6px 6px; font-size: 14px; overflow-wrap: anywhere; white-space: pre-wrap; }
.message.own .message-bubble { background: #eaf4ed; }
.message.system { display: block; text-align: center; font-size: 11px; color: #8c9990; padding: 9px 20px; }
.composer { border-top: 1px solid var(--line); padding: 16px 20px; background: #fafcfb; }
.composer.my-turn { background: #fff; }
.speech-input { width: 100%; height: 61px; font-size: 16px; line-height: 1.6; }
.composer-footer { margin-top: 4px; }
.speak-button { min-height: 37px; padding: 9px 13px; font-size: 12px; }
.match-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin: -8px 0 14px; }
.kick-action { display: flex; align-items: center; gap: 7px; }
.moderation-button { padding: 6px 0; font-size: 11px; color: #77877d; }
.request-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 15px; margin: 0 0 14px; border: 1px solid #d8e6dc; border-radius: 7px; background: #f7fbf8; }
.kick-request-card { border-color: #eadfd0; background: #fffaf3; }
.request-copy { display: flex; align-items: center; gap: 10px; min-width: 0; }
.request-title { font-size: 12px; font-weight: 700; }
.request-buttons { display: flex; gap: 7px; flex-shrink: 0; }
.request-button { min-height: 32px; padding: 6px 11px; font-size: 11px; }
.word-peek { display: flex; justify-content: space-between; align-items: center; padding: 0 0 18px; border-bottom: 1px solid var(--line); }
.peek-word { display: block; font-size: 22px; font-weight: 700; margin-top: 4px; overflow-wrap: anywhere; }
.roster-heading { font-size: 13px; padding: 22px 0 12px; }
.roster-player { display: flex; align-items: center; gap: 9px; min-height: 59px; border-bottom: 1px solid #e7ece8; }
.seat-index { font-size: 10px; color: #a0aca3; }
.small-avatar { width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%; }
.roster-name { font-size: 12px; min-width: 0; flex: 1; overflow-wrap: anywhere; }
.roster-status { font-size: 10px; color: #97a299; flex-shrink: 0; }
.current .roster-status { color: var(--green); }
.eliminated { opacity: .5; }
.last-vote { display: flex; gap: 8px; margin-top: 20px; color: #8c7b6e; font-size: 11px; }
.spectator-note { display: flex; align-items: center; gap: 8px; padding: 12px 0; color: #997349; font-size: 12px; }
.vote-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; font-weight: 600; padding: 20px 20px 15px; }
.vote-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 0 20px; }
.vote-option { padding: 14px 8px; border: 1px solid var(--line); border-radius: 6px; display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; }
.vote-option.selected { border-color: var(--green); background: #eef7f1; }
.vote-avatar { width: 43px; height: 43px; border-radius: 50%; }
.vote-name { font-size: 12px; overflow-wrap: anywhere; width: 100%; }
.vote-circle { width: 17px; height: 17px; border: 1px solid #d4ded7; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.selected .vote-circle { background: var(--green); border-color: var(--green); }
.vote-submit { margin: 17px 20px 20px; width: calc(100% - 40px); }
.result-view { max-width: 590px; margin: auto; padding: 32px 0; }
.result-top { display: flex; align-items: center; flex-direction: column; }
.trophy { display: flex; align-items: center; justify-content: center; width: 76px; height: 76px; border-radius: 50%; background: #f7e6aa; margin: 10px 0 18px; }
.result-title { font-size: 32px; font-weight: 800; }
.result-subtitle { color: var(--muted); font-size: 12px; margin-top: 7px; }
.result-words { display: grid; grid-template-columns: 1fr 1fr; margin-top: 30px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.result-word { padding: 24px 10px; text-align: center; background: #e9f3ed; }
.undercover-word { background: #faece7; }
.word-label { display: block; font-size: 11px; color: #698375; margin-bottom: 7px; }
.undercover-word .word-label { color: #ac7867; }
.word-value { font-size: 25px; font-weight: 750; overflow-wrap: anywhere; }
.word-review { padding: 20px 0; border-bottom: 1px solid var(--line); }
.word-review-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; font-size: 13px; font-weight: 600; margin-bottom: 13px; }
.word-review-meta { margin-left: auto; color: var(--muted); font-size: 11px; font-weight: 400; }
.word-review-row { display: flex; align-items: baseline; gap: 14px; font-size: 12px; line-height: 1.8; margin-top: 7px; overflow-wrap: anywhere; }
.review-label { flex-shrink: 0; width: 36px; color: var(--muted); }
.result-players { margin: 20px 0 28px; }
.result-player { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.result-name { flex: 1; font-size: 13px; overflow-wrap: anywhere; }
.survival { color: var(--muted); font-size: 11px; flex-shrink: 0; }
.role-label { color: var(--green); font-weight: 600; font-size: 12px; padding-left: 17px; }
.role-label.undercover { color: #cc6c54; }
.result-wait { text-align: center; padding: 12px; font-size: 13px; }
.history-toggle { margin: 18px auto 0; }
.history-row { display: flex; flex-direction: column; font-size: 13px; padding: 12px 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
@media (max-width: 740px) { .play-layout { grid-template-columns: minmax(0, 1fr) 225px; gap: 18px; } .roster-player { gap: 7px; } }
@media (max-width: 600px) {
  .phase-strip { gap: 13px; padding: 19px 0; }
  .phase-step { gap: 5px; font-size: 11px; }
  .match-heading { padding: 21px 0; }
  .heading { font-size: 21px; }
  .play-layout { display: flex; flex-direction: column; gap: 22px; }
  .play-main, .play-aside { width: 100%; }
  .conversation { height: 300px; }
  .roster { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
  .roster-player { flex-wrap: wrap; gap: 5px; padding: 9px 0; }
  .roster-name { font-size: 11px; }
  .roster-status { font-size: 9px; }
  .small-avatar { width: 30px; height: 30px; }
  .word-peek { padding: 0 0 15px; }
  .word-peek > view { display: flex; align-items: center; gap: 18px; }
  .peek-word { margin: 0; font-size: 19px; }
  .play-aside { padding-bottom: 28px; }
  .vote-grid { padding: 0 15px; gap: 8px; }
  .vote-heading { padding: 18px 15px 15px; font-size: 12px; }
  .vote-option { padding: 12px 7px; }
  .vote-name { font-size: 11px; }
  .message { padding-left: 15px; padding-right: 15px; }
  .reveal-view { padding-top: 29px; }
  .result-view { padding-top: 20px; }
  .match-actions { align-items: stretch; justify-content: flex-start; flex-wrap: wrap; margin-top: -4px; }
  .kick-action { flex-wrap: wrap; }
  .request-card { align-items: flex-start; flex-direction: column; }
}
</style>
