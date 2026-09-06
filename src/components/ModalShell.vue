<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, onUnmounted, onUpdated, ref } from 'vue';
import AppIcon from './AppIcon.vue';
defineProps<{ title: string }>();
defineEmits<{ close: [] }>();
const contentHeight = ref<number>();

// #ifdef MP-WEIXIN
const instance = getCurrentInstance()!;
let measuring = false;
function measureContent() {
  if (measuring) return;
  measuring = true;
  nextTick(() => {
    const query = uni.createSelectorQuery().in(instance.proxy);
    const padding = { size: true, computedStyle: ['padding-top', 'padding-bottom'] };
    query.select('.modal-backdrop').fields(padding, () => {});
    query.select('.modal').fields(padding, () => {});
    query.select('.modal-header').fields({ size: true, computedStyle: ['margin-bottom'] }, () => {});
    query.select('.modal-body').boundingClientRect();
    query.exec(([backdrop, frame, header, body]) => {
      measuring = false;
      if (!backdrop || !frame || !header || !body) return;
      const available = backdrop.height - parseFloat(backdrop['padding-top']) - parseFloat(backdrop['padding-bottom'])
        - parseFloat(frame['padding-top']) - parseFloat(frame['padding-bottom']) - header.height - parseFloat(header['margin-bottom']);
      contentHeight.value = Math.max(1, Math.floor(Math.min(body.height, available)));
    });
  });
}
onMounted(() => { measureContent(); uni.onWindowResize(measureContent); });
onUpdated(measureContent);
onUnmounted(() => uni.offWindowResize(measureContent));
// #endif
</script>

<template>
  <view class="modal-backdrop" @tap.self="$emit('close')" @touchmove.stop.prevent>
    <view class="modal" role="dialog" aria-modal="true" :aria-label="title">
      <view class="row between modal-header">
        <text class="modal-title">{{ title }}</text>
        <button class="icon-button" aria-label="关闭" title="关闭" @tap="$emit('close')"><AppIcon name="x" /></button>
      </view>
      <scroll-view scroll-y class="modal-content" :style="contentHeight ? { height: `${contentHeight}px`, maxHeight: 'none' } : {}" @touchmove.stop><view class="modal-body"><slot /></view></scroll-view>
    </view>
  </view>
</template>

<style scoped>
.modal-backdrop { position: fixed; inset: 0; background: rgba(15, 31, 25, .42); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 24px; }
.modal { background: #fff; border-radius: 8px; width: 100%; max-width: 460px; box-shadow: 0 20px 80px #17292326; padding: 22px 26px 28px; }
.modal-header { margin-bottom: 16px; }
.modal-title { font-size: 20px; font-weight: 700; }
.modal-content { max-height: 65vh; }
@media (max-width: 480px) { .modal-backdrop { padding: 18px; } .modal { padding: 16px 20px 24px; } }
/* #ifdef MP-WEIXIN */
.modal-backdrop, .modal, .modal-header, .modal-content, .modal-body { box-sizing: border-box; }
.modal-backdrop { padding-bottom: calc(18px + var(--safe-bottom, env(safe-area-inset-bottom, 0px))); }
.modal { display: flex; flex-direction: column; max-height: 100%; overflow: hidden; }
.modal-header { flex-shrink: 0; }
.modal-content { flex: 0 1 auto; min-height: 0; }
/* #endif */
</style>
