<script lang="ts">
  import { fillColor, SkinResolver, writeSkin, type Media } from '@bv/world';
  import { Button, ColorField, Field, t, TextField } from '@bv/ui';
  import type { Editor } from '../lib/editor.svelte';
  import { store } from '../lib/store.svelte';
  import { pickImageAsset } from './assets';

  let { editor }: { editor: Editor } = $props();

  const qc = $derived(editor.quickCreate!);
  const bubble = $derived(editor.index.get(qc.id));
  let name = $state('');
  let color = $state('#4C97FF');
  let initialized = '';

  $effect(() => {
    if (bubble && initialized !== bubble.id) {
      initialized = bubble.id;
      name = bubble.name;
      color = fillColor(new SkinResolver(editor.index).skin(bubble.id));
    }
  });

  function rename(v: string) {
    editor.apply((w) => ({ ...w, bubbles: w.bubbles.map((b) => (b.id === qc.id ? { ...b, name: v } : b)) }), `name:${qc.id}`);
  }

  function recolor(v: string) {
    editor.apply((w) => writeSkin(w, [qc.id], 'fill', v), `fill:${qc.id}`);
  }

  async function icon() {
    const media = await pickImageAsset('icon');
    if (media) editor.apply((w) => writeSkin(w, [qc.id], 'media', media as Media));
  }

  function done() {
    editor.quickCreate = null;
  }

  const pos = $derived({
    x: Math.min(Math.max(8, qc.x - store.uiRect.x + 20), store.uiRect.w - 300),
    y: Math.min(Math.max(8, qc.y - store.uiRect.y - 20), store.uiRect.h - 220),
  });
</script>

<div class="quick bv-glass" style:left="{pos.x}px" style:top="{pos.y}px">
  <h3>{t('quick.title')}</h3>
  <Field label={t('quick.name')}>
    <TextField bind:value={name} autofocus oninput={rename} onenter={done} onkeydown={(e) => e.key === 'Escape' && done()} />
  </Field>
  <Field label={t('quick.color')}>
    <ColorField bind:value={color} onchange={recolor} />
  </Field>
  <Field label={t('quick.icon')}>
    <Button small icon="image" onclick={icon}>{t('skin.media.pick')}</Button>
  </Field>
  <div class="foot">
    <span class="bv-muted">{t('quick.hint')}</span>
    <Button small variant="primary" onclick={done}>{t('common.ok')}</Button>
  </div>
</div>

<style>
  .quick {
    position: absolute;
    z-index: 45;
    width: 290px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bv-dialog);
  }
  h3 {
    margin: 0 0 2px;
    font-size: 13px;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
  }
</style>
