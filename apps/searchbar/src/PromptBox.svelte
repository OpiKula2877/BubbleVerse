<script lang="ts">
  import { Button, t, tk } from '@bv/ui';
  import { onDestroy } from 'svelte';
  import type { Prompt } from './prompt';

  /** A question or a countdown from a script (spec §5.2 "Bubbles & UI"). */
  let { prompt, onanswer }: { prompt: Prompt; onanswer: (value: string | null) => void } = $props();

  let answer = $state('');
  let left = $state(0);
  let timer = 0;
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    input?.focus();
  });

  $effect(() => {
    if (prompt.kind !== 'countdown') return;
    left = Math.ceil(prompt.seconds);
    clearInterval(timer);
    if (left <= 0) {
      onanswer('go');
      return;
    }
    timer = window.setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        onanswer('go');
      }
    }, 1000);
  });

  onDestroy(() => clearInterval(timer));
</script>

<div class="box bv-glass">
  {#if prompt.kind === 'ask'}
    <div class="question">{prompt.text}</div>
    <input
      bind:this={input}
      bind:value={answer}
      aria-label={prompt.text}
      onkeydown={(e) => {
        if (e.key === 'Enter') onanswer(answer);
        else if (e.key === 'Escape') onanswer(null);
      }}
    />
    <div class="hint">{t('prompt.askHint')}</div>
  {:else}
    <div class="question">
      {t('prompt.countdown', { action: tk(`prompt.action.${prompt.action}`), n: left })}
    </div>
    <div class="row">
      <Button variant="primary" onclick={() => onanswer(null)}>{t('common.cancel')}</Button>
      <Button onclick={() => onanswer('go')}>{t('prompt.now')}</Button>
    </div>
  {/if}
</div>

<style>
  .box {
    width: 100%;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--bv-dialog);
    font-size: 15px;
  }
  .question {
    font-weight: 600;
  }
  input {
    height: 36px;
    padding: 0 10px;
    border-radius: calc(var(--bv-radius) * 0.75);
    border: 1px solid var(--bv-input-border);
    background: var(--bv-input);
    outline: none;
    font-size: 15px;
  }
  input:focus {
    outline: 2px solid var(--bv-accent);
    outline-offset: -1px;
  }
  .hint {
    color: var(--bv-text-muted);
    font-size: 12px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
</style>
