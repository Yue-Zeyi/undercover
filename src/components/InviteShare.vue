<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
// #ifdef H5
import qrcode from 'qrcode-generator';
// #endif

const props = defineProps<{
  roomCode: string;
  inviteUrl: string;
  systemName: string;
}>();

const qrDataUrl = ref('');
const posterDataUrl = ref('');
const generating = ref(true);
const generationError = ref('');
const canShare = ref(false);

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

function createQrCanvas(): HTMLCanvasElement {
  const code = qrcode(0, 'M');
  code.addData(props.inviteUrl, 'Byte');
  code.make();

  const moduleCount = code.getModuleCount();
  const margin = 4;
  const cellSize = Math.max(4, Math.floor(480 / (moduleCount + margin * 2)));
  const size = (moduleCount + margin * 2) * cellSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法生成二维码');
  context.imageSmoothingEnabled = false;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#172923';
  for (let row = 0; row < moduleCount; row += 1) {
    for (let column = 0; column < moduleCount; column += 1) {
      if (code.isDark(row, column)) {
        context.fillRect((column + margin) * cellSize, (row + margin) * cellSize, cellSize, cellSize);
      }
    }
  }
  return canvas;
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
    qrDataUrl.value = '';
    posterDataUrl.value = '';
    generationError.value = '邀请链接暂不可用，请重新打开邀请弹窗';
    generating.value = false;
    return;
  }
  try {
    const qrCanvas = createQrCanvas();
    qrDataUrl.value = qrCanvas.toDataURL('image/png');
    posterDataUrl.value = drawPoster(qrCanvas);
  } catch (error) {
    qrDataUrl.value = '';
    posterDataUrl.value = '';
    generationError.value = error instanceof Error ? error.message : '二维码生成失败，请稍后重试';
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

function saveQr() {
  saveDataUrl(qrDataUrl.value, `房间二维码-${props.roomCode}.png`, '二维码');
}

function copyInvite() {
  uni.setClipboardData({
    data: props.inviteUrl,
    success: () => uni.showToast({ title: '邀请链接已复制', icon: 'none' }),
  });
}

async function shareInvite() {
  if (!canShare.value || typeof navigator === 'undefined' || !navigator.share) return;
  try {
    await navigator.share({
      title: `${props.systemName || '谁是卧底'} · 好友房`,
      text: `邀请你加入好友房，房间号：${props.roomCode}`,
      url: props.inviteUrl,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    uni.showToast({ title: '系统分享暂不可用，请复制链接', icon: 'none' });
  }
}

// #endif

onMounted(() => {
  // #ifdef H5
  canShare.value = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
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
    <view class="invite-intro"><AppIcon name="scan-line" :size="16" /><text>扫码或保存海报，好友打开后即可加入</text></view>
    <view v-if="generating" class="invite-loading"><view class="connection-spinner" /><text>正在生成二维码…</text></view>
    <text v-else-if="generationError" class="invite-error">{{ generationError }}</text>
    <template v-else>
      <view class="invite-visuals">
        <view class="qr-panel">
          <view class="qr-frame"><image class="qr-image" :src="qrDataUrl" mode="aspectFit" /></view>
          <text class="visual-label">房间二维码</text>
        </view>
        <view class="poster-panel">
          <image class="poster-image" :src="posterDataUrl" mode="widthFix" />
          <text class="visual-label">邀请海报</text>
        </view>
      </view>
      <view class="invite-room-line"><text class="small muted">房间号</text><text class="mono">{{ roomCode }}</text></view>
      <view class="invite-actions">
        <button class="btn btn-primary btn-wide" @tap="savePoster"><AppIcon name="download" light :size="17" /><text>保存邀请海报</text></button>
        <view class="invite-secondary-actions">
          <button class="btn" @tap="saveQr"><AppIcon name="qr-code" :size="16" /><text>保存二维码</text></button>
          <button v-if="canShare" class="btn" @tap="shareInvite"><AppIcon name="send" :size="16" /><text>系统分享</text></button>
        </view>
        <button class="text-button" @tap="copyInvite"><AppIcon name="link" :size="15" /><text>复制邀请链接</text></button>
      </view>
      <text class="invite-hint">保存后的二维码可以再次发送；房间需要仍在有效期内。iPhone 若未自动保存，可长按图片保存。</text>
    </template>
  </view>
  <!-- #endif -->
</template>

<style scoped lang="scss">
.invite-share { color: var(--ink); }
.invite-intro { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; line-height: 1.5; margin: -3px 0 15px; }
.invite-loading { min-height: 230px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--muted); font-size: 12px; }
.invite-error { display: block; color: #b84f42; font-size: 12px; padding: 22px 0; text-align: center; }
.invite-visuals { display: grid; grid-template-columns: minmax(0, 1fr) 116px; align-items: end; gap: 14px; }
.qr-panel, .poster-panel { display: flex; flex-direction: column; align-items: center; min-width: 0; }
.qr-frame { width: 100%; max-width: 226px; aspect-ratio: 1; padding: 10px; background: #fff; border: 1px solid var(--line); border-radius: 9px; box-shadow: 0 7px 20px #17292312; }
.qr-image { width: 100%; height: 100%; display: block; }
.poster-image { width: 100%; max-height: 174px; object-fit: contain; display: block; border: 1px solid var(--line); border-radius: 7px; box-shadow: 0 7px 20px #17292312; }
.visual-label { font-size: 11px; color: var(--muted); margin-top: 8px; }
.invite-room-line { display: flex; align-items: baseline; justify-content: center; gap: 9px; margin: 14px 0 15px; }
.invite-room-line .mono { font-size: 24px; font-weight: 650; letter-spacing: .08em; }
.invite-actions { display: flex; flex-direction: column; gap: 10px; }
.invite-secondary-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.invite-secondary-actions .btn { min-width: 0; padding-left: 8px; padding-right: 8px; font-size: 12px; }
.invite-hint { display: block; color: var(--muted); font-size: 11px; line-height: 1.7; text-align: center; margin-top: 14px; }
.connection-spinner { width: 13px; height: 13px; border: 2px solid #d7e1db; border-top-color: var(--green); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 390px) {
  .invite-visuals { grid-template-columns: minmax(0, 1fr) 100px; gap: 10px; }
  .qr-frame { padding: 7px; }
  .invite-secondary-actions .btn { font-size: 11px; }
}
</style>
