<script lang="ts">
  import type { BlockHelpView, InputKind } from '@bv/blocks';
  import { Button, Icon, Modal, t, type MessageKey } from '@bv/ui';

  /** The help of one block (the ? on a block): what it does and what goes into each input. */
  let { help, onclose }: { help: BlockHelpView; onclose: () => void } = $props();

  const kindKey: Record<InputKind, MessageKey> = {
    value: 'help.kind.value',
    condition: 'help.kind.condition',
    field: 'help.kind.field',
    menu: 'help.kind.menu',
    check: 'help.kind.check',
    days: 'help.kind.days',
    var: 'help.kind.var',
    keys: 'help.kind.keys',
    stack: 'help.kind.stack',
  };
  /** Inputs whose list of fitting blocks is open. */
  let open = $state<Record<string, boolean>>({});
</script>

<Modal title={t('help.title')} width={560} {onclose}>
  <div class="help">
    <div class="cat">
      <span class="dot" style:background={help.category.colour}></span>
      {help.category.name}
    </div>
    <div class="block" class:hat={help.shape === 'hat'} style:--c={help.category.colour}>
      {help.title}
    </div>
    {#if help.danger}
      <p class="danger"><Icon name="warning" size={14} />{t('help.danger')}</p>
    {/if}
    <p class="text">{help.text}</p>

    {#each help.inputs as input (input.name)}
      <section class="input">
        <div class="head">
          <span class="num" style:--c={help.category.colour}>{'①②③④⑤⑥⑦⑧⑨⑩'[input.n - 1]}</span>
          <span class="kind">{t(kindKey[input.kind])}</span>
        </div>
        <p class="hint">{input.hint}</p>
        {#if input.options}
          <div class="chips">
            {#each input.options as o, i (i)}<span class="chip">{o}</span>{/each}
          </div>
        {/if}
        {#if input.fits.length}
          <button
            type="button"
            class="toggle"
            onclick={() => (open[input.name] = !open[input.name])}
          >
            <Icon name={open[input.name] ? 'chevronDown' : 'chevronRight'} size={12} />
            {t('help.fits', { n: input.fits.reduce((a, f) => a + f.blocks.length, 0) })}
          </button>
          {#if open[input.name]}
            <div class="fits">
              {#each input.fits as f (f.category)}
                <div class="group">
                  <span class="gname">{f.category}</span>
                  <div class="chips">
                    {#each f.blocks as b, i (i)}
                      <span
                        class="chip reporter"
                        class:bool={input.kind === 'condition'}
                        style:--c={f.colour}>{b}</span
                      >
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </section>
    {/each}
  </div>
  {#snippet actions()}
    <Button variant="primary" onclick={onclose}>{t('common.close')}</Button>
  {/snippet}
</Modal>

<style>
  .help {
    display: grid;
    gap: 10px;
    max-height: min(70vh, 640px);
    overflow-y: auto;
    padding-right: 4px;
  }
  .cat {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--bv-text-2);
    font-size: 12px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .block {
    justify-self: start;
    padding: 8px 14px;
    border-radius: 6px;
    background: var(--c);
    color: var(--bv-accent-text);
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .block.hat {
    border-radius: 18px 18px 6px 6px;
  }
  .danger {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 0;
    color: var(--bv-warning);
    font-size: 12px;
  }
  .text {
    margin: 0;
    line-height: 1.45;
  }
  .input {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--bv-border);
    border-radius: calc(var(--bv-radius) * 0.75);
    background: color-mix(in srgb, var(--bv-panel) 70%, transparent);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .num {
    color: var(--c);
    font-size: 18px;
    line-height: 1;
  }
  .kind {
    font-weight: 600;
    font-size: 12px;
    color: var(--bv-text-2);
  }
  .hint {
    margin: 0;
    line-height: 1.4;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    padding: 2px 8px;
    border-radius: 10px;
    border: 1px solid var(--bv-border);
    font-size: 12px;
  }
  .chip.reporter {
    border: none;
    background: var(--c);
    color: var(--bv-accent-text);
  }
  .chip.bool {
    border-radius: 4px;
    clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0 50%);
    padding: 2px 12px;
  }
  .toggle {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: none;
    padding: 0;
    color: var(--bv-accent);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .fits {
    display: grid;
    gap: 8px;
  }
  .gname {
    display: block;
    margin-bottom: 3px;
    color: var(--bv-text-muted);
    font-size: 11px;
  }
</style>
