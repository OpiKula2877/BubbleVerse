# Fáze 5 – Hromadně a sdílení

> Zdroj pravdy: `BubbleVerse-spec.md` §3.2 (auto-ikona), §4.2, §4.5 (šablony), §4.6, §7.5, §9.4, §13 (řádek 5).
>
> **Hotovo, když:** přetažením 30 `.exe` vznikne 30 bublin s ikonami a jmény. Větev exportovaná na jiném
> PC se importuje s varováním a opravou cest.

| # | Úkol | Soubory | Ověření |
|---|---|---|---|
| 1 | Logika generátoru: jména ze šablony, rozložení (kruh, mřížka, spirála), bubliny se sdíleným scriptem, vzhled | `packages/world/src/edit/generator.ts` | A: testy |
| 2 | Zdroje v jádru: složka s filtrem, Start menu + Microsoft Store, Steam, Epic | `src-tauri/src/os/apps.rs`, `app/generator.rs` | A: testy parserů; R |
| 3 | Auto-ikony: ikona souboru / zástupce / Store aplikace, Steam, Epic, favicon webu | `src-tauri/src/os/icons.rs` | A: test parseru HTML; R |
| 4 | Okno generátoru: zdroje, nastavení, náhled s ikonami, Vytvořit jako jeden krok Undo; drag & drop souborů na složku | `apps/main/src/generator/**` | R přes CDP |
| 5 | Šablony: Uložit jako šablonu, Použít šablonu, šablona v rychlém vytvoření a v generátoru | `packages/world/src/edit/templates.ts`, `apps/main/src/edit/**` | A: testy; R |
| 6 | `.bubble`: export větve / světa, import s náhledem (strom, ⚠ bloky, chybějící cesty s najít a nahradit, kam vložit), přečíslování id, bez zdvojení | `packages/world/src/edit/package.ts`, `src-tauri/src/storage/package.rs`, `apps/main/src/dialogs/ImportDialog.svelte` | A: testy; R |
| 7 | Nastavení → Data: umístění dat, zálohy, obnova, export/import světa, úklid assetů a velikost dat | `apps/main/src/settings/DataTab.svelte` | R |
| 8 | Dokumentace, ruční checklist | `docs/**` | – |

A = automatický test, R = ruční ověření v aplikaci.
