<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
// #ifdef H5
import { createQrDataUrl } from '../services/qr';
// #endif

const props = defineProps<{
  entryUrl: string;
  systemName: string;
}>();

const emit = defineEmits<{ done: [] }>();
const qrDataUrl = ref('');
const errorMessage = ref('');
const generating = ref(true);

// #ifdef H5
function generateQr() {
  generating.value = true;
  errorMessage.value = '';
  if (!props.entryUrl) {
    qrDataUrl.value = '';
    errorMessage.value = '平台入口暂不可用，请关闭后稍后再试';
    generating.value = false;
    return;
  }
  try {
    qrDataUrl.value = createQrDataUrl(props.entryUrl);
  } catch (error) {
    qrDataUrl.value = '';
    errorMessage.value = error instanceof Error ? error.message : '二维码生成失败，请稍后再试';
  } finally {
    generating.value = false;
  }
}

function saveQr() {
  if (!qrDataUrl.value) return;
  const anchor = document.createElement('a');
  anchor.href = qrDataUrl.value;
  anchor.download = '平台入口二维码.png';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  uni.showToast({ title: '二维码已保存/下载', icon: 'none' });
}
// #endif

onMounted(() => {
  // #ifdef H5
  generateQr();
  // #endif
});

watch(() => props.entryUrl, () => {
  // #ifdef H5
  generateQr();
  // #endif
});
</script>

<template>
  <!-- #ifdef H5 -->
  <view class="entry-prompt">
    <view class="entry-lead"><view class="entry-icon"><AppIcon name="fingerprint" :size="18" light /></view><text>先把平台入口留在手机里</text></view>
    <text class="entry-title">建议先截图保存，换手机或忘记网址时也能回来</text>
    <text class="entry-copy">这是平台首页二维码。以后打开相机扫码，就能再次进入游戏大厅。</text>
    <view v-if="generating" class="entry-loading"><view class="connection-spinner" /><text>正在生成入口二维码…</text></view>
    <text v-else-if="errorMessage" class="entry-error">{{ errorMessage }}</text>
    <template v-else>
      <view class="entry-qr-frame"><image class="entry-qr" :src="qrDataUrl" mode="aspectFit" /></view>
      <text class="entry-name">{{ systemName || '谁是卧底' }} · 好友局</text>
      <button class="btn btn-primary btn-wide" @tap="saveQr"><AppIcon name="download" light :size="17" /><text>保存二维码到手机</text></button>
      <text class="entry-hint">如果浏览器没有自动保存，直接长按二维码图片即可保存。</text>
    </template>
    <button class="text-button entry-done" @tap="emit('done')"><AppIcon name="check" :size="15" /><text>我已截图保存，开始游戏</text></button>
  </view>
  <!-- #endif -->
</template>

<style scoped lang="scss">
.entry-prompt { color: var(--ink); }
.entry-lead { display: flex; align-items: center; gap: 9px; color: var(--green); font-size: 13px; font-weight: 700; }
.entry-icon { width: 31px; height: 31px; display: flex; align-items: center; justify-content: center; background: var(--green); border-radius: 8px; }
.entry-title { display: block; font-size: 18px; line-height: 1.45; font-weight: 750; margin-top: 17px; }
.entry-copy { display: block; color: var(--muted); font-size: 12px; line-height: 1.8; margin-top: 8px; }
.entry-loading { min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--muted); font-size: 12px; }
.entry-error { display: block; color: #b84f42; font-size: 12px; line-height: 1.7; text-align: center; padding: 24px 0; }
.entry-qr-frame { width: min(100%, 252px); aspect-ratio: 1; padding: 12px; margin: 20px auto 18px; background: #fff; border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px #17292314; }
.entry-qr { width: 100%; height: 100%; display: block; }
.entry-name { display: block; color: var(--muted); font-size: 11px; margin: -7px 0 13px; }
.entry-hint { display: block; color: var(--muted); font-size: 11px; line-height: 1.7; text-align: center; margin-top: 11px; }
.entry-done { margin: 13px auto 0; }
.connection-spinner { width: 13px; height: 13px; border: 2px solid #d7e1db; border-top-color: var(--green); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
