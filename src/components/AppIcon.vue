<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number; light?: boolean }>(), { size: 20, light: false });
</script>

<template>
  <image class="app-icon" :class="{ light }" :src="`/static/icons/${name}.svg`" :style="{ width: `${size}px`, height: `${size}px` }" mode="aspectFit" aria-hidden="true" />
</template>

<style scoped>
.app-icon { display: block; flex-shrink: 0; opacity: .85; }
.light { filter: brightness(0) invert(1); opacity: 1; }
</style>
