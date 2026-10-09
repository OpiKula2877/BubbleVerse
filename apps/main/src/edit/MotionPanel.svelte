<script lang="ts">
  import { Button, NumberField, Segmented, Select, t } from '@bv/ui';
  import type { Easing, PathMotion, TrackMotion } from '@bv/world';
  import type { Editor } from '../lib/editor.svelte';
  import { motionEditor } from './motion-editor.svelte';

  /** Controls of the on-canvas motion editors (spec §4.4). */
  let { editor }: { editor: Editor } = $props();

  const track = $derived(motionEditor.track);
  const name = $derived(motionEditor.active ? editor.index.get(motionEditor.active.id)?.name : '');

  function patch(p: Partial<TrackMotion>) {
    if (track) motionEditor.track = { ...track, ...p } as TrackMotion;
  }
</script>

<div class="panel bv-glass">
  <div class="title">
    {#if track?.type === 'path'}{t('menu.setPath')}{:else if track?.type === 'orbit'}{t(
        'menu.setOrbit',
      )}{:else}{t('menu.setWander')}{/if}
    <span class="bv-muted">· {name}</span>
  </div>

  {#if track?.type === 'path'}
    <Segmented
      value={track.loop}
      options={[
        { value: 'loop', label: t('motion.loop.loop') },
        { value: 'pingpong', label: t('motion.loop.pingpong') },
      ]}
      onchange={(v) => patch({ loop: v as PathMotion['loop'] })}
    />
    <label>
      {t('motion.speed')}
      <NumberField value={track.speed} min={1} suffix="/s" onchange={(v) => patch({ speed: v })} />
    </label>
    <Select
      value={track.easing}
      options={[
        { value: 'linear', label: t('motion.easing.linear') },
        { value: 'easeIn', label: t('motion.easing.in') },
        { value: 'easeOut', label: t('motion.easing.out') },
        { value: 'easeInOut', label: t('motion.easing.inOut') },
      ]}
      onchange={(v) => patch({ easing: v as Easing })}
    />
  {:else if track?.type === 'orbit'}
    <Button
      small
      icon="target"
      active={motionEditor.picking}
      onclick={() => (motionEditor.picking = true)}
    >
      {t('motionEdit.pickCenter')}
    </Button>
  {:else if track?.type === 'wander'}
    <Segmented
      value={track.area.shape}
      options={[
        { value: 'circle', label: t('motion.area.circle') },
        { value: 'rect', label: t('motion.area.rect') },
      ]}
      onchange={(v) =>
        patch({
          area: v === 'circle' ? { shape: 'circle', r: 80 } : { shape: 'rect', w: 160, h: 100 },
        })}
    />
  {/if}

  <Button
    small
    icon={motionEditor.playing ? 'pause' : 'play'}
    active={motionEditor.playing}
    title={t('motionEdit.preview')}
    onclick={() => (motionEditor.playing = !motionEditor.playing)}
  />
  <Button small variant="primary" icon="check" onclick={() => motionEditor.commit(editor)}>
    {t('motionEdit.done')}
  </Button>
  <Button small onclick={() => motionEditor.stop()}>{t('common.cancel')}</Button>
  <p class="hint bv-muted">
    {#if motionEditor.picking}
      {t('motionEdit.hintPick')}
    {:else if track?.type === 'path'}
      {t('motionEdit.hintPath')}
    {:else if track?.type === 'orbit'}
      {t('motionEdit.hintOrbit')}
    {:else}
      {t('motionEdit.hintWander')}
    {/if}
  </p>
</div>

<style>
  .panel {
    position: absolute;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    max-width: min(900px, calc(100% - 40px));
    padding: 10px 14px;
    background: var(--bv-dialog);
  }
  .title {
    font-weight: 600;
    margin-right: 6px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--bv-text-2);
  }
  label :global(input) {
    width: 70px;
  }
  .hint {
    flex-basis: 100%;
    margin: 0;
    font-size: 12px;
  }
</style>
