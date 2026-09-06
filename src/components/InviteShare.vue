<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
// #ifdef H5
import { createQrCanvas } from '../services/qr';
// #endif

const props = defineProps<{
  roomCode: string;
  inviteUrl: string;
  systemName: string;
}>();

const posterDataUrl = ref('');
const generating = ref(true);
const generationError = ref('');

// #ifdef H5
function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawPoster(qrCanvas: HTMLCanvasElement): string {
  const width = 720;
  const height = 960;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法生成邀请海报');
  context.imageSmoothingEnabled = false;

  context.fillStyle = '#f6f8f7';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#172923';
  context.fillRect(0, 0, width, 238);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#ffffff';
  context.font = '700 40px system-ui, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif';
  const title = props.systemName.trim() || '谁是卧底';
  context.fillText(title.length > 14 ? `${title.slice(0, 14)}…` : title, width / 2, 76);
  context.fillStyle = '#b8d8c7';
  context.font = '500 25px system-ui, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif';
  context.fillText('好友房 · 邀请入座', width / 2, 137);
  context.fillStyle = '#ffffff';
  context.font = '700 58px "SFMono-Regular", Consolas, monospace';
  context.fillText(props.roomCode, width / 2, 204);

  context.fillStyle = '#ffffff';
  drawRoundedRect(context, 120, 280, 480, 480, 28);
  context.fill();
  const qrSize = 408;
  context.drawImage(qrCanvas, (width - qrSize) / 2, 316, qrSize, qrSize);

  context.fillStyle = '#172923';
  context.font = '600 25px system-ui, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif';
  context.fillText('扫码加入好友局', width / 2, 820);
  context.fillStyle = '#77827b';
  context.font = '400 20px system-ui, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif';
  context.fillText('打开链接后输入昵称即可入座', width / 2, 874);
  return canvas.toDataURL('image/png');
}

function generateImages() {
  generating.value = true;
  generationError.value = '';
  if (!props.inviteUrl) {
    posterDataUrl.value = '';
    generationError.value = '邀请链接暂不可用，请重新打开邀请弹窗';
    generating.value = false;
    return;
  }
  try {
    const qrCanvas = createQrCanvas(props.inviteUrl);
    posterDataUrl.value = drawPoster(qrCanvas);
  } catch (error) {
    posterDataUrl.value = '';
    generationError.value = error instanceof Error ? error.message : '邀请海报生成失败，请稍后重试';
  } finally {
    generating.value = false;
  }
}

function saveDataUrl(dataUrl: string, filename: string, label: string) {
  if (!dataUrl) return;
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  uni.showToast({ title: `${label}已生成`, icon: 'none' });
}

function savePoster() {
  saveDataUrl(posterDataUrl.value, `邀请海报-${props.roomCode}.png`, '邀请海报');
}

function copyInvite() {
  uni.setClipboardData({
    data: props.inviteUrl,
    success: () => uni.showToast({ title: '邀请链接已复制', icon: 'none' }),
  });
}

// #endif

onMounted(() => {
  // #ifdef H5
  generateImages();
  // #endif
});

watch(() => [props.roomCode, props.inviteUrl, props.systemName], () => {
  // #ifdef H5
  generateImages();
  // #endif
});
</script>

<template>
  <!-- #ifdef H5 -->
  <view class="invite-share">
    <view class="invite-intro"><AppIcon name="scan-line" :size="16" /><text>保存海报或复制链接，邀请好友加入</text></view>
    <view v-if="generating" class="invite-loading"><view class="connection-spinner" /><text>正在生成邀请海报…</text></view>
    <text v-else-if="generationError" class="invite-error">{{ generationError }}</text>
    <template v-else>
      <view class="invite-poster">
        <image class="poster-image" :src="posterDataUrl" mode="widthFix" />
        <text class="visual-label">邀请海报</text>
      </view>
      <view class="invite-actions">
        <view class="invite-actions-row">
          <button class="btn btn-primary" @tap="savePoster"><AppIcon name="download" light :size="17" /><text>保存邀请海报</text></button>
          <button class="btn" @tap="copyInvite"><AppIcon name="link" :size="16" /><text>复制邀请链接</text></button>
        </view>
      </view>
      <text class="invite-hint">好友扫码海报即可加入；也可以长按图片保存。</text>
    </template>
  </view>
  <!-- #endif -->
</template>

<style scoped lang="scss">
.invite-share { color: var(--ink); }
.invite-intro { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; line-height: 1.5; margin: -3px 0 15px; }
.invite-loading { min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--muted); font-size: 12px; }
.invite-error { display: block; color: #b84f42; font-size: 12px; padding: 22px 0; text-align: center; }
.invite-poster { display: flex; flex-direction: column; align-items: center; }
.poster-image { width: min(100%, 300px); max-height: 390px; object-fit: contain; display: block; border: 1px solid var(--line); border-radius: 7px; box-shadow: 0 7px 20px #17292312; }
.visual-label { font-size: 11px; color: var(--muted); margin-top: 8px; }
.invite-actions { margin-top: 16px; }
.invite-actions-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.invite-actions-row .btn { min-width: 0; padding-left: 8px; padding-right: 8px; font-size: 12px; }
.invite-hint { display: block; color: var(--muted); font-size: 11px; line-height: 1.7; text-align: center; margin-top: 14px; }
.connection-spinner { width: 13px; height: 13px; border: 2px solid #d7e1db; border-top-color: var(--green); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 390px) { .invite-actions-row .btn { font-size: 11px; } }
</style>
