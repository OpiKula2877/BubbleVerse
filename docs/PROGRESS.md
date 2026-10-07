# Průběh

## Fáze 1 – Základ + launcher: hotovo (ruční kontrola zbývá)

**Hotovo a ověřené automaticky**
- Monorepo (pnpm, Vite, Svelte 5, TS strict, ESLint, Prettier, Vitest), Tauri 2, kontrola natvrdo zapsaných textů a barev.
- Model světa §9.1, strom, dědění skinu s přepisy, pohyb jako funkce času, fyzika, undo/redo (200 kroků), kopírování větví, mřížka a vodicí čáry, výběr.
- Katalog bloků (145 bloků) s generátorem TS + Rust. Jednoduché akce „Spustit soubor / Otevřít URL“ jako sdílené scripty.
- Rust jádro: SQLite (WAL), MessagePack + zstd, koncept / uložená verze v jedné transakci, zálohy, assety (WebP), nastavení, migrace.
- Interpret scriptů: async úlohy, režimy opakovaného spuštění, zastavení, pojistka proti zamrznutí, proměnné, seznamy, vlastní bloky, spouštění souborů a URL.
- Tray, autostart (registr HKCU\…\Run), jedna instance, protokol `bvasset://`, okno přes všechny monitory s pevným `RasterizationScale`.
- Renderer PixiJS: výřez kamery pro každý monitor, nekonečné plátno, tvary, gradienty, obrys, stín, obrázek / ikona, jména, přímka, rozbalení se animací, neuron efekt, klid = 0 FPS, ukazatel FPS, testovací scéna 200 / 1000 bublin.
- Uživatelský mód (klik = aktivace / rozbalení, kolečko = zoom, tažení = posun, `Home`), 👁 přepínače.
- Edit mód: lišta, strom (hledání, tažení = rodič / pořadí), inspektor (Základ, Skin, Uchycení, Pohyb, Fyzika, Spojení, Hover, Akce; více bublin = „—“), kontextová menu, rychlé okénko, výběr (klik, Ctrl/Shift, obdélník, Ctrl+A), přesun s mřížkou, Alt + tažení = změna rodiče, autosave 2 s, Ctrl+S, odchod z edit módu, obnova konceptu po restartu.
- Nastavení: Obecné, Vzhled (Světlý / Tmavý).
- Testy: 97 TS testů, 44 Rust testů. End-to-end přes skutečné jádro: Uložit → záloha → aktivace → spuštění programu.

**Ruční checklist (na 2 monitorech)**
- [ ] Okno pokryje oba monitory, UI je jen na hlavním, velikosti bublin sedí i při různém DPI.
- [ ] Vytvořit strom o 3 úrovních (main → složka → akce s cestou k programu).
- [ ] Přetáhnout bublinu z jednoho monitoru na druhý.
- [ ] Uložit, restartovat PC, po startu je BubbleVerse v tray, otevřít a kliknutím spustit program.

**Známé problémy**
- Na tomto PC je teď aktivní jen jeden monitor, takže vícemonitorové chování jsem ověřil jen výpočty a testy.
- Uživatel nemá zatím klávesovou zkratku na otevření okna (`Ctrl+Alt+B` je ve fázi 2), okno jde otevřít z tray.
