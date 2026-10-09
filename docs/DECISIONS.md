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

### 2026-10-07 · Zkratky a hook
- **Rozhodnutí:** hook chytá globální zkratky a vnitřní zkratky s volbou „přebít Windows“. Vnitřní zkratky bez přebití obsluhuje přímo okno aplikace. Zkratky ze scriptů hook chytá vždy a kombinaci si nechá. Hook se každou minutu znovu připojí. Simulované klávesy (makra, `SendInput`) hook ignoruje.
- **Důvod:** okno vidí klávesy jen samo pro sebe. Ignorování simulovaných kláves brání smyčkám, kdy by makro spouštělo samo sebe.

### 2026-10-07 · Kompaktní lišta
- **Rozhodnutí:** lišta se ukazuje dole uprostřed hlavního monitoru, stejně jako pole hledání v aplikaci a na ploše. Když je v popředí okno aplikace, globální zkratka otevře hledání přímo v něm.
- **Důvod:** specifikace pozici lišty neurčuje. Hledání má být všude stejné (§6.1).

### 2026-10-07 · Editor scriptů a koncept
- **Rozhodnutí:** editor scriptů pracuje s kopií scriptů bubliny. **Uložit** v editoru je pošle hlavnímu oknu, to je zapíše do konceptu jako jeden krok undo a hned uloží celý koncept (stejně jako `Ctrl+S`). Když hlavní okno zrovna není v edit módu, zapíše je rovnou do uložené verze. Zavření editoru s neuloženými změnami nabídne Uložit / Zahodit / Zůstat.
- **Důvod:** koncept drží okno aplikace (§8.4) a svět má jen jeden koncept. Uložit v editoru má být vidět hned (zkratky, časovače), bez druhého ukládání v hlavním okně.

### 2026-10-07 · Test, krokování a zvýraznění v editoru
- **Rozhodnutí:** **▶ Test** spustí script, ve kterém je vybraný blok (jinak první script), hned a bez ohledu na spouštěč. Běží obsah editoru, i neuložený. **⏭ Krok** spustí test po jednotlivých blocích, další stisk pustí další blok. **■ Stop** zastaví všechny scripty bubliny. Uložené scripty se zvýrazňují jen tehdy, když editor nemá neuložené změny, jinak by čísla bloků neseděla.
- **Důvod:** §5.5 krokování a test popisuje jen tlačítky. Hat bloky jako zkratka nebo čas by se jinak otestovat nedaly.

### 2026-10-07 · Sdílené scripty v editoru
- **Rozhodnutí:** vlastní scripty bubliny jsou na jedné ploše (víc spouštěčů). Každý sdílený script bubliny má vlastní záložku. Úprava sdíleného scriptu mění knihovnu, a tím všechny bubliny. Parametry sdíleného scriptu jsou bloky `parametr`, jejich typ a výchozí hodnota se nastavují v panelu Parametry, hodnoty pro bublinu taky. **⇄** u vlastního scriptu z něj udělá sdílený (parametry = použité bloky `parametr`). U sdíleného ho vrátí jako vlastní kopii a bloky `parametr` nahradí hodnotami bubliny.
- **Důvod:** sdílený script má podle §9.1 jeden spouštěč. Převod zpět nesmí ztratit hodnoty, které bublina měla.

### 2026-10-07 · Nahrávání makra
- **Rozhodnutí:** nahrávají se stisky kláves, kliky a kolečko myši. Klávesy a kliky do oken BubbleVerse se nenahrávají, takže jde nahrávání zastavit tlačítkem. Psaný text se slučuje do bloku `napiš`, ostatní klávesy jsou `stiskni`. Pauzy od 0,4 s jsou bloky `počkej` (na desetiny sekundy). Tažení myší se nahraje jako klik, protože blok pro držení tlačítka myši v katalogu není.
- **Důvod:** §5.1 popisuje nahrávání jen jednou větou. Krátké pauzy mezi písmeny by jinak rozbily text na stovky bloků.

### 2026-10-07 · Okno Proměnné
- **Rozhodnutí:** globální proměnné a běžící scripty jsou v Nastavení na kartě **Scripty**. Proměnné jdou přidat, smazat a jejich aktuální hodnota změnit. Běžící scripty jsou i v tray v podmenu.
- **Důvod:** §5.3 mluví o okně Proměnné, ale samostatné okno by bylo jen další okno se seznamem. Nastavení už jako okno funguje.

### 2026-10-09 · Hromadný generátor
- **Rozhodnutí:** generátor je i v kontextovém menu složky (bubliny se vytvoří do ní), nejen na prázdném plátně. Aplikace z Microsoft Store se spouští přes `shell:AppsFolder\<AUMID>` sdíleným scriptem „Otevřít URL“, hry ze Steamu a Epicu přes jejich odkazy. Seznam aplikací a her je na začátku nezaškrtnutý (bývá dlouhý), soubory a weby zaškrtnuté. Ikony se načítají už v náhledu, takže nové bubliny je mají hned.
- **Důvod:** §4.6 neříká, odkud se generátor otevírá ve složce, ani jak se spouští Store aplikace. Store aplikace nemají soubor, který by šel spustit.

### 2026-10-09 · Přetažení souborů do okna a Strom
- **Rozhodnutí:** soubory z Průzkumníku přijímá okno aplikace přes vlastní drag & drop Tauri (dává cesty i místo puštění). Strom proto přesouvá bubliny myší (pointer events), ne přes HTML5 drag & drop, které Tauri ve Windows vypne.
- **Důvod:** stránka sama cesty k souborům nevidí. Předání souborů do WebView2 přes `postMessageWithAdditionalObjects` stránku zamrazilo.

### 2026-10-09 · Import a export `.bubble`
- **Rozhodnutí:** větev se při importu vloží jako main bublina u domovského pohledu, nebo jako podbublina vybrané složky. Balíček celého světa nabízí navíc „Nahradit celý svět“ (jde vrátit přes Undo). Najít a nahradit platí pro parametry sdílených scriptů i texty ve vlastních scriptech a nerozlišuje velikost písmen. Stejné sdílené scripty a vlastní bloky se nezdvojí. Jiný obsah pod stejným id dostane nové id (i bloky, které ho volají). Vestavěné scripty se vždy použijí ty z aplikace.
- **Důvod:** §9.4 popisuje volby jen obecně. Cesty ve Windows velikost písmen nerozlišují.

### 2026-10-09 · Přesun dat (Nastavení → Data)
- **Rozhodnutí:** „Přesunout…“ data zkopíruje do vybrané prázdné složky (databáze přes `VACUUM INTO`, assety a zálohy), do standardní složky zapíše `location.txt` s novou cestou a aplikaci restartuje. Stará složka zůstane beze změny. Obnova zálohy jde jen mimo edit mód.
- **Důvod:** aplikace nesmí mazat data uživatele. Bez restartu by běžící jádro pracovalo se starou databází.

### 2026-10-09 · Spojení a efekty v edit módu
- **Rozhodnutí:** v edit módu (kde stojí pohyb) jsou blesk, lano, řetěz, tok částic i částice kolem bublin v klidu. Hýbou se v uživatelském módu, v náhledu a na tapetě. GIF a video hrají jen tam, kde běží pohyb. V edit módu ukazují aktuální snímek.
- **Důvod:** edit mód má stát (§2.6), aby šlo bubliny přesně chytat, a „klid = 0 FPS“ (§10.1).

### 2026-10-09 · Sklo
- **Rozhodnutí:** efekt „sklo“ je průsvitná výplň s odleskem a světlým okrajem, předkreslená do textury skinu. Skutečné rozmazání pozadí za bublinou se nedělá.
- **Důvod:** rozmazání pozadí by znamenalo filtr pro každou bublinu každý snímek, což jde proti §10.1 („žádné drahé filtry každý snímek“).

### 2026-10-09 · GIF, video a atlas
- **Rozhodnutí:** GIF (uložený jako animovaný WebP) se jednou dekóduje přes `ImageDecoder` (nejvýš 240 snímků, max 256 px). Video hraje v jednom skrytém prvku na asset. Každý vzhled (asset + tvar + výplň + okraj) má jednu sdílenou texturu, kreslí se jen u bublin na obrazovce. Statické skiny jsou v atlasu po 64 skinech (stránka 2048 px). Spojení a částice jsou znovu používané sprity z jedné malé textury.
- **Důvod:** §10.1 (jedno přehrávání na GIF, nejvýš N videí, dávkové kreslení). Měřením se ukázalo, že přestavba grafiky spojení každý snímek a samostatné textury skinů brzdily nejvíc.

### 2026-10-09 · Editory pohybu
- **Rozhodnutí:** editory cesty, oběžné dráhy a bloudění pracují s kopií pohybu, Enter ji uloží jako jeden krok Undo, Esc ji zahodí. Klik přidá bod cesty na konec. Tažení z nového bodu udělá hladký bod s úchyty. Úchyt poloměru X oběžné dráhy nastavuje i natočení. Rychlost, směr a fáze oběžné dráhy zůstávají v inspektoru (§4.4). Oblast bloudění se kreslí od bubliny ven.
- **Důvod:** §4.4 popisuje ovládání jen v hlavních rysech.
