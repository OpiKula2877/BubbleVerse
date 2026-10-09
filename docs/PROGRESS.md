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
- Testy (stav na konci fáze 1): 91 TS testů, 44 Rust testů. End-to-end přes skutečné jádro: Uložit → záloha → aktivace → spuštění programu.

**Ruční checklist (na 2 monitorech)**
- [ ] Okno pokryje oba monitory, UI je jen na hlavním, velikosti bublin sedí i při různém DPI.
- [ ] Vytvořit strom o 3 úrovních (main → složka → akce s cestou k programu).
- [ ] Přetáhnout bublinu z jednoho monitoru na druhý.
- [ ] Uložit, restartovat PC, po startu je BubbleVerse v tray, otevřít a kliknutím spustit program.

**Známé problémy**
- Na tomto PC je teď aktivní jen jeden monitor, takže vícemonitorové chování jsem ověřil jen výpočty a testy.
- Uživatel nemá zatím klávesovou zkratku na otevření okna (`Ctrl+Alt+B` je ve fázi 2), okno jde otevřít z tray.

## Fáze 2 – Vyhledávání: hotovo (ruční kontrola zbývá)

**Hotovo a ověřené automaticky**
- Vyhledávací engine §6: začátek jména, fuzzy záloha (`mcgui` najde „Minecraft auto gui“), diakritika, úrovně (TAB, Enter, Backspace), předchozí/další, ghost text, počítadlo, `:` globální mód s červenou cestou u duplicit, historie 50, řazení podle četnosti, hledání i ve sbalených složkách.
- `Ctrl+F` v aplikaci: zešednutí, barevné možnosti, zvýrazněná cesta, kamera na bublinu a její děti, dočasné rozbalení, návrat kamery. V edit módu Enter bublinu vybere.
- Low-level klávesový hook ve vlastním vlákně, venkovní / vnitřní platnost, přebití Windows (i potlačení menu po Alt / Win), znovupřipojení.
- Kompaktní lišta: předem vytvořené skryté okno nad vším, otevření do 15 ms (měřeno přes IPC), TAB a Enter spustí akci.
- Nastavení Zkratky: zachytávání kombinace, platnost, přebít Windows, kolize navzájem i se zkratkami Windows, zkratky ze scriptů v jednom seznamu. Volba řazení podle četnosti.
- Testy: 107 TS, 49 Rust.

**Ruční checklist**
- [ ] `Alt+Space` v jiném programu (prohlížeč) otevře lištu, nabídka okna Windows se neotevře.
- [ ] Jen klávesnicí najít a spustit akci 3 úrovně hluboko z aplikace i z lišty.
- [ ] Historie: po otevření je šedě poslední příkaz, ↑/↓ listuje, TAB vypíše, Enter spustí.
- [ ] `:` najde bublinu v jiné větvi, u stejných jmen je vidět červená cesta.
- [ ] `Ctrl+Alt+B` otevře a skryje okno aplikace.

## Fáze 3 – Tapeta: hotovo (ruční kontrola zbývá)

**Hotovo a ověřené automaticky**
- Okno tapety se vloží pod ikony. Na tomto PC (Windows 11 build 26300) je to vrstvené dítě `Progman` pod `SHELLDLL_DefView`, ověřeno výpisem oken. Starší Windows dostanou okno do `WorkerW`.
- Tapeta ukazuje uloženou verzi z domovského pohledu přes celou virtuální plochu (1920×1080 ověřeno přes CDP), nereaguje na myš, má vlastní limit FPS a spí, když je otevřené okno aplikace.
- `Ctrl+F` na ploše: hook pozná aktivní plochu, otevře lištu dole uprostřed a tapeta šedne a přibližuje podle hledání.
- Auto-pauza (celá obrazovka, maximalizované okno, úspora baterie, zamčení) vypne kreslení úplně (0 FPS).
- Záložní statická tapeta (snímek světa jako tapeta Windows) s upozorněním v nastavení, po vypnutí se vrátí původní tapeta. Volba skrytí ikon.
- Nastavení Výkon. Po ukončení aplikace se plocha vrátí do původního stavu.
- Testy: 107 TS, 52 Rust.

**Ruční checklist**
- [ ] Bubliny jsou vidět pod ikonami plochy na všech monitorech, klik na ikony funguje dál.
- [ ] `Ctrl+F` na ploše otevře pole nad ikonami, tapeta zešedne a přiblíží, Esc vrátí domovský pohled.
- [ ] Hra nebo video na celou obrazovku: ve Správci úloh má BubbleVerse ~0 % GPU.
- [ ] Vypnutí tapety v nastavení vrátí původní tapetu Windows.

## Fáze 4 – Scripty: hotovo (ruční kontrola zbývá)

**Hotovo a ověřené automaticky**
- Katalog 145 bloků (`packages/blocks/catalog.yaml`) generuje TS i Rust. Interpret v jádru má všechny kategorie a spouštěče z §5.2, běžící scripty jsou asynchronní úlohy s pojistkami z §5.4.
- Editor scriptů (Blockly) v samostatném okně nad oknem aplikace: paleta s hledáním česky i anglicky (`Ctrl+F`), víc spouštěčů na bublinu, záložka pro každý sdílený script a vlastní blok, panel Parametry / Opakované spuštění / Platnost zkratky / Proměnné, debug konzole, `Ctrl+C/V`, undo, zoom a koš. Ověřeno v aplikaci přes CDP.
- **▶ Test** spustí neuložený script hned, **⏭ Krok** po blocích, **■ Stop** zastaví scripty bubliny. Běžící blok se zvýrazní u testu i u uložených scriptů (ověřeno aktivací bubliny).
- **Uložit** v editoru jde přes okno aplikace do konceptu a uloží ho (ověřeno: změna režimu opakování se objeví v uložené verzi).
- **⇄** převede vlastní script na sdílený a zpět (hodnoty parametrů se doplní). Vlastní bloky s vstupy, úprava a smazání nepoužitého bloku.
- Nahrávání makra: hook kláves a myši, převod na bloky `napiš` / `stiskni` / `klikni` / `počkej` (testy převodu).
- Dotazy scriptů (`zeptej se`, odpočet před vypnutím) v kompaktní liště, ano/ne a výběr souboru nativně.
- Nastavení → Scripty: běžící scripty se Zastavit a globální proměnné s hodnotami. Běžící scripty v tray.
- Testy: 132 TS, 65 Rust (mimo jiné jeden sdílený script ve 30 bublinách, test běh, krokování).

**Ruční checklist**
- [ ] Sdílený script „Spustit soubor“ ve 30 bublinách: změna scriptu se projeví ve všech.
- [ ] Časovač (`každých 5 s`) běží i se zavřeným oknem aplikace.
- [ ] Venkovní zkratka ze scriptu funguje v jiném programu, vnitřní jen v BubbleVerse.
- [ ] `vyšli zprávu` spustí script s `když dostanu zprávu` v jiné bublině.
- [ ] Blok CMD vypíše výstup do proměnné, okno konzole se neukáže.
- [ ] Editor: při běhu se zvýrazní aktuální blok, Krok jde po jednom bloku.
- [ ] ⏺ Nahrát makro: psaní v Poznámkovém bloku a pár kliků vytvoří bloky, které to zopakují.
- [ ] Zavření editoru s neuloženými změnami nabídne Uložit / Zahodit / Zůstat.
