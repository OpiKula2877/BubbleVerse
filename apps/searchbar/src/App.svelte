<script lang="ts">
  import { SearchSession, type SearchKey, type SearchResult, type SearchView } from '@bv/search';
  import { applyTheme, getCore, SearchField, setLang, themeColors, type Settings } from '@bv/ui';
  import type { World } from '@bv/world';
  import { emit, listen } from '@tauri-apps/api/event';
  import PromptBox from './PromptBox.svelte';
  import type { Prompt } from './prompt';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { onDestroy, onMount } from 'svelte';

  /**
   * The compact search bar (spec §2.3): only the field, previous and next option and the red
   * path. The same engine as everywhere else (spec §6.1).
   */
  const core = getCore();
  let world: World | null = null;
  let settings: Settings | null = null;
  let session: SearchSession | null = null;
  let view = $state.raw<SearchView | null>(null);
  let shownAt = 0;
  let prompt = $state<Prompt | null>(null);
  /** `desktop` = opened by Ctrl+F on the desktop: the wallpaper follows the search (spec §2.2). */
  let mode: string = 'global';
  const offs: (() => void)[] = [];

  function look(s: Settings) {
    settings = s;
    const a = s.appearance;
    applyTheme(themeColors(a.theme, a.custom), {
      font: a.font,
      radius: a.radius,
      panelOpacity: a.panelOpacity,
      uiScale: a.uiScale,
    });
    setLang(s.general.language);
  }

  /**
   * Tells the wallpaper what to grey out and where to aim the camera (`overview` = the whole
   * world, for `:` mode).
   */
  function toWallpaper(focus?: string | null, overview = false) {
    if (mode !== 'desktop' || !core.isTauri) return;
    const v = view;
    // To the wallpaper, which runs in its own process (the core passes it on).
    void emit('bv://desktop-search', {
      active: !!v,
      colored: v ? [...v.colored] : [],
      path: v ? [...v.path] : [],
      current: v?.current?.item.id ?? null,
      ...(focus !== undefined ? { focus } : {}),
      ...(overview ? { overview } : {}),
    });
  }

  async function open(m: string = 'global') {
    mode = m;
    if (!world) return;
    const [history, usage] = await Promise.all([
      core.searchHistory().catch(() => [] as string[]),
      core.usageCounts().catch(() => ({}) as Record<string, number>),
    ]);
    session = new SearchSession(
      world.bubbles.map((b) => ({
        id: b.id,
        parentId: b.parentId,
        name: b.name,
        kind: b.kind,
        order: b.order,
      })),
      { history, usage, sortByUsage: settings?.search.sortByUsage ?? false },
    );
    view = session.view();
    shownAt = Date.now();
    toWallpaper();
  }

  function hide() {
    session = null;
    view = null;
    toWallpaper();
    void core.call('hide_searchbar');
  }

  async function handle(r: SearchResult) {
    if (!session) return;
    if (r.kind === 'close') return hide();
    if (r.kind === 'activate') {
      hide();
      try {
        await core.pushHistory(r.path);
        await core.activate(r.id);
      } catch (e) {
        console.error(e);
      }
      return;
    }
    view = session.view();
    toWallpaper(r.kind === 'focus' ? r.id : undefined, r.kind === 'overview');
  }

  onMount(async () => {
    const b = await core.bootstrap();
    world = b.published;
    look(b.settings);
    offs.push(
      core.on('search', (m) => void open(m)),
      core.on('world-published', (w) => (world = w)),
      core.on('settings', (s) => look(s)),
    );
    if (core.isTauri) {
      // Clicking anywhere else closes the bar.
      const un = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused && view && !prompt && Date.now() - shownAt > 300) hide();
      });
      offs.push(
        un,
        await listen<Prompt>('bv://prompt', (e) => {
          view = null;
          prompt = e.payload;
        }),
      );
    } else {
      void open();
    }
  });

  onDestroy(() => offs.forEach((o) => o()));
</script>

<main>
  {#if prompt}
    {#key prompt.id}
      <PromptBox
        {prompt}
        onanswer={(value) => {
          const id = prompt!.id;
          prompt = null;
          void core.call('prompt_answer', { id, value });
          void core.call('hide_searchbar');
        }}
      />
    {/key}
  {:else if view}
    <SearchField
      {view}
      compact
      oninput={(t) => session && void handle(session.input(t))}
      onkey={(k: SearchKey) => session && void handle(session.key(k))}
    />
  {/if}
</main>

<style>
  :global(html),
  :global(body) {
    background: transparent;
  }
  main {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 8px;
  }
</style>
