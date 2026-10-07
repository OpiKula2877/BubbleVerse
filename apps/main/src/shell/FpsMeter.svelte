<script lang="ts">
  import { t } from '@bv/ui';
  import { store } from '../lib/store.svelte';
</script>

<div class="fps">
  {t('view.fps')}
  {store.stats?.fps ?? 0} · {store.stats?.frameMs ?? 0} ms · {store.stats?.bubbles ?? 0}
</div>

<style>
  .fps {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 30;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--bv-tooltip);
    color: var(--bv-tooltip-text);
    font:
      12px Consolas,
      monospace;
    pointer-events: none;
  }
</style>
