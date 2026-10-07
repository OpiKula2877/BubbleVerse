# Fáze 3 – Tapeta

> Zdroj pravdy: `BubbleVerse-spec.md` §2.2, §7.4, §8.6, §11, §13 (řádek 3).
>
> **Hotovo, když:** bubliny jsou pod ikonami na všech monitorech, `Ctrl+F` na ploše funguje a při hře
> na celou obrazovku BubbleVerse nezatěžuje GPU.

| # | Úkol | Soubory | Ověření |
|---|---|---|---|
| 1 | Vložení okna pod ikony: klasická plocha (WorkerW) i „raised desktop“ ve Windows 11 24H2+ (vrstvené dítě Progman pod SHELLDLL_DefView) | `src-tauri/src/os/wallpaper.rs` | A: test nalezení vrstvy; R |
| 2 | Okno tapety: uložená verze světa z domovského pohledu, bez myši, vlastní limit FPS, spánek při otevřené aplikaci | `apps/wallpaper/**`, `src-tauri/src/app/wallpaper.rs` | A: stav `live` přes CDP; R |
| 3 | `Ctrl+F` na ploše: hook pozná plochu, lišta nad ikonami řídí zešednutí a kameru tapety | `src-tauri/src/os/hook.rs`, `apps/searchbar/**` | R |
| 4 | Auto-pauza: celá obrazovka, maximalizované okno, úspora baterie, zamčení | `src-tauri/src/os/power.rs`, `app/autopause.rs` | A: testy; R |
| 5 | Záložní statická tapeta a návrat původní tapety, skrytí ikon | `src-tauri/src/app/wallpaper.rs` | R |
| 6 | Nastavení Výkon | `apps/main/src/settings/PerformanceTab.svelte` | R |
