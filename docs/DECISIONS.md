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

### 2026-10-10 · Zvuky
- **Rozhodnutí:** vestavěné zvuky (kliknutí tlačítka, akord při aktivaci bubliny) se syntetizují přes WebAudio, aplikace tedy nemá zvukové soubory. Vlastní zvuky jsou assety mp3, wav nebo ogg. Výchozí stav zvuků je vypnuto. Ztlumení „když běží hra na celou obrazovku“ používá stejný signál jako auto-pauza.
- **Důvod:** §7.7 neurčuje, které zvuky aplikace má, ani výchozí stav. Tichý start nikoho neruší.

### 2026-10-10 · Pozadí světa
- **Rozhodnutí:** hvězdy jsou na vzdálené rovině v pixelech obrazovky (zoom je nemění), s paralaxou se posouvají o 15 % pohybu kamery, bez ní stojí. Barva, gradient, obrázek i video pokrývají každý monitor zvlášť (na hranici monitorů je proto vidět začátek nového gradientu); obrázek a video se s paralaxou posouvají jen o malý kus. Mřížka mění rozestup podle zoomu. Hvězdy a video potřebují snímky jen při běžícím pohybu a kreslí se málo často (hvězdy ~10×, video ~30× za sekundu).
- **Důvod:** §7.6 popisuje jen volby. „Klid = 0 FPS“ a tapeta v klidu ~0 % GPU (§10).

### 2026-10-10 · Vydání a aktualizace
- **Rozhodnutí:** instalátor NSIS pro aktuálního uživatele (bez správce), čeština a angličtina, asociace souborů `.bubble`. Aktualizace se hledají 15 s po startu (ne ve vývojové verzi) v `latest.json` posledního GitHub Release a ověřují klíčem updateru. Soukromý klíč je mimo repozitář v `%USERPROFILE%\.tauri\bubbleverse-updater.key` (bez hesla). Release workflow vytvoří jen koncept vydání, zveřejnění je ruční.
- **Důvod:** §16 (bezplatný klíč updateru, SHA-256 otisky, žádné podepisování). Instalace bez správce sedí k tomu, že BubbleVerse sám běží bez admin práv (§5.4).

### 2026-10-10 · Úpravy po prvním testování uživatelem
- **Rozhodnutí:** WebView2 má ve všech oknech vypnuté vlastní kontextové menu a prohlížečové zkratky (tisk `Ctrl+P`, `F5`, `Alt+←`, hledání v stránce). Zůstávají jen menu a zkratky aplikace.
- **Rozhodnutí:** nabídka bloků v editoru scriptů má vlastní velikost (lupa s − a + dole pod kategoriemi, 50–150 %, pamatuje si ji počítač); zoom plochy ji nemění.
- **Rozhodnutí:** zkratka v bloku „při stisku … “ se zadává stiskem kláves (klik na pole, stisk kombinace, Esc zruší), ne psaním názvů kláves. Během zadávání jsou globální zkratky pozastavené.
- **Rozhodnutí:** při úpravě cesty, oběžné dráhy a oblasti bloudění jde pohled posouvat tažením pravým nebo prostředním tlačítkem a přibližovat kolečkem; bublina mimo obrazovku se při otevření editoru ukáže. Strom v edit módu má na pravém tlačítku stejné menu jako bublina.
- **Důvod:** požadavky uživatele po prvním testu (mimo výslovné znění specifikace, ale v jejím duchu: aplikace se nemá chovat jako webová stránka, §5.1 editor má být pohodlný).

### 2026-10-10 · Druhé kolo úprav po testování
- **Rozhodnutí:** zkratka se vybírá přes nízkoúrovňový hook jádra: během výběru jádro spolkne každou klávesu (Windows ani jiné aplikace nic nedostanou), výsledek se zapíše po puštění všech kláves. Zkratka může být samotný modifikátor (`Ctrl` – spustí se při stisku a puštění bez jiné klávesy) nebo více kláves držených spolu (`T+L+P` – spustí se stiskem poslední, na pořadí nezáleží). Samotný Esc výběr zruší. Klávesy akordu bez modifikátoru se do aplikace propíšou dřív, než je akord celý.
- **Rozhodnutí:** pravý panel editoru scriptů je pryč. „Spustit znovu, když běží“ je v menu na pravém tlačítku startovního bloku, rozsah zkratky jen v bloku samotném, proměnné jsou záložka spodní konzole; panel se ukazuje jen na záložce sdíleného scriptu (parametry) a vlastního bloku (vstupy).
- **Rozhodnutí:** otevřená kategorie bloků se nezavírá při zoomu ani práci na ploše (zavře ji klik na kategorii).
- **Rozhodnutí:** v režimu prohlížení a na tapetě kamera drží v záběru všechny zobrazené bubliny i během pohybu (cíl je oblast, kterou bubliny použily za posledních 8 s, kamera k ní plynule dojíždí). Ruční posun nebo zoom sledování vypne do stisku Home. Volba v menu „oko“: Všechny bubliny / Domovský pohled.
- **Rozhodnutí:** globální hledání má vzhled „Vesmír s bublinami“ (výchozí) nebo „Jen pole hledání“. Vesmír se objeví přes plochu s animací Přiblížení / Portál z pole / Z rozmazání / Prolnutí / Hned; okno aplikace je proto průhledné. Po Esc, kliknutí mimo nebo spuštění bubliny okno odejde stejnou animací.
- **Rozhodnutí:** Nastavení → Data → Obnovit BubbleVerse vrátí svět, nastavení, theme, pozadí, proměnné, historii hledání a rozložení scriptů do stavu po instalaci. Jazyk zůstane a současný svět se nejdřív uloží do záloh.
- **Rozhodnutí:** každý blok má nápovědu (otazník v pravém horním rohu při najetí): popis, vstupy očíslované jako na bloku, co do nich napsat a v jakém formátu, a které bloky do nich pasují. Texty jsou v `packages/blocks/help.yaml`; `pnpm gen:blocks` hlídá, že každý blok a vstup má text v obou jazycích.
- **Rozhodnutí:** prohlížečové menu a zkratky ruší i stránka sama (`guardBrowserUi`), protože nastavení WebView2 platí až od další navigace.
- **Důvod:** požadavky uživatele po druhém testu.

### 2026-10-10 · Zamrzání při výběru zkratky
- **Příčina:** Alt (samotný nebo s mezerníkem) přepnul celoobrazovkové okno do režimu systémového menu. Když se zároveň měnil fokus (globální hledání otevřené s drženým Altem), WebView2 zamrzl. Klikání ani zkratky pak nefungovaly.
- **Rozhodnutí:** hlavní okno a lišta hledání nemají systémové menu (styl bez `WS_SYSMENU` a `SC_KEYMENU` se zahodí). Akce ze zkratek s Alt/Win se provedou až po jejich puštění a vždy na UI vlákně. Simulované klávesy se nikdy neposílají z hooku. Hook se obnoví při každém výběru zkratky a jinak každých 5 s. Výběr zkratky dokončí i stránka sama, kdyby hook nedostal klávesy.

### 2026-10-11 · Neviditelný ukazatel myši na ploše
- **Příčina:** okno vložené pod ikony plochy (dítě `Progman` z jiného procesu) spojí Windows natrvalo se vstupní frontou plochy; `AttachThreadInput(FALSE)` ani vyjmutí okna to nezruší (ověřeno). Tapeta běžela na UI vlákně aplikace, takže plocha sdílela vstup s lištou hledání i oknem aplikace. Při psaní v liště Windows skryly ukazatel („Skrýt ukazatel při psaní“) a nad plochou zůstal skrytý.
- **Rozhodnutí:** tapeta běží ve vlastním procesu (`bubbleverse.exe --bv-wallpaper <složka assetů>`) s vlastní složkou WebView2 (`EBWebView-wallpaper`), tedy i s vlastním prohlížečovým procesem; jen ten je spojený s plochou. Aplikace mu po stdin posílá události (svět, nastavení, rozložení, pauza, efekty, autopauza, hledání na ploše, spánek, snímek) a odpovídá na jeho příkazy (`bootstrap`, stav tapety, snímek, tapeta Windows) – jeden JSON na řádek. Když proces tapety sám skončí, aplikace ho spustí znovu (nejvýš třikrát). Při vypnutí tapety nebo aplikace se proces tapety sám vyjme z plochy a skončí.
- **Rozhodnutí:** okna se dostávají dopředu bez `AttachThreadInput`: aplikace nejdřív pošle prázdný vstup myši (bez pohybu a tlačítek), díky kterému Windows povolí `SetForegroundWindow`.
- **Cena:** jeden proces WebView2 navíc, když je tapeta zapnutá.

### 2026-10-11 · Kamera při hledání a editor orbitu
- **Rozhodnutí:** po potvrzení úrovně v hledání kamera nejdřív zamíří na bublinu a její děti (spec §6.5) a pak průběžně drží v záběru bublinu a všechny její zobrazené potomky, i když obíhají; oddaluje se rychle, přibližuje pomalu. Bez potvrzené úrovně (po Backspace) drží všechny zobrazené bubliny, v režimu `:` celý svět.
- **Rozhodnutí:** „Všechny orbity“ v editoru orbitu ukáže čárkovaně dráhy všech ostatních orbitů a na každé bublinu, která po ní obíhá, se jménem – v místě, kde začíná (při ▶ tam, kde právě je). Upravovaná bublina je vidět na své dráze taky.
- **Rozhodnutí:** Ctrl při tažení úchytu orbitu přichytí směr od středu po 45° (natočení 0°, 45°, 90°…); délka zůstane. Funguje i stisk nebo puštění Ctrl během tažení.
- **Důvod:** požadavky uživatele po testu (bubliny na orbitu utíkaly z obrazu, chtěl vidět všechny orbity a přesné úhly).

### 2026-10-12 · Hledání zkratkou zvenku a spuštění z hledání
- **Příčina chyb:** akce „Hledat“ (hledání v okně aplikace) nastavená jako globální zkratka otevírala hledání i v okně, které bylo schované nebo zakryté jiným programem. Uživatel nic neviděl, hledání zůstalo otevřené a další stisk už nic neudělal. Po Enteru na akci se zavřelo jen hledání, okno s bublinami zůstalo.
- **Rozhodnutí:** „Hledat“ ze zkratky, když okno aplikace není vepředu, je globální hledání (vesmír nebo lišta podle nastavení). Spuštění akce z hledání schová hledání i okno aplikace vždy, i při hledání uvnitř okna (v režimu úprav se akce jen vybere jako dřív).

### 2026-10-12 · Texty instalátoru
- **Příčina:** Tauri nemá české texty svých stránek instalátoru (např. „Už nainstalováno“), takže v češtině byly přepínače bez popisků.
- **Rozhodnutí:** vlastní české texty v `src-tauri/nsis/Czech.nsh` (soubor bez BOM, Tauri ho přidá sám; bez `$\n`), hlavička instalátoru s ikonou BubbleVerse místo loga NSIS.
