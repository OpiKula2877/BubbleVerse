# Fáze 4 – Scripty

> Zdroj pravdy: `BubbleVerse-spec.md` §5, §8.4, §9.3, §12, §13 (řádek 4).
>
> **Hotovo, když:** sdílený script pro 30 bublin, časovač, venkovní a vnitřní zkratka, broadcast i CMD
> blok fungují. Debug ukazuje běžící blok.

Hotové už během fáze 3: katalog bloků (`packages/blocks/catalog.yaml`, generuje TS i Rust), interpret
v Rustu se všemi kategoriemi, spouštěče ze systému, převod Blockly ↔ zhuštěný formát, toolbox
a hledání bloků, dotazy scriptů v kompaktní liště.

| # | Úkol | Soubory | Ověření |
|---|---|---|---|
| 1 | Test běh scriptu z editoru (i neuloženého), krokování, vlastní bloky z editoru, konec úlohy pro debug | `src-tauri/src/script/runtime.rs`, `exec.rs` | A: testy runtime |
| 2 | Okno editoru: otevření pro bublinu, rozmístění bloků (`script_layouts`), příkazy pro test/krok/stop | `src-tauri/src/app/editor.rs` | R |
| 3 | Nahrávání makra: klávesy a kliky myši s pauzami, převod na bloky | `src-tauri/src/os/recorder.rs`, `packages/blocks/src/macro.ts` | A: testy převodu; R |
| 4 | Pomocné funkce: sdílený ↔ vlastní script, parametry, použité proměnné, uložení do světa | `packages/blocks/src/editing.ts` | A: testy |
| 5 | Editor scriptů (Blockly): paleta s hledáním, víc spouštěčů, panel Parametry / Opakované spuštění / Platnost zkratky / Proměnné, debug konzole, ⇄, vlastní bloky, `Ctrl+F` | `apps/script-editor/**` | R přes CDP |
| 6 | Hlavní okno: předání konceptu editoru, uložení scriptů z editoru do konceptu a Uložit | `apps/main/src/**` | R |
| 7 | Nastavení → Scripty: běžící scripty se Zastavit, globální proměnné s hodnotami; běžící scripty v tray | `apps/main/src/settings/ScriptsTab.svelte`, `src-tauri/src/app/tray.rs` | R |
| 8 | Dokumentace, ruční checklist | `docs/**` | – |

A = automatický test, R = ruční ověření v aplikaci.
