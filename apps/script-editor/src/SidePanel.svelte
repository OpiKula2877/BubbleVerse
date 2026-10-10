<script lang="ts">
  import { Button, Select, t, TextField } from '@bv/ui';
  import type { ParamType, Value } from '@bv/world';
  import { formatValue, type EditorSession } from './session.svelte';

  /** Right panel (spec §5.1) of shared scripts (parameters) and custom blocks (inputs). */
  let { s, onEditBlock }: { s: EditorSession; onEditBlock: (id: string) => void } = $props();

  const doc = $derived(s.doc);
  const customBlock = $derived(
    doc?.kind === 'custom' ? s.customBlocks.find((c) => c.id === doc.id) : undefined,
  );
  const uses = $derived(customBlock ? s.customUses(customBlock.id) : 0);

  const typeOptions: { value: ParamType; label: string }[] = [
    { value: 'text', label: t('editor.typeText') },
    { value: 'number', label: t('editor.typeNumber') },
    { value: 'bool', label: t('editor.typeBool') },
  ];

  function typed(type: ParamType, text: string): Value {
    if (type === 'number') return Number(text) || 0;
    if (type === 'bool') return text === 'true';
    return text;
  }
</script>

<!-- Only on the tab of a shared script or a custom block: what belongs to it alone. -->
<aside class="panel">
  {#if doc?.kind === 'shared'}
    <h3>{t('editor.params')}</h3>
    {#each s.panel.params as p (p.name)}
      {@const own = s.paramValue(p.name)}
      <div class="param">
        <div class="pname">{p.name}</div>
        <label>
          <span>{t('editor.paramType')}</span>
          <Select
            options={typeOptions}
            value={p.type}
            onchange={(v) =>
              s.setParam(p.name, { type: v, default: typed(v, formatValue(p.default)) })}
          />
        </label>
        <label>
          <span>{t('editor.paramDefault')}</span>
          <TextField
            value={formatValue(p.default)}
            oninput={(v) => s.setParam(p.name, { default: typed(p.type, v) })}
          />
        </label>
        <label>
          <span>{t('editor.paramValue')}</span>
          <TextField
            value={formatValue(own)}
            placeholder={formatValue(p.default)}
            oninput={(v) => s.setParamValue(p.name, v === '' ? undefined : typed(p.type, v))}
          />
        </label>
      </div>
    {/each}
    <Button small variant="danger" onclick={() => doc && s.removeShared(doc.id)}>
      {t('editor.removeShared')}
    </Button>
  {:else if doc?.kind === 'custom' && customBlock}
    <h3>{customBlock.name}</h3>
    {#each customBlock.params as p (p.name)}
      <div class="row"><span>{p.name}</span><span class="muted">{p.type}</span></div>
    {/each}
    <div class="buttons">
      <Button small onclick={() => onEditBlock(customBlock.id)}>{t('editor.editBlock')}</Button>
      <Button
        small
        variant="danger"
        disabled={uses > 0}
        title={uses > 0 ? t('editor.blockUsed', { n: uses }) : ''}
        onclick={() => s.deleteBlock(customBlock.id)}>{t('editor.deleteBlock')}</Button
      >
    </div>
  {/if}
</aside>

<style>
  .panel {
    border-left: 1px solid var(--bv-border);
    background: var(--bv-panel);
    overflow-y: auto;
    padding: 4px 12px 12px;
    font-size: 13px;
  }
  h3 {
    margin: 10px 0 8px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--bv-text-2);
  }
  .param {
    display: grid;
    gap: 4px;
    padding: 8px 0;
    border-top: 1px dashed var(--bv-border);
  }
  .param label {
    display: grid;
    grid-template-columns: 90px 1fr;
    align-items: center;
    gap: 6px;
    color: var(--bv-text-2);
    font-size: 12px;
  }
  .pname {
    font-weight: 600;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
  }
  .muted {
    color: var(--bv-text-muted);
    font-size: 12px;
  }
  .buttons {
    display: flex;
    gap: 6px;
    margin: 8px 0;
  }
</style>
