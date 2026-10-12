# Fáze 7 – Dokončení a vydání

> Zdroj pravdy: `BubbleVerse-spec.md` §7.2, §7.6, §7.7, §12, §13 (řádek 7), §15, §16.
>
> **Hotovo, když:** čistá instalace na Windows 10 i 11 projde checklistem z §12.

| # | Úkol | Soubory | Ověření |
|---|---|---|---|
| 1 | Vzhled: OpiKula style, vlastní theme s editorem tokenů a živým náhledem, `.bvtheme`, scale GUI, písmo, zaoblení, průhlednost | `apps/main/src/settings/AppearanceTab.svelte`, `packages/ui/src/theme/**` | A: testy formátu; R |
| 2 | Pozadí světa: barva, gradient, obrázek, video, tapeta Windows, hvězdy, paralaxa, mřížka, zvlášť pro tapetu | `packages/world/src/render/background.ts`, `BackgroundTab.svelte` | R přes CDP |
| 3 | Zvuky: UI a aktivace, hlasitost, vlastní zvuky, ztlumení při hře | `packages/ui/src/sound.ts`, `SoundsTab.svelte` | R |
| 4 | Instalátor NSIS, asociace `.bubble`, auto-update z GitHub Releases s klíčem updateru, CI a release workflow s SHA-256 | `src-tauri/tauri.conf.json`, `.github/workflows/**` | R: release build |
| 5 | Výkonové testy a E2E (tauri-driver + WebdriverIO) | `scripts/perf.ts`, `e2e/**` | A |
| 6 | Ruční checklist, README, dokumentace | `docs/**`, `README.md` | – |

A = automatický test, R = ruční ověření v aplikaci.
