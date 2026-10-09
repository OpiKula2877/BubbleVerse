<script lang="ts">
  import { applyTemplate, fillColor, SkinResolver, writeSkin, type Media } from '@bv/world';
  import { Button, ColorField, Field, Select, t, TextField } from '@bv/ui';
  import type { Editor } from '../lib/editor.svelte';
  import { store } from '../lib/store.svelte';
  import { untrack } from 'svelte';
  import { pickImageAsset } from './assets';

  let { editor }: { editor: Editor } = $props();

  // Created per bubble (keyed by id in EditMode), so initial values are read once.
  const qc = untrack(() => editor.quickCreate!);
  let name = $state(untrack(() => editor.index.get(qc.id)?.name ?? ''));
  let color = $state(untrack(() => fillColor(new SkinResolver(editor.index).skin(qc.id))));

  function rename(v: string) {
    editor.apply(
      (w) => ({ ...w, bubbles: w.bubbles.map((b) => (b.id === qc.id ? { ...b, name: v } : b)) }),
      `name:${qc.id}`,
    );
  }

  function recolor(v: string) {
    editor.apply((w) => writeSkin(w, [qc.id], 'fill', v), `fill:${qc.id}`);
  }

  async function icon() {
    const media = await pickImageAsset('icon');
    if (media) editor.apply((w) => writeSkin(w, [qc.id], 'media', media as Media));
  }

  /** A template replaces look, behaviour and scripts; the name stays (spec §4.2). */
  function useTemplate(id: string) {
    const tpl = editor.world?.templates.find((x) => x.id === id);
    if (!tpl) return;
    editor.apply((w) => applyTemplate(w, [qc.id], tpl, store.renderer?.basePositions()));
    color = fillColor(new SkinResolver(editor.index).skin(qc.id));
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
    <TextField
      bind:value={name}
      autofocus
      oninput={rename}
      onenter={done}
      onkeydown={(e) => e.key === 'Escape' && done()}
    />
  </Field>
  <Field label={t('quick.color')}>
    <ColorField bind:value={color} onchange={recolor} />
  </Field>
  <Field label={t('quick.icon')}>
    <Button small icon="image" onclick={icon}>{t('skin.media.pick')}</Button>
  </Field>
  {#if editor.world?.templates.length}
    <Field label={t('quick.template')}>
      <Select
        options={[
          { value: '', label: t('common.none') },
          ...editor.world.templates.map((x) => ({ value: x.id, label: x.name })),
        ]}
        value=""
        onchange={(v) => v && useTemplate(v)}
      />
    </Field>
  {/if}
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
