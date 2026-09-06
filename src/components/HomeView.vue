<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { DEFAULT_SETTINGS } from '../../shared/protocol';
import { DIFFICULTIES, WORD_CATEGORIES, type WordCatalog } from '../../shared/word-catalog';
import { requestWordCatalog } from '../services/connection';
import { useGameStore } from '../stores/game';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ inviteCode: string; systemName?: string }>();
const emit = defineEmits<{ leave: [] }>();
const game = useGameStore();
const profile = uni.getStorageSync('wodi-profile-v1') || {};
const nickname = ref(typeof profile.nickname === 'string' ? profile.nickname : '');
const avatar = ref(Number.isInteger(profile.avatar) && profile.avatar >= 0 && profile.avatar < 8 ? profile.avatar : 0);
const mode = ref<'create' | 'join'>(props.inviteCode ? 'join' : 'create');
const code = ref(props.inviteCode);
const settings = ref({ ...DEFAULT_SETTINGS });
const localError = ref('');
const categories = [{ value: 'all', label: '全部主题', icon: 'shuffle' }, ...WORD_CATEGORIES] as const;
const categoryIndex = computed(() => categories.findIndex(category => category.value === settings.value.category));
const selectedCategory = computed(() => categories[categoryIndex.value]!);
const catalog = ref<WordCatalog>();
const catalogLoading = ref(false);
const catalogError = ref(false);
const eligibleCount = computed(() => {
  if (!catalog.value) return undefined;
  const category = catalog.value.categories.find(item => item.id === settings.value.category);
  const counts = category || catalog.value;
  return settings.value.difficulty === 'all' ? (category ? category.count : catalog.value.total) : counts.difficulties[settings.value.difficulty];
});
function selectCategory(event: { detail: { value: string | number } }) {
  const category = categories[Number(event.detail.value)];
  if (category) settings.value.category = category.value;
}
async function loadCatalog() {
  catalogLoading.value = true;
  catalogError.value = false;
  try { catalog.value = await requestWordCatalog(); }
  catch { catalogError.value = true; }
  finally { catalogLoading.value = false; }
}
onMounted(loadCatalog);
const maxUndercover = computed(() => Math.min(3, Math.floor((settings.value.capacity - 1) / 2)));
watch(() => props.inviteCode, value => { if (value) { code.value = value; mode.value = 'join'; } });
watch(() => settings.value.capacity, () => { settings.value.undercoverCount = Math.min(settings.value.undercoverCount, maxUndercover.value); });
watch(mode, () => { localError.value = ''; game.clearError(); });

async function submit() {
  if (game.session) { emit('leave'); return; }
  localError.value = '';
  if (!nickname.value.trim()) { localError.value = '先给自己取个名字吧'; return; }
  if (mode.value === 'join' && !/^\d{6}$/.test(code.value)) { localError.value = '请输入 6 位房间号'; return; }
  uni.setStorageSync('wodi-profile-v1', { nickname: nickname.value.trim(), avatar: avatar.value });
  if (mode.value === 'create') await game.createRoom(nickname.value.trim(), avatar.value, settings.value);
  else await game.joinRoom(code.value, nickname.value.trim(), avatar.value);
}
</script>

<template>
  <view class="home">
    <view class="intro">
      <view class="intro-copy">
        <text class="intro-title">{{ props.systemName || '谁是卧底' }}</text>
        <text class="intro-subtitle">熟悉的朋友，陌生的身份。</text>
        <view class="intro-meta"><text>4—12 人</text><view class="meta-line" /><text>好友局</text><view class="meta-line" /><text>在线同玩</text></view>
      </view>
      <image class="mission-art" src="/static/mission-art.svg" mode="aspectFit" />
    </view>

    <view class="game-desk">
      <view class="desk-tabs" role="tablist" aria-label="游戏方式">
        <button class="desk-tab" :class="{ active: mode === 'create' }" role="tab" :aria-selected="mode === 'create'" @tap="mode = 'create'">
          <AppIcon name="plus" :size="19" /><text>创建房间</text>
        </button>
        <button class="desk-tab" :class="{ active: mode === 'join' }" role="tab" :aria-selected="mode === 'join'" @tap="mode = 'join'">
          <AppIcon name="door-open" :size="19" /><text>加入房间</text>
        </button>
      </view>

      <view class="desk-body">
        <view class="profile-section">
          <view class="name-field">
            <text class="field-label">你的昵称</text>
            <input v-model="nickname" class="input-field" placeholder="取一个让朋友认出的名字" :maxlength="10" aria-label="你的昵称" @confirm="submit" />
          </view>
          <view class="avatar-field">
            <text class="field-label">选个头像</text>
            <view class="avatar-options">
              <button v-for="n in 8" :key="n" class="avatar-option" :class="{ selected: avatar === n - 1 }" :aria-label="`头像 ${n}`" :aria-pressed="avatar === n - 1" @tap="avatar = n - 1">
                <image :src="`/static/avatars/${n - 1}.svg`" class="avatar-image" mode="aspectFit" />
                <view v-if="avatar === n - 1" class="avatar-check"><AppIcon name="check" :size="10" light /></view>
              </button>
            </view>
          </view>
        </view>

        <view class="divider" />

        <view v-if="mode === 'create'" class="room-settings">
          <view class="settings-top">
            <view class="setting-item">
              <text class="field-label">房间人数</text>
              <view class="stepper">
                <button class="stepper-button" :disabled="settings.capacity <= 4" aria-label="减少人数" title="减少人数" @tap="settings.capacity--"><AppIcon name="minus" :size="17" /></button>
                <view class="stepper-value"><text class="number">{{ settings.capacity }}</text><text class="unit">人</text></view>
                <button class="stepper-button" :disabled="settings.capacity >= 12" aria-label="增加人数" title="增加人数" @tap="settings.capacity++"><AppIcon name="plus" :size="17" /></button>
              </view>
            </view>
            <view class="setting-item">
              <text class="field-label">卧底人数</text>
              <view class="stepper">
                <button class="stepper-button" :disabled="settings.undercoverCount <= 1" aria-label="减少卧底" title="减少卧底" @tap="settings.undercoverCount--"><AppIcon name="minus" :size="17" /></button>
                <view class="stepper-value"><text class="number coral">{{ settings.undercoverCount }}</text><text class="unit">人</text></view>
                <button class="stepper-button" :disabled="settings.undercoverCount >= maxUndercover" aria-label="增加卧底" title="增加卧底" @tap="settings.undercoverCount++"><AppIcon name="plus" :size="17" /></button>
              </view>
            </view>
            <view class="setting-item duration-setting">
              <text class="field-label">每人发言</text>
              <view class="segments">
                <button v-for="seconds in ([60, 90, 120] as const)" :key="seconds" :class="{ chosen: settings.turnSeconds === seconds }" :aria-pressed="settings.turnSeconds === seconds" @tap="settings.turnSeconds = seconds">{{ seconds }} 秒</button>
              </view>
            </view>
          </view>
          <view class="category-row">
            <view class="theme-setting">
              <text class="field-label">词库主题</text>
              <picker :range="categories" range-key="label" :value="categoryIndex" @change="selectCategory">
                <view class="category-select" role="button" aria-label="选择词库主题" tabindex="0">
                  <AppIcon :name="selectedCategory.icon" :size="17" /><text>{{ selectedCategory.label }}</text><AppIcon name="chevron-down" :size="16" />
                </view>
              </picker>
            </view>
            <view class="difficulty-setting">
              <text class="field-label">词语难度</text>
              <view class="segments difficulty-options">
                <button v-for="difficulty in DIFFICULTIES" :key="difficulty.value" :class="{ chosen: settings.difficulty === difficulty.value }" :aria-pressed="settings.difficulty === difficulty.value" @tap="settings.difficulty = difficulty.value">{{ difficulty.label }}</button>
              </view>
            </view>
          </view>
          <view class="catalog-summary" aria-live="polite">
            <template v-if="catalogLoading"><text>正在加载词库数量</text></template>
            <template v-else-if="catalogError"><text>词库数量暂时无法加载</text><button class="catalog-retry" aria-label="重新加载词库数量" title="重新加载词库数量" @tap="loadCatalog"><AppIcon name="refresh-cw" :size="15" /></button></template>
            <template v-else><AppIcon name="layers" :size="15" /><text>当前可用 <text class="catalog-count">{{ eligibleCount }}</text> 组词对</text><text class="catalog-total">共 {{ catalog?.total }} 组 · 8 个主题</text></template>
          </view>
        </view>

        <view v-else class="join-settings">
          <text class="field-label">房间号</text>
          <input v-model="code" class="room-code-input mono" type="number" inputmode="numeric" :maxlength="6" placeholder="输入 6 位房间号" aria-label="房间号" @confirm="submit" />
        </view>

        <view v-if="localError" class="local-error" role="alert"><AppIcon name="circle-alert" :size="16" /><text>{{ localError }}</text></view>
        <button class="btn btn-wide primary-action" :class="game.session ? 'btn-danger' : 'btn-primary'" :disabled="game.busy" :loading="game.busy" @tap="submit">
          <text>{{ game.busy ? (game.session ? '正在处理' : '正在进入房间') : game.session ? '退出当前房间' : mode === 'create' ? '创建好友房' : '加入好友房' }}</text>
          <AppIcon v-if="!game.busy" :name="game.session ? 'log-out' : 'arrow-right'" :light="!game.session" :size="19" />
        </button>
      </view>
    </view>
    <view class="home-footer"><view class="footer-line" /><AppIcon name="fingerprint" :size="18" /><text>每一句话，都有破绽。</text><view class="footer-line" /></view>
  </view>
</template>

<style scoped lang="scss">
.home { max-width: 850px; margin: 0 auto; }
.intro { display: flex; align-items: center; justify-content: space-between; padding: 12px 58px 6px; min-height: 242px; }
.intro-copy { padding: 15px 0; flex-shrink: 0; position: relative; z-index: 1; }
.intro-title { display: block; font-size: 44px; font-weight: 850; line-height: 1.35; }
.intro-subtitle { display: block; color: #6a7870; margin-top: 12px; font-size: 15px; }
.intro-meta { margin-top: 22px; display: flex; align-items: center; gap: 12px; font-size: 11px; color: #7c8880; }
.meta-line { width: 1px; height: 10px; background: #d1dbd5; }
.mission-art { width: 312px; height: 232px; flex-shrink: 0; }
.game-desk { background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 34px #20392e05; overflow: hidden; }
.desk-tabs { display: flex; border-bottom: 1px solid var(--line); padding: 0 32px; gap: 30px; }
.desk-tab { display: flex; align-items: center; justify-content: center; gap: 9px; padding: 21px 8px 19px; color: #829087; border-radius: 0; border-bottom: 3px solid transparent; min-width: 136px; font-size: 15px; }
.desk-tab.active { color: var(--green); border-bottom-color: var(--green); font-weight: 700; }
.desk-body { padding: 27px 36px 30px; }
.profile-section { display: flex; align-items: flex-start; gap: 30px; margin-bottom: 26px; }
.name-field { flex: 1; min-width: 0; }
.avatar-field { width: 354px; }
.avatar-options { display: flex; justify-content: space-between; gap: 6px; height: 48px; align-items: center; }
.avatar-option { width: 37px; height: 37px; flex-shrink: 0; border-radius: 50%; position: relative; overflow: visible; outline: 2px solid transparent; outline-offset: 3px; }
.avatar-option.selected { outline-color: var(--green); }
.avatar-image { width: 100%; height: 100%; border-radius: 50%; display: block; }
.avatar-check { position: absolute; right: -3px; bottom: -4px; border: 2px solid white; width: 17px; height: 17px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--green); }
.room-settings { padding-top: 25px; }
.settings-top { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 26px; }
.stepper { display: flex; align-items: center; justify-content: space-between; height: 47px; border: 1px solid var(--line); border-radius: 6px; }
.stepper-button { width: 38px; height: 44px; display: flex; justify-content: center; align-items: center; }
.stepper-value { display: flex; gap: 5px; align-items: baseline; }
.number { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.unit { font-size: 12px; color: var(--muted); }
.coral { color: #d56b59; }
.segments { display: flex; align-items: center; gap: 3px; background: #f3f6f4; border-radius: 6px; padding: 4px; height: 47px; }
.segments button { flex: 1; height: 37px; line-height: 37px; font-size: 12px; color: var(--muted); white-space: nowrap; }
.segments .chosen { background: #fff; color: var(--ink); box-shadow: 0 1px 4px #17292312; font-weight: 600; }
.category-row { display: grid; grid-template-columns: 1fr 1.4fr; gap: 26px; margin: 23px 0 14px; }
.theme-setting, .difficulty-setting { min-width: 0; }
.category-select { display: flex; align-items: center; gap: 9px; height: 47px; padding: 0 13px; border: 1px solid var(--line); border-radius: 6px; font-size: 13px; cursor: pointer; }
.category-select > text { flex: 1; }
.catalog-summary { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; font-size: 11px; color: var(--muted); min-height: 25px; margin-bottom: 19px; }
.catalog-count { color: var(--green); font-weight: 700; }
.catalog-total { margin-left: auto; color: #929d95; }
.catalog-retry { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; }
.primary-action { min-height: 50px; font-size: 15px; }
.local-error { display: flex; gap: 8px; align-items: center; color: #b4473d; font-size: 13px; margin: 0 0 14px; }
.join-settings { padding: 25px 0 28px; }
.room-code-input { font-size: 24px; height: 69px; padding: 0 20px; width: 100%; border: 1px solid var(--line); border-radius: 6px; background: #f8faf9; }
.home-footer { display: flex; align-items: center; justify-content: center; gap: 10px; color: #929d95; font-size: 11px; padding: 26px 20px; }
.footer-line { width: 32px; height: 1px; background: var(--line); margin: 0 4px; }
@media (max-width: 700px) {
  .intro { padding: 8px 20px; min-height: 200px; }
  .intro-title { font-size: 36px; }
  .mission-art { width: 245px; height: 195px; }
  .desk-body { padding: 24px; }
  .profile-section { flex-direction: column; gap: 21px; }
  .name-field, .avatar-field { width: 100%; }
  .avatar-options { justify-content: flex-start; gap: 16px; }
  .settings-top { gap: 15px; }
}
@media (max-width: 480px) {
  .intro { padding: 4px 2px 8px; min-height: 174px; }
  .intro-copy { flex: 1; }
  .intro-title { font-size: 32px; }
  .intro-subtitle { font-size: 11px; margin-top: 8px; }
  .intro-meta { gap: 7px; font-size: 10px; margin-top: 15px; }
  .mission-art { width: 165px; height: 164px; margin-right: -6px; }
  .desk-tabs { padding: 0 18px; gap: 16px; }
  .desk-tab { flex: 1; min-width: 0; padding: 17px 0 15px; font-size: 14px; }
  .desk-body { padding: 22px 20px; }
  .profile-section { gap: 18px; margin-bottom: 22px; }
  .avatar-options { justify-content: space-between; gap: 4px; }
  .avatar-option { width: 30px; height: 30px; }
  .avatar-options { height: 37px; }
  .settings-top { grid-template-columns: 1fr 1fr; gap: 19px 20px; }
  .duration-setting { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .duration-setting .field-label { margin: 0; font-size: 12px; flex-shrink: 0; }
  .segments { width: 195px; height: 40px; }
  .segments button { height: 32px; line-height: 32px; }
  .category-row { grid-template-columns: 1fr; gap: 18px; margin-top: 20px; }
  .difficulty-setting { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .difficulty-setting .field-label { margin: 0; font-size: 12px; flex-shrink: 0; }
  .difficulty-options { flex: 1; min-width: 0; max-width: 230px; }
  .catalog-total { margin-left: 0; }
  .home-footer { padding: 22px 0; }
}
@media (max-width: 350px) { .intro-title { font-size: 29px; } .mission-art { width: 139px; } .desk-body { padding: 20px 16px; } .avatar-option { width: 27px; height: 27px; } }
</style>
