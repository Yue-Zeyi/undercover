<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
onLaunch(() => {});
</script>

<style lang="scss">
page {
  --ink: #172923;
  --muted: #77827b;
  --green: #187e69;
  --green-soft: #e8f3ed;
  --coral: #e87563;
  --line: #e1e7e3;
  --paper: #f6f8f7;
  background: var(--paper);
  color: var(--ink);
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.6;
  letter-spacing: 0;
  min-height: 100%;
}
view, text, button, input, textarea, scroll-view { box-sizing: border-box; }
page button {
  font-family: inherit;
  font-size: 14px;
  line-height: 1.4;
  color: var(--ink);
  background: transparent;
  padding: 0;
  margin: 0;
  border-radius: 6px;
  &::after { border: 0; }
}
page button[disabled] { opacity: .5; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid #8acabb; outline-offset: 3px; }
input, textarea { font-family: inherit; font-size: 15px; color: var(--ink); }
.btn {
  min-height: 46px;
  padding: 12px 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 9px;
  font-weight: 600;
  border: 1px solid var(--line);
  background: white;
  transition: background .18s, transform .18s;
}
.btn:active { transform: translateY(1px); }
page button.btn-primary, page button.btn-primary[disabled] { background: var(--green); border-color: var(--green); color: white; }
page button.btn-ink, page button.btn-ink[disabled] { background: var(--ink); border-color: var(--ink); color: white; }
.btn-soft { background: var(--green-soft); border-color: var(--green-soft); color: var(--green); }
.btn-danger { color: #b4473d; }
.btn-wide { width: 100%; }
.icon-button { width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.text-button { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 0; color: var(--muted); font-size: 13px; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.row { display: flex; align-items: center; gap: 10px; }
.between { justify-content: space-between; }
.heading { font-size: 24px; font-weight: 750; line-height: 1.35; }
.field-label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.input-field { height: 48px; width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 0 14px; background: #fff; }
.tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; line-height: 1.3; padding: 4px 7px; border-radius: 4px; background: var(--green-soft); color: var(--green); }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; background: var(--green); flex-shrink: 0; }
.divider { height: 1px; background: var(--line); }
.mono { font-family: 'SFMono-Regular', Consolas, monospace; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { .btn, .connection-spinner { transition: none !important; animation: none !important; } }
/* #ifdef H5 */
html, body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
button, [role='button'], input, textarea { touch-action: manipulation; }
input:not(.room-code-input), textarea { font-size: 16px; }
.uni-input-input, .uni-textarea-textarea { font-size: 16px !important; touch-action: manipulation; }
/* #endif */
</style>
