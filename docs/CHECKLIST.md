# Ruční checklist pro vydání (spec §12)

Projít na čisté instalaci **Windows 10 (22H2)** i **Windows 11**, ideálně ve virtuálním stroji
bez vývojových nástrojů. Co jde ověřit automaticky, běží v `pnpm check`, `pnpm test:perf`
a `pnpm test:e2e`.

## Instalace a aktualizace
- [ ] Instalátor z GitHub Release: SmartScreen ukáže „Windows ochránil váš počítač“, přes *Další informace → Přesto spustit* jde instalace dokončit. Instaluje se jen pro uživatele, bez správce.
- [ ] Výběr jazyka instalátoru (čeština / angličtina), zástupce ve Start menu „BubbleVerse“.
- [ ] Po instalaci se aplikace spustí, je v tray, po restartu PC se spustí sama (výchozí zap).
- [ ] SHA-256 instalátoru odpovídá `SHA256SUMS.txt` v release.
- [ ] Aktualizace: nainstalovaná starší verze najde novější release, „Nainstalovat a restartovat“ projde a data zůstanou.
- [ ] Dvojklik na soubor `.bubble` otevře náhled importu (i když BubbleVerse už běží).
- [ ] Odinstalace přes Nastavení Windows: aplikace zmizí, data v `%APPDATA%\BubbleVerse` zůstanou.

## Monitory a DPI
- [ ] 1 monitor 100 %, 2 monitory (100 % + 150 %), 3 monitory s různým DPI: okno aplikace pokrývá všechny, UI je ostré na hlavním monitoru.
- [ ] Přetažení bubliny mezi monitory, odpojení a připojení monitoru za běhu.

## Tapeta
- [ ] Bubliny pod ikonami plochy na všech monitorech, ikony jdou dál používat.
- [ ] `Ctrl+F` na ploše: pole nad ikonami, tapeta šedne a přibližuje, Esc vrátí domovský pohled.
- [ ] Hra nebo video na celou obrazovku: tapeta pozastavená, ve Správci úloh ~0 % GPU.
- [ ] Vypnutí tapety vrátí původní tapetu Windows.

## Základní použití
- [ ] Vytvořit bublinu, uložit, najít přes `Ctrl+F`, spustit (Enter).
- [ ] Globální hledání `Alt+Space` z jiného programu.
- [ ] Hromadný generátor: přetáhnout 30 `.exe` na složku → 30 bublin s ikonami.
- [ ] Export větve a import na jiném PC s varováním a opravou cest.
- [ ] Script se zkratkou, časovačem, broadcastem a CMD blokem; debug ukazuje běžící blok.
- [ ] Sluneční soustava (`?scene=solar` ve vývojové verzi, nebo ručně): oběžné dráhy běží.

## Vzhled a nastavení
- [ ] Témata Světlý, Tmavý, OpiKula style, Vlastní; export a import `.bvtheme`.
- [ ] Scale GUI 50 % a 200 %: UI zůstává použitelné.
- [ ] Pozadí světa: obrázek, video, tapeta Windows, hvězdy, paralaxa, mřížka.
- [ ] Zvuky: kliknutí, aktivace, hlasitost, vlastní zvuk, ztlumení při hře na celou obrazovku.
- [ ] Data: zálohy, obnova, přesun dat do jiné složky, úklid assetů.

## Výkon (referenční notebook z §10.2)
- [ ] `pnpm test:perf`: 200 bublin ≥ 60 FPS, 1000 bublin ≥ 45 FPS.
- [ ] Tapeta v klidu ~0 % GPU a < 1 % CPU, paměť jádra + okna ≤ 300 MB.
- [ ] Globální hledání se otevře do 100 ms, tapeta je po přihlášení vidět do 3 s.
