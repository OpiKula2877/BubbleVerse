# BubbleVerse

A launcher and automation tool for Windows shaped as a living world of bubbles: main bubbles,
folders and action bubbles with scripts built from blocks, reachable with the keyboard through
search, shown in an app window across all monitors and as a live desktop wallpaper.

The specification is in [`BubbleVerse-spec.md`](BubbleVerse-spec.md) (Czech); progress is tracked in
[`docs/PROGRESS.md`](docs/PROGRESS.md) and decisions in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Requirements

- Windows 10 (22H2) or 11 with the WebView2 runtime
- Visual Studio 2022 Build Tools with "Desktop development with C++"
- Rust stable (MSVC toolchain) via `rustup`
- Node.js 24+ and pnpm

## Getting started

```bash
pnpm install
pnpm gen:blocks
pnpm tauri dev
```

`pnpm tauri dev` opens the app window over all monitors. Useful switches while developing:

| Variable / URL | Effect |
|---|---|
| `BV_WINDOWED=1` | normal resizable window instead of covering every monitor |
| `BV_DEV_AUTOSTART=1` | let a development build register itself in "Start with Windows" |
| `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` | DevTools access, used by `node scripts/cdp.ts` |
| `?scene=200` / `?scene=1000` | load the performance test scene (not saved unless edited) |

Development builds keep their data in `%APPDATA%\BubbleVerse-dev`; release builds use
`%APPDATA%\BubbleVerse`.

The UI also runs in a normal browser without the Rust core (`pnpm dev`, then open
`http://localhost:1420/main/`); a mock core keeps data in `localStorage`.

## Checks

```bash
pnpm check
```

runs, in order: block catalog freshness, ESLint + Prettier, the hardcoded text/color check, TypeScript
and Svelte type checks, Vitest, `cargo fmt`, `cargo clippy -D warnings` and `cargo test`.

## Building

```bash
pnpm tauri build
```

produces the NSIS installer in `src-tauri/target/release/bundle/nsis/`.

## Repository layout

```
src-tauri/        Rust core: storage, script interpreter, Windows layer, windows and tray
packages/world    world model, motion and physics, edit operations, PixiJS renderer
packages/search   search engine (no UI)
packages/blocks   block catalog (catalog.yaml), compact script format, simple actions
packages/ui       i18n (en/cs), theme tokens, core client, shared Svelte components
apps/main         app window: user mode, edit mode, inspector, settings
apps/searchbar    compact global search bar
apps/wallpaper    desktop wallpaper
apps/script-editor  block editor (Blockly)
scripts/          block code generator, hardcoded text/color check, DevTools helper
```
