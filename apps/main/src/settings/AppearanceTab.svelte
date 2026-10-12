<script lang="ts">
  import {
    Button,
    ColorField,
    Field,
    NumberField,
    parseTheme,
    Section,
    Segmented,
    Select,
    serializeTheme,
    t,
    themeColors,
    tk,
    type Settings,
    type ThemeColors,
    type Token,
  } from '@bv/ui';
  import { store } from '../lib/store.svelte';

  /** Settings → Appearance (spec §7.2). */
  const a = $derived(store.settings.appearance);
  const colors = $derived(themeColors(a.theme, a.custom));

  const FONTS = [
    'Segoe UI Variable Text, Segoe UI, sans-serif',
    'Segoe UI, sans-serif',
    'Bahnschrift, Segoe UI, sans-serif',
    'Cascadia Code, Consolas, monospace',
    'Georgia, serif',
  ];
  const FILTERS = [{ name: t('theme.fileType'), extensions: ['bvtheme'] }];

  /** Tokens grouped as in spec §7.2. */
  const GROUPS: [string, Token[]][] = [
    ['surfaces', ['bg', 'panel', 'bar', 'dialog']],
    ['text', ['text', 'text-2', 'text-muted', 'accent', 'accent-text']],
    [
      'controls',
      ['border', 'input', 'input-border', 'button', 'button-hover', 'button-active', 'button-text'],
    ],
    ['search', ['search-dim', 'ghost', 'red-path']],
    ['edit', ['selection', 'grid', 'guide', 'highlight']],
    ['states', ['error', 'warning', 'success']],
    ['other', ['tooltip', 'tooltip-text', 'scrollbar']],
  ];

  function set(patch: Partial<Settings['appearance']>) {
    void store.saveSettings({ ...store.settings, appearance: { ...a, ...patch } });
  }

  /** Switching to Custom starts from the colors on screen. */
  function setTheme(theme: Settings['appearance']['theme']) {
    if (theme === 'custom' && a.theme !== 'custom') set({ theme, custom: { ...colors } });
    else set({ theme });
  }

  function setColor(token: Token, value: string) {
    set({ theme: 'custom', custom: { ...colors, [token]: value } });
  }

  async function exportTheme() {
    const path = await store.core.saveFile('BubbleVerse.bvtheme', FILTERS);
    if (!path) return;
    try {
      await store.core.call('write_theme_file', {
        path,
        text: serializeTheme('BubbleVerse', colors),
      });
      store.notify(t('theme.exported'));
    } catch (e) {
      store.error(e);
    }
  }

  async function importTheme() {
    const path = await store.core.pickFile(FILTERS);
    if (!path) return;
    try {
      const parsed = parseTheme(await store.core.call<string>('read_theme_file', { path }));
      if (!parsed) {
        store.notify(t('error.themeFile'), true);
        return;
      }
      set({ theme: 'custom', custom: { ...themeColors('dark'), ...parsed.colors } as ThemeColors });
      store.notify(t('theme.imported'));
    } catch (e) {
      store.error(e);
    }
  }
</script>

<Field label={t('settings.theme')}>
  <Segmented
    value={a.theme}
    options={[
      { value: 'light', label: t('settings.theme.light') },
      { value: 'dark', label: t('settings.theme.dark') },
      { value: 'opikula', label: t('settings.theme.opikula') },
      { value: 'custom', label: t('settings.theme.custom') },
    ]}
    onchange={setTheme}
  />
</Field>
<Field label={t('appearance.scale')}>
  <NumberField
    value={a.uiScale}
    min={50}
    max={200}
    step={10}
    suffix="%"
    onchange={(v) => set({ uiScale: Math.min(200, Math.max(50, v)) })}
  />
</Field>
<Field label={t('appearance.font')}>
  <Select
    value={FONTS.includes(a.font) ? a.font : FONTS[0]!}
    options={FONTS.map((f) => ({ value: f, label: f.split(',')[0]! }))}
    onchange={(v) => set({ font: v })}
  />
</Field>
<Field label={t('appearance.radius')}>
  <NumberField
    value={a.radius}
    min={0}
    max={24}
    suffix="px"
    onchange={(v) => set({ radius: Math.min(24, Math.max(0, v)) })}
  />
</Field>
<Field label={t('appearance.panelOpacity')}>
  <NumberField
    value={Math.round(a.panelOpacity * 100)}
    min={40}
    max={100}
    step={5}
    suffix="%"
    onchange={(v) => set({ panelOpacity: Math.min(100, Math.max(40, v)) / 100 })}
  />
</Field>

<Section title={t('appearance.colors')}>
  <p class="bv-muted hint">{t('appearance.colorsHint')}</p>
  <div class="actions">
    <Button small icon="download" onclick={() => void exportTheme()}>{t('theme.export')}</Button>
    <Button small icon="upload" onclick={() => void importTheme()}>{t('theme.import')}</Button>
  </div>
  <div class="preview" aria-hidden="true">
    <div class="p-panel">
      <span class="p-title">{t('appearance.preview')}</span>
      <span class="p-muted">{t('appearance.previewText')}</span>
      <div class="p-row">
        <span class="p-btn">{t('common.cancel')}</span>
        <span class="p-btn p-primary">{t('common.ok')}</span>
        <span class="p-input">{t('app.name')}</span>
      </div>
    </div>
  </div>
  {#each GROUPS as [group, tokens] (group)}
    <h4>{tk(`theme.group.${group}`)}</h4>
    {#each tokens as token (token)}
      <Field label={tk(`theme.token.${token}`)}>
        <ColorField value={colors[token]} onchange={(v) => setColor(token, v)} />
      </Field>
    {/each}
  {/each}
</Section>

<style>
  .hint {
    margin: 0 0 8px;
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  h4 {
    margin: 14px 0 4px;
    font-size: 12px;
    color: var(--bv-text-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .preview {
    padding: 14px;
    border-radius: var(--bv-radius);
    background: var(--bv-bg);
    border: 1px solid var(--bv-border);
  }
  .p-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border-radius: var(--bv-radius);
    background: var(--bv-panel);
  }
  .p-title {
    color: var(--bv-text);
    font-weight: 600;
  }
  .p-muted {
    color: var(--bv-text-muted);
    font-size: 12px;
  }
  .p-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .p-btn {
    padding: 4px 12px;
    border-radius: calc(var(--bv-radius) * 0.75);
    background: var(--bv-button);
    color: var(--bv-button-text);
    font-size: 13px;
  }
  .p-primary {
    background: var(--bv-accent);
    color: var(--bv-accent-text);
  }
  .p-input {
    padding: 4px 10px;
    border-radius: calc(var(--bv-radius) * 0.75);
    border: 1px solid var(--bv-input-border);
    background: var(--bv-input);
    color: var(--bv-text);
    font-size: 13px;
  }
</style>
