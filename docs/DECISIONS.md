# Rozhodnutí

Záznam rozhodnutí tam, kde specifikace mlčí nebo je nejasná. Formát: datum · otázka · rozhodnutí · důvod.

---

### 2026-10-07 · Začít znovu od nuly
- **Rozhodnutí:** stavět na nové lokální větvi `v1` (z `main`). Starší pokus zůstává jen jako archiv na větvi `phase-1`.
- **Důvod:** volba uživatele.

### 2026-10-07 · Fáze bez zastavování
- **Rozhodnutí:** fáze 1–7 jdou za sebou bez čekání na schválení plánu. Zastavit se jen u věcí, které mění chování aplikace mimo specifikaci nebo nejdou udělat podle ní.
- **Důvod:** volba uživatele (mění pravidlo z AI promptu §3).

### 2026-10-07 · Jazyk dokumentace
- **Rozhodnutí:** `docs/plans/`, `PROGRESS.md` a `DECISIONS.md` česky. Kód, komentáře, commity, README a výchozí texty UI anglicky.
- **Důvod:** komunikace s uživatelem je česky, AI prompt §2.6.

### 2026-10-07 · Verze nástrojů
- **Rozhodnutí:** TypeScript `~6.0` (ne 7.0), Svelte 5, Vite 8, PixiJS 8, Tauri 2.12, crate `windows` 0.62 (stejná verze jako v Tauri).
- **Důvod:** `typescript-eslint` a `svelte-check` zatím nepodporují TS 7. Není to změna technologie, jen verze.

### 2026-10-07 · Jedna konfigurace Vite pro všechna okna
- **Rozhodnutí:** kořen Vite je `apps/`, každé okno má vlastní složku (`apps/main`, `apps/searchbar`, …) a build jde do `dist/<okno>/index.html`. Balíčky v `packages/*` exportují přímo `src/index.ts` bez vlastního buildu.
- **Důvod:** nejjednodušší řešení, jeden dev server a jeden build. Zachovává strukturu z §8.3.

### 2026-10-07 · Jednoduché akce jsou rovnou sdílené scripty
- **Rozhodnutí:** „Spustit soubor / Otevřít URL“ z fáze 1 se ukládají hned jako odkaz na vestavěný sdílený script (`builtin.runFile`, `builtin.openUrl`) s parametry.
- **Důvod:** fáze 4 vyžaduje, aby se jednoduché akce převedly na sdílené scripty. Takhle žádný převod není potřeba.

### 2026-10-07 · Oběžná dráha a základní pozice
- **Rozhodnutí:** bublina na oběžné dráze stojí na `pozice středové bubliny + bod elipsy`. Její vlastní základní pozice se při obíhání nepoužívá (v edit módu na ní stojí).
- **Důvod:** §3.4 říká, že se pohyb přičítá k základní pozici, ale u oběžné dráhy je středem jiná bublina. Tohle odpovídá příkladu se sluneční soustavou.

### 2026-10-07 · Fyzika
- **Rozhodnutí:** „délka“ pružiny je volnost: pružina táhne, až když je bublina od cíle dál než tato délka. Bez zapnuté pružiny, ale s jinou fyzikou, se použije tuhá pružina s kritickým tlumením. Plování je deterministické podle času a id bubliny.
- **Důvod:** specifikace neříká, co délka znamená. Tohle nemění rozložení a dává „houpavé“ tažení.

### 2026-10-07 · Čas pro pohyb
- **Rozhodnutí:** pohyb se počítá z času Unix v sekundách.
- **Důvod:** aplikace i tapeta pak ukazují bublinu na stejném místě (§3.5).

### 2026-10-07 · Blok „vypiš do konzole“
- **Rozhodnutí:** do kategorie Ovládání přibyl blok `vypiš … do konzole` (`ctl_log`).
- **Důvod:** §5.5 říká, že debug konzole ukazuje výpisy, ale §5.2 žádný blok pro výpis nemá.

### 2026-10-07 · ZIP bloky jsou nebezpečné
- **Rozhodnutí:** „rozbal / zabal ZIP“ mají štítek ⚠.
- **Důvod:** zapisují soubory, což §5.6 počítá mezi nebezpečné akce.

### 2026-10-07 · Další podrobnosti bloků
- **Rozhodnutí:** den v týdnu je 1 = pondělí … 7 = neděle. Časové razítko jsou sekundy Unix, `formátuj datum` s 0 použije aktuální čas. Proměnná v bloku je zapsaná jako `s:jméno` / `b:jméno` / `g:jméno` (platnost script / bublina / globální).
- **Důvod:** český zvyk, nejjednodušší zápis.

### 2026-10-07 · Assety
- **Rozhodnutí:** obrázky se ukládají jako bezeztrátový WebP a zmenší se na nejvýš 2048 px. GIF se převede na animovaný WebP (ztrátový, kvalita 85). Otisk je prvních 128 bitů SHA-256. Auto-ikona si ukládá nalezený obrázek do `media.asset`.
- **Důvod:** šetří paměť grafiky (§10). Datový model v §9.1 pro auto-ikonu místo na obrázek nemá.

### 2026-10-07 · Výchozí hodnoty, které specifikace neuvádí
- **Rozhodnutí:** theme Tmavý, spouštět po startu Windows zap, tapeta zap, jména vždy, kvalita efektů vysoká, pozadí světa tmavý gradient. Nové podbubliny dědí skin od rodiče a mají 65 % jeho velikosti.
- **Důvod:** §2.2 počítá s tapetou jako výchozí, hotovo-když z fáze 1 počítá se spuštěním po restartu PC.

### 2026-10-07 · Vykreslení skinů
- **Rozhodnutí:** tvar, výplň, obrys, stín a obrázek se předkreslují přes Canvas 2D do sdílených textur. Bubliny se stejným vzhledem sdílí jednu texturu.
- **Důvod:** grafika pak kreslí jen sprity v dávkách (§10.1).

### 2026-10-07 · Edit mód a sbalené složky
- **Rozhodnutí:** edit mód respektuje rozbalení složek. Dvojklik na složku ji rozbalí nebo sbalí, výběr ve Stromu rozbalí její předky.
- **Důvod:** se stovkami bublin by úplné rozbalení bylo nepřehledné.

### 2026-10-07 · Chyby scriptů v okně aplikace
- **Rozhodnutí:** chyba scriptu se kromě červeného bliknutí a záznamu v konzoli ukáže i jako krátká hláška v okně aplikace.
- **Důvod:** bez otevřeného editoru by uživatel třeba „Soubor nenalezen“ jinak neviděl.

### 2026-10-07 · Vývojářský režim
- **Rozhodnutí:** vývojové buildy mají data v `%APPDATA%\BubbleVerse-dev` a autostart do registru zapisují jen s `BV_DEV_AUTOSTART=1`. `BV_WINDOWED=1` otevře obyčejné okno místo okna přes všechny monitory. `?scene=200` načte testovací scénu.
- **Důvod:** vývoj nesmí měnit data ani autostart nainstalované aplikace.

### 2026-10-07 · Riziko: Smart App Control (doplněk k §16)
- **Zjištění:** Windows 11 se zapnutým *Smart App Control* nepodepsané aplikace bez reputace zablokuje úplně. Neukáže jen varování SmartScreen.
- **Co s tím:** zatím jen zaznamenáno. Podepsání je rozhodnutí uživatele (§16).
