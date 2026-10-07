<script lang="ts">
  import { Icon, Section, t } from '@bv/ui';
  import type { Editor } from '../lib/editor.svelte';
  import ActionSection from './inspector/ActionSection.svelte';
  import AttachSection from './inspector/AttachSection.svelte';
  import BasicSection from './inspector/BasicSection.svelte';
  import HoverSection from './inspector/HoverSection.svelte';
  import LinkSection from './inspector/LinkSection.svelte';
  import MotionSection from './inspector/MotionSection.svelte';
  import PhysicsSection from './inspector/PhysicsSection.svelte';
  import SkinSection from './inspector/SkinSection.svelte';

  let { editor }: { editor: Editor } = $props();

  const ids = $derived(editor.selected);
  const allActions = $derived(
    ids.length > 0 && ids.every((id) => editor.index.get(id)?.kind === 'action'),
  );
  const hasParent = $derived(ids.some((id) => editor.index.get(id)?.parentId));
  const missing = $derived(ids.some((id) => editor.missing.has(id)));

  let open = $state({
    basic: true,
    skin: true,
    attach: false,
    motion: false,
    physics: false,
    link: false,
    hover: false,
    actions: true,
  });
</script>

<aside class="inspector bv-glass">
  <header>
    <h3>{t('inspector.title')}</h3>
    {#if ids.length > 1}<span class="bv-muted">{t('inspector.count', { count: ids.length })}</span
      >{/if}
  </header>
  <div class="scroll">
    {#if ids.length === 0}
      <p class="nothing">{t('inspector.nothing')}</p>
    {:else}
      {#if missing}
        <div class="warn"><Icon name="warning" size={15} />{t('inspector.missingFile')}</div>
      {/if}
      <Section title={t('inspector.basic')} bind:open={open.basic}
        ><BasicSection {editor} {ids} /></Section
      >
      <Section title={t('inspector.skin')} bind:open={open.skin}
        ><SkinSection {editor} {ids} /></Section
      >
      <Section title={t('inspector.attach')} bind:open={open.attach}
        ><AttachSection {editor} {ids} /></Section
      >
      <Section title={t('inspector.motion')} bind:open={open.motion}
        ><MotionSection {editor} {ids} /></Section
      >
      <Section title={t('inspector.physics')} bind:open={open.physics}
        ><PhysicsSection {editor} {ids} /></Section
      >
      {#if hasParent}
        <Section title={t('inspector.link')} bind:open={open.link}
          ><LinkSection {editor} {ids} /></Section
        >
      {/if}
      <Section title={t('inspector.hover')} bind:open={open.hover}
        ><HoverSection {editor} {ids} /></Section
      >
      {#if allActions}
        <Section title={t('inspector.actions')} bind:open={open.actions}
          ><ActionSection {editor} {ids} /></Section
        >
      {/if}
    {/if}
  </div>
</aside>

<style>
  .inspector {
    position: absolute;
    top: 64px;
    right: 12px;
    bottom: 12px;
    width: 320px;
    z-index: 20;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--bv-border);
  }
  h3 {
    margin: 0;
    font-size: 13px;
  }
  .scroll {
    flex: 1;
    overflow: auto;
  }
  .nothing {
    padding: 12px;
    color: var(--bv-text-muted);
    line-height: 1.5;
  }
  .warn {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 8px 12px;
    padding: 8px;
    border-radius: 6px;
    color: var(--bv-warning);
    border: 1px solid var(--bv-warning);
    font-size: 12px;
  }
</style>
