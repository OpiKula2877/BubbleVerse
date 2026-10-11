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
- [x] Okno pokryje oba monitory, UI je jen na hlavním, velikosti bublin sedí i při různém DPI (ověřeno 2026-10-10 na 2 monitorech 125 % + 100 %).
- [ ] Vytvořit strom o 3 úrovních (main → složka → akce s cestou k programu).
- [x] Přetáhnout bublinu z jednoho monitoru na druhý (ověřeno 2026-10-10, bublina skončí přesně pod kurzorem).
- [ ] Uložit, restartovat PC, po startu je BubbleVerse v tray, otevřít a kliknutím spustit program.

**Známé problémy**
- Vícemonitorové chování je ověřené na 2 monitorech se stejným rozlišením a různým DPI; 3 monitory a odpojení za běhu zbývají (viz [`CHECKLIST.md`](CHECKLIST.md)).
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

## Fáze 5 – Hromadně a sdílení: hotovo (ruční kontrola zbývá)

**Hotovo a ověřené automaticky**
- Hromadný generátor se 4 zdroji: soubory (i přetažené z Průzkumníku na složku), složka s filtrem přípon a podsložkami, Start menu + Microsoft Store + Steam + Epic, seznam webů. Jméno ze šablony s předponou a příponou, vestavěný nebo jiný sdílený script, vzhled (auto-ikona, dědit, šablona), rozložení kruh / mřížka / spirála, náhled s ikonami, Vytvořit jako jeden krok Undo. Ověřeno v aplikaci (3 `.exe` → 3 bubliny s ikonami kolem složky; drop na složku otevře generátor pro ni).
- Auto-ikony: ikona souboru, zástupce a Store aplikace (Shell, 256 px), Steam, Epic a favicon webu. Na tomto PC: 115 zástupců ve Start menu, 38 Store aplikací, Steam a Epic nejsou nainstalované.
- Šablony: Uložit jako šablonu, Použít šablonu na vybrané bubliny, šablona v rychlém vytvoření a v generátoru.
- Export větve (pravé tlačítko → Exportovat…) a celého světa do `.bubble`. Import s náhledem: strom, ⚠ nebezpečné bloky z obsahu scriptů, chybějící cesty s najít a nahradit, kam vložit. Ověřeno v aplikaci (export → import s nahrazením `C:\nope` → `C:\Windows`).
- Nastavení → Data a zálohy: umístění dat (otevřít, přesunout), počet záloh a obnova, export a import světa, velikost dat a úklid nepoužitých assetů.
- Testy: 150 TS, 73 Rust.

**Ruční checklist**
- [ ] Přetáhnout 30 `.exe` z Průzkumníku na složku-bublinu: Enter vytvoří 30 bublin s ikonami a jmény, Undo je vrátí najednou.
- [ ] Generátor: zdroj Steam / Epic na PC s nainstalovanými hrami, hra se spustí kliknutím.
- [ ] Web s faviconou: bublina má ikonu webu.
- [ ] Exportovat větev, na jiném PC (nebo v jiném uživateli Windows) importovat: varování u nebezpečných bloků, oprava cest přes najít a nahradit.
- [ ] Data → Přesunout… do prázdné složky: aplikace se restartuje a data jsou na novém místě.

## Fáze 6 – Pohyb a efekty: hotovo (ruční kontrola zbývá)

**Hotovo a ověřené automaticky**
- Všechna spojení z §3.7: přímka, blesk (~20× za sekundu nový tvar), lano a řetěz (prověšené, houpou se), tok částic (tečky / čárky), laser s glow. Efekty okraje: obrys, glow, stín, sklo, částice. Tvary: kruh, zaoblený čtverec, hexagon, hvězda, maska. Ověřeno scénou `?scene=fx`.
- GIF a video ve skinech se sdíleným přehráváním, ořezem a limitem videí.
- Editory na plátně: cesta (body, úchyty, ostrý/hladký, ▶, Enter/Esc), oběžná dráha (střed kliknutím, bez cyklů, úchyty poloměrů a natočení), bloudění (kruh, obdélník). Ověřeno přes CDP: tažení úchytu změní poloměr a natočení, Esc zruší, cesta se uloží Enterem jako krok Undo.
- Sluneční soustava z §3.5 jako scéna `?scene=solar` (test: měsíce obíhají Games, Games obíhá Slunce).
- Výkon na tomto PC (vývojový build, okno 1280×800 @125 %): 200 bublin 58–60 FPS (snímek 6–9 ms), 1000 bublin 40–58 FPS podle zoomu. Referenční notebook z §10.2 tu není k dispozici.
- Testy: 165 TS, 73 Rust.

**Ruční checklist**
- [ ] `?scene=solar`: planety obíhají Slunce po elipsách, měsíce obíhají Games, aplikace i tapeta ukazují bubliny na stejném místě.
- [ ] `?scene=200` s GIFy a videi na referenčním notebooku: ≥ 60 FPS (FPS měřič v nastavení Výkon).
- [ ] `?scene=1000` na referenčním notebooku: ≥ 45 FPS bez záseků.
- [ ] Editor cesty: body, křivky, dvojklik ostrý/hladký, ▶ přehraje, Enter uloží, Esc zruší.
- [ ] Editor oběžné dráhy: kruhový střed nejde vybrat, když by vznikl cyklus.

## Fáze 7 – Dokončení a vydání: hotovo (ruční kontrola a čistá instalace zbývají)

**Hotovo a ověřené automaticky**
- Vzhled: Světlý, Tmavý, OpiKula style, Vlastní. Editor všech 29 barevných tokenů (celá aplikace je živý náhled), export a import `.bvtheme`, scale GUI 50–200 %, písmo, zaoblení, průhlednost panelů.
- Pozadí světa: barva, gradient, obrázek, video, tapeta Windows; animované hvězdy, paralaxa, mřížka; zvlášť pro aplikaci a tapetu. Ověřeno v aplikaci (hvězdy a mřížka přes CDP).
- Zvuky: kliknutí v UI a zvuk aktivace (syntetizované), hlasitost, vlastní zvuky jako assety (ověřen import a přehrání wav), ztlumení při hře na celou obrazovku.
- Instalátor NSIS (pro uživatele, čeština + angličtina, asociace `.bubble`) a podpis pro updater: `pnpm tauri build` vytvořil `BubbleVerse_0.1.0_x64-setup.exe` (5,8 MB) a `.sig`.
- Auto-update z GitHub Releases ověřovaný klíčem updateru, tlačítko „Zkontrolovat teď“ v Obecných. Workflow CI (`pnpm check`) a Release (koncept vydání s `latest.json` a `SHA256SUMS.txt`).
- Výkonový test `pnpm test:perf` (na tomto PC, vývojový build): 200 bublin 2–6 ms na snímek, 1000 bublin 4–5 ms (rozpočet 16,7 / 22,2 ms). FPS ukazuje ~48, protože Windows zpomaluje zakryté okno.
- E2E testy (tauri-driver 2.1.0 + msedgedriver 154.0.4258.62 + WebdriverIO) pro tři toky z §12: 3/3 prošly (vytvořit → uložit → `Ctrl+F` → spustit, hromadný generátor, import s varováním). Běží s dočasnou složkou dat, kterou po sobě smažou.
- Dva monitory (hlavní 1920×1080 při 125 %, druhý 1920×1080 při 100 %): okno pokrývá 3840×1080, výřezy mají k = 1 a 0,8, svět navazuje přes hranici, UI je jen na hlavním monitoru. Přetažení bubliny v editaci z hlavního monitoru na druhý ji položí přesně pod kurzor. Tapeta je `live` a kreslí hvězdy, mřížku i bubliny na obou monitorech.
- Testy: 166 TS, 73 Rust. `pnpm check` prochází.

**Známé problémy a co zbývá**
- E2E testy potřebují `msedgedriver.exe` ve verzi nainstalovaného WebView2 (cesta v `MSEDGEDRIVER`); po aktualizaci WebView2 je potřeba stáhnout novou verzi.
- Instalátor NSIS nemá české texty pro hlášky specifické pro Tauri (upozornění při buildu); standardní texty NSIS česky jsou.
- Čistá instalace na Windows 10 a 11 a celý [`CHECKLIST.md`](CHECKLIST.md) jsou ruční.
- Soukromý klíč updateru je v `%USERPROFILE%\.tauri\bubbleverse-updater.key`. Pro vydání přes GitHub patří do secrets `TAURI_SIGNING_PRIVATE_KEY` (+ prázdné `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Bez zálohy klíče nepůjde vydat aktualizaci pro už nainstalované kopie.

**Ruční checklist**
- [ ] Celý [`docs/CHECKLIST.md`](CHECKLIST.md) na čisté instalaci Windows 10 a Windows 11.

## Po prvním testování uživatelem (2026-10-10)

**Opraveno**
- Body cesty a úchyty oběžné dráhy zůstávaly na obrazovce při posunu kamery; teď jedou se světem a pohled jde při úpravě posouvat pravým / prostředním tlačítkem.
- Nativní menu WebView2 (Zpět, Aktualizovat, Uložit jako, Tisk) a prohlížečové zkratky (`Ctrl+P`, `F5`, `Alt+←`) jsou vypnuté ve všech oknech.
- Editor scriptů: nabídka bloků se nezvětšuje se zoomem plochy, má vlastní lupu s − a +. Zkratka v bloku „při stisku“ se zadává stiskem kláves.
- Nastavení → Zkratky padalo (prázdná stránka s nadpisem „Vzhled“), když dva scripty měly stejnou zkratku a stejnou cestu. Víc zkratek v jedné bublině se čísluje.
- Kontextové menu a rychlé vytvoření se při Scale GUI ≠ 100 % otevíraly daleko od kurzoru.
- Strom má kontextové menu na pravém tlačítku.
- Popisky polí a názvy zkratek se zalamují místo useknutí; nastavení má odlišné ikony; doplněné české překlady (Záře, Najetí myší, …); sekce Najetí myší má stejné rozložení jako ostatní.

**Prošlo kontrolou bez nálezu:** všechny stránky nastavení (EN i CS), inspektor všech sekcí, kontextová menu, editor pohybu, klávesy edit módu (kopírovat, vložit, duplikovat, smazat, zpět, znovu, vybrat vše), uživatelský režim (rozbalení složky, tooltip), globální lišta hledání, všech 144 bloků katalogu v editoru včetně převodu na script, menu Blockly na pravém tlačítku.


## Druhé kolo úprav (2026-10-10)

**Hotovo a ověřené**
- Výběr zkratky přes hook jádra (Alt+Space, Win… už neotevřou menu Windows), zkratky z modifikátoru samotného a akordy kláves – testy v Rustu i TS.
- Nativní menu prohlížeče a jeho zkratky vypnuté i stránkou samotnou ve všech oknech.
- Editor scriptů: kategorie bloků zůstane otevřená při zoomu, bez pravého panelu, režim spuštění v menu startovního bloku (ověřeno klikem), proměnné ve spodní záložce, nápověda ke všem 145 blokům (ověřeno: otazník v rohu bloku, okno s ①②, formáty a pasujícími bloky).
- Kamera drží všechny bubliny v záběru (ověřeno na kopii dat uživatele: bubliny daleko od středu se ukázaly).
- Globální hledání s vesmírem a animací (ověřeno: okno se ukáže s animací, pole má fokus, Esc okno schová).
- Obnovení výchozího stavu (ověřeno na kopii dat: prázdný svět, předchozí verze v zálohách).

**Ruční kontrola**
- [ ] Skutečný stisk Alt+Space / Win / Ctrl samotného při výběru zkratky (automatický test hooku je jen v Rustu).
- [ ] Pravé tlačítko na bublině v nainstalované verzi: jen menu aplikace.
- [ ] Animace globálního hledání nad plochou na obou monitorech.

## Opravy po instalaci (2026-10-11)
- Ukazatel myši zůstal neviditelný nad plochou po hledání přes Ctrl+F na ploše a spuštění bubliny. Ověřeno na počítači uživatele: nad plochou byl kurzor skrytý, nad jinými okny ne. Příčina: tapeta pod ikonami spojila vstup plochy s UI vláknem aplikace. Tapeta teď běží ve vlastním procesu. Ověřeno na kopii dat uživatele: okno tapety patří procesu tapety a má vlastní prohlížečový proces; tapeta kreslí svět, hledání na ploše ji zešedí; s oknem aplikace v popředí vlákno plochy fokus nesdílí; po zabití se proces tapety spustí znovu; po ukončení aplikace oba procesy skončí a plocha je jako dřív.
- Ctrl+F na ploše funguje i bez kliknutí na plochu (v popředí žádné okno, skryté nebo minimalizované okno, hlavní panel).

**Ruční kontrola**
- [ ] Ctrl+F na ploše, psaní, Enter na bublině: ukazatel nad plochou zůstane vidět.
