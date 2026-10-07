# Fáze 1 – Základ + launcher

> Zdroj pravdy: `BubbleVerse-spec.md` §13 (řádek 1). Uživatel 2026-10-07 rozhodl stavět fáze bez čekání na schválení.
>
> **Hotovo, když:** na 2 monitorech jde vytvořit strom o 3 úrovních, přetáhnout bublinu mezi monitory,
> uložit, restartovat PC a po startu kliknutím spustit program.

Ověření: **A** = automaticky (test / build / lint), **R** = ruční kontrola (checklist v `docs/PROGRESS.md`).

| # | Úkol | Soubory | Ověření |
|---|---|---|---|
| 1 | Monorepo: pnpm workspaces, TS strict, ESLint, Prettier, Vitest, Vite (jedna konfigurace pro všechna okna) | `/package.json`, `/vite.config.ts`, `/tsconfig.json`, … | A: `pnpm lint`, `pnpm typecheck` |
| 2 | Tauri 2 kostra, chybový typ `AppError`, moduly `app/ storage/ script/ os/` | `src-tauri/**` | A: `cargo clippy -D warnings` |
| 3 | i18n (`en.json`, `cs.json`, `t()`), theme tokeny (Světlý, Tmavý), kontrola natvrdo zapsaných textů a barev | `packages/ui/src/{i18n,theme}`, `scripts/check-hardcoded.ts` | A: testy klíčů a tokenů |
| 4 | Model světa §9.1: typy, výchozí hodnoty, ULID, strom (cesty, cykly), dědění skinu, pozice ve světě | `packages/world/src/model/**`, `sim/position.ts` | A: unit testy (TDD) |
| 5 | Edit operace: undo/redo 200 kroků, kopírovat/vložit/duplikovat větve, skin, mřížka + vodicí čáry, výběr | `packages/world/src/edit/**` | A: unit testy (TDD) |
| 6 | Katalog bloků (`catalog.yaml`) + generátor TS/Rust; jednoduchá akce „Spustit soubor / Otevřít URL“ ve zhuštěném formátu | `packages/blocks/**`, `scripts/gen-blocks.ts`, `src-tauri/src/script/generated/` | A: testy generátoru a formátu |
| 7 | Úložiště v Rustu: SQLite WAL, MessagePack + zstd, koncept/uložená verze v jedné transakci, zálohy, assety podle otisku (WebP), nastavení, migrace | `src-tauri/src/storage/**` | A: `cargo test` |
| 8 | Jádro: stav, IPC příkazy, tray, autostart, spuštění souboru/URL, kontrola cest, jedna instance | `src-tauri/src/app/**`, `os/launch.rs` | A: testy; R: tray, autostart |
| 9 | Okno přes všechny monitory: výčet monitorů, okno přes virtuální plochu, pevné `RasterizationScale`, přes hlavní panel | `src-tauri/src/os/{monitors,window_span}.rs` | R: 1–2 monitory |
| 10 | Renderer PixiJS: kamera + výřez pro každý monitor, nekonečné plátno, bublina (kruh, barva, ikona/obrázek, jméno), přímka, rozbalení/sbalení s animací, klid = 0 FPS, generátor testovací scény + FPS | `packages/world/src/render/**`, `dev/**` | A: testy přepočtů; R |
| 11 | Uživatelský mód: klik = aktivace / rozbalení, 👁 přepínače, `Home` | `apps/main/src/user/**` | R |
| 12 | Edit mód: lišta, strom, inspektor, kontextové menu, rychlé okénko, výběr a přesun (i mezi monitory), `Alt` + tažení = změna rodiče, autosave 2 s, `Ctrl+S`, odchod z edit módu, obnova konceptu | `apps/main/src/edit/**` | R |
| 13 | Nastavení: Obecné + Vzhled (Světlý / Tmavý) | `apps/main/src/settings/**` | R |
| 14 | Uzavření: `pnpm check`, `pnpm tauri build`, README, PROGRESS | `docs/**` | A |
