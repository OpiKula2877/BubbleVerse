<script lang="ts">
  import { Button, Modal, Select, t, TextField } from '@bv/ui';
  import type { ParamDef, ParamType } from '@bv/world';

  /** Make or edit a custom block: name and inputs (spec §5.2 "Define block"). */
  let {
    name: initialName,
    params: initialParams,
    editing,
    onsave,
    oncancel,
  }: {
    name: string;
    params: ParamDef[];
    editing: boolean;
    onsave: (name: string, params: ParamDef[]) => void;
    oncancel: () => void;
  } = $props();

  // Edited copies; the dialog is created anew for every block.
  // svelte-ignore state_referenced_locally
  let name = $state(initialName);
  // svelte-ignore state_referenced_locally
  let params = $state<ParamDef[]>(initialParams.map((p) => ({ ...p })));

  const types: { value: ParamType; label: string }[] = [
    { value: 'number', label: t('editor.typeNumber') },
    { value: 'text', label: t('editor.typeText') },
    { value: 'bool', label: t('editor.typeBool') },
  ];

  const names = $derived(params.map((p) => p.name.trim()));
  const valid = $derived(
    name.trim() !== '' && names.every((n, i) => n !== '' && names.indexOf(n) === i),
  );

  function save() {
    if (!valid) return;
    onsave(
      name.trim(),
      params.map((p) => ({ ...p, name: p.name.trim() })),
    );
  }

  function defaultFor(type: ParamType) {
    return type === 'number' ? 0 : type === 'bool' ? false : '';
  }
</script>

<Modal
  title={editing ? t('editor.blockDialogEdit') : t('editor.blockDialogNew')}
  width={460}
  onclose={oncancel}
>
  <label class="field">
    <span>{t('editor.blockName')}</span>
    <TextField value={name} autofocus oninput={(v) => (name = v)} onenter={save} />
  </label>
  <div class="inputs">
    <span class="label">{t('editor.blockInputs')}</span>
    {#each params as p, i (i)}
      <div class="input">
        <TextField
          value={p.name}
          placeholder={t('editor.inputName')}
          oninput={(v) => (params[i] = { ...p, name: v })}
        />
        <Select
          options={types}
          value={p.type}
          onchange={(v) => (params[i] = { ...p, type: v, default: defaultFor(v) })}
        />
        <Button small icon="trash" title={t('common.remove')} onclick={() => params.splice(i, 1)} />
      </div>
    {/each}
    <Button
      small
      icon="plus"
      onclick={() => params.push({ name: `x${params.length + 1}`, type: 'number', default: 0 })}
      >{t('editor.addInput')}</Button
    >
  </div>
  {#snippet actions()}
    <Button variant="primary" disabled={!valid} onclick={save}>
      {editing ? t('common.apply') : t('common.create')}
    </Button>
    <Button onclick={oncancel}>{t('common.cancel')}</Button>
  {/snippet}
</Modal>

<style>
  .field {
    display: grid;
    gap: 4px;
    margin-bottom: 12px;
    color: var(--bv-text-2);
    font-size: 12px;
  }
  .inputs {
    display: grid;
    gap: 6px;
  }
  .label {
    color: var(--bv-text-2);
    font-size: 12px;
  }
  .input {
    display: grid;
    grid-template-columns: 1fr 110px auto;
    gap: 6px;
    align-items: center;
  }
</style>
