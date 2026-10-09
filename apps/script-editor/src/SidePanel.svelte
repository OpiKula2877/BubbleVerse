<script lang="ts">
  import { Button, getCore, Segmented, Select, t, TextField, type MessageKey } from '@bv/ui';
  import type { ParamType, RunMode, Value } from '@bv/world';
  import { formatValue, type EditorSession } from './session.svelte';

  /** Right panel (spec §5.1): parameters, run mode, shortcut scope, variables. */
  let { s, onEditBlock }: { s: EditorSession; onEditBlock: (id: string) => void } = $props();

  const core = getCore();
  const doc = $derived(s.doc);
  const hat = $derived(s.panel.hat);
  const customBlock = $derived(
    doc?.kind === 'custom' ? s.customBlocks.find((c) => c.id === doc.id) : undefined,
  );
  const uses = $derived(customBlock ? s.customUses(customBlock.id) : 0);

  const typeOptions: { value: ParamType; label: string }[] = [
    { value: 'text', label: t('editor.typeText') },
    { value: 'number', label: t('editor.typeNumber') },
    { value: 'bool', label: t('editor.typeBool') },
  ];
  const runModes: { value: RunMode; label: string }[] = [
    { value: 'ignore', label: t('editor.runIgnore') },
    { value: 'restart', label: t('editor.runRestart') },
    { value: 'parallel', label: t('editor.runParallel') },
  ];
  const scopes = [
    { value: 'global', label: t('editor.scopeGlobal') },
    { value: 'app', label: t('editor.scopeApp') },
  ];
  const scopeKey: Record<string, MessageKey> = {
    s: 'editor.scopeS',
    b: 'editor.scopeB',
    g: 'editor.scopeG',
  };

  function typed(type: ParamType, text: string): Value {
    if (type === 'number') return Number(text) || 0;
    if (type === 'bool') return text === 'true';
    return text;
  }
</script>

<aside class="panel">
  <section>
    <h3>{t('editor.params')}</h3>
    {#if doc?.kind === 'shared'}
      <p class="hint">{t('editor.sharedInfo')}</p>
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
      {:else}
        <p class="hint">{t('editor.paramsNone')}</p>
      {/each}
      <Button small variant="danger" onclick={() => doc && s.removeShared(doc.id)}>
        {t('editor.removeShared')}
      </Button>
    {:else if doc?.kind === 'custom' && customBlock}
      <div class="pname">{customBlock.name}</div>
      {#each customBlock.params as p (p.name)}
        <div class="row"><span>{p.name}</span><span class="muted">{p.type}</span></div>
      {:else}
        <p class="hint">{t('editor.blockNoInputs')}</p>
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
      {#if uses > 0}<p class="hint">{t('editor.blockUsed', { n: uses })}</p>{/if}
    {:else}
      <p class="hint">{t('editor.paramsInlineHint')}</p>
    {/if}
  </section>

  {#if doc?.kind !== 'custom'}
    <section>
      <h3>{t('editor.runMode')}</h3>
      {#if hat}
        <Segmented options={runModes} value={hat.runMode} onchange={(v) => s.setRunMode(v)} />
      {:else}
        <p class="hint">{t('editor.noScript')}</p>
      {/if}
    </section>

    <section>
      <h3>{t('editor.scope')}</h3>
      {#if hat?.scope}
        <Segmented options={scopes} value={hat.scope} onchange={(v) => s.setScope(v)} />
      {:else}
        <p class="hint">{t('editor.scopeHint')}</p>
      {/if}
    </section>
  {/if}

  <section>
    <h3>
      {t('editor.variables')}
      <button type="button" class="link" onclick={() => void s.refreshValues()}
        >{t('editor.refresh')}</button
      >
    </h3>
    {#each s.panel.vars as v (`${v.scope}:${v.name}`)}
      <div class="var">
        <span class="vname">{v.name}</span>
        <span class="muted">{t(scopeKey[v.scope]!)}</span>
        {#if v.scope === 's'}
          <span class="muted value">{t('editor.varRunOnly')}</span>
        {:else}
          <input
            class="value"
            value={formatValue(s.values[v.scope][v.name])}
            aria-label={v.name}
            onchange={(e) =>
              void s.setVariable(v.scope as 'b' | 'g', v.name, e.currentTarget.value)}
          />
        {/if}
      </div>
    {:else}
      <p class="hint">{t('editor.varsNone')}</p>
    {/each}
    <button
      type="button"
      class="link"
      onclick={() => void core.call('open_settings', { tab: 'scripts' })}
    >
      {t('editor.allGlobals')}
    </button>
  </section>
</aside>

<style>
  .panel {
    border-left: 1px solid var(--bv-border);
    background: var(--bv-panel);
    overflow-y: auto;
    padding: 4px 12px 12px;
    font-size: 13px;
  }
  section {
    padding: 10px 0;
    border-bottom: 1px solid var(--bv-border);
  }
  h3 {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--bv-text-2);
  }
  .hint {
    margin: 0 0 8px;
    color: var(--bv-text-muted);
    font-size: 12px;
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
  .pname,
  .vname {
    font-weight: 600;
  }
  .row,
  .var {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
  }
  .muted {
    color: var(--bv-text-muted);
    font-size: 12px;
  }
  .value {
    margin-left: auto;
    max-width: 120px;
  }
  input.value {
    height: 24px;
    padding: 0 6px;
    border-radius: calc(var(--bv-radius) * 0.5);
    border: 1px solid var(--bv-input-border);
    background: var(--bv-input);
    color: var(--bv-text);
    font: inherit;
    font-size: 12px;
  }
  .buttons {
    display: flex;
    gap: 6px;
    margin: 8px 0;
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--bv-accent);
    font: inherit;
    font-size: 12px;
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
  }
</style>
