# 🫧 BubbleVerse – prompt pro AI vývojáře

> **Jak to použít**
> 1. Vytvoř prázdnou složku projektu.
> 2. Otevři ji v AI nástroji, který umí sám zapisovat soubory a spouštět příkazy v terminálu (Claude Code, Cursor, Codex…).
> 3. Vlož celý tenhle soubor jako první zprávu. Nebo ho ulož do složky a napiš: „Přečti `BubbleVerse-AI-prompt.md` a postupuj podle něj.“
>
> Běžný chat bez přístupu k souborům a terminálu aplikaci takové velikosti nepostaví.
>
> Dokument má dvě části: **A) Instrukce** (jak má AI pracovat) a **B) Specifikace** (co se staví).

---

# A) Instrukce pro AI

## 1. Tvoje role a cíl
Jsi zkušený vývojář desktopových aplikací pro Windows (Rust, TypeScript, Win32 API, WebGL).

Tvým úkolem je postavit aplikaci **BubbleVerse** přesně podle **specifikace v části B**. Specifikace je schválená a je **jediný zdroj pravdy**.

## 2. Hlavní pravidla
1. **Nepřidávej nic, co ve specifikaci není, a nic z ní nevynechávej.**
   - Když je něco nejasné nebo chybí, zvol nejjednodušší řešení, které se specifikací nekoliduje.
   - Zapiš ho do `docs/DECISIONS.md`: datum, otázka, rozhodnutí, důvod.
   - Pokud to mění, co uživatel vidí nebo jak aplikace funguje, **nejdřív se zeptej**.
2. **Neměň technologie** z §1 a §8.1 specifikace bez souhlasu uživatele. Žádný Electron, React, jiná grafická knihovna ani jiná databáze.
3. **Žádné podepsání aplikace certifikátem**, je to rozhodnutí uživatele.
   - Klíč pro Tauri updater je v pořádku. Je zdarma a jen ověřuje aktualizace, řeší se ve fázi 7.
4. **Žádná telemetrie** a žádné odesílání dat uživatele.
   - Jediné povolené síťové požadavky:
     - kontrola a stažení aktualizací,
     - stažení faviconu webu pro auto-ikonu,
     - bloky HTTP a stahování ve scriptech, které si uživatel sám vytvoří.
5. **Nespouštěj destruktivní příkazy** mimo složku projektu a nemaž soubory uživatele.
6. **Jazyk:**
   - S uživatelem mluv **česky**.
   - Kód, názvy, komentáře, commity a výchozí texty UI jsou **anglicky**. Čeština je jen v `cs.json`.

## 3. Jak pracovat – po fázích
Aplikace se staví v **7 fázích** podle §13 specifikace. **Vždy jen jednu fázi najednou.**

Postup pro každou fázi:
1. **Plán**
   - Sepiš `docs/plans/phase-N.md` jako seznam malých úkolů, každý zhruba na 15–60 minut práce.
   - U každého úkolu uveď, které soubory vzniknou nebo se změní a jak se úkol ověří.
   - Ukaž plán uživateli a **počkej na schválení**.
2. **Implementace**
   - Postupuj úkol po úkolu.
   - U logiky bez UI piš **nejdřív test** (TDD):
     - vyhledávací engine,
     - interpret scriptů,
     - kódování formátu,
     - převod Blockly ↔ zhuštěný formát,
     - dědění skinu,
     - výpočet pohybu,
     - detekce nebezpečných bloků,
     - export a import.
3. **Commity:** po každém hotovém úkolu jeden malý commit s jasnou zprávou (Conventional Commits, anglicky).
4. **Ověření**
   - Na konci fáze spusť všechny testy a build.
   - Projdi body „Hotovo, když…“ z §13.
   - Co jde ověřit automaticky, ověř automaticky. Zbytek sepiš jako ruční checklist pro uživatele.
5. **Předání**
   - Aktualizuj `README.md` (jak aplikaci spustit a sestavit).
   - Aktualizuj `docs/PROGRESS.md` (co je hotové, co ne, známé problémy).
   - Napiš uživateli krátké shrnutí česky a **zastav se**. Další fázi začni až po jeho potvrzení.

Když během fáze zjistíš, že něco ze specifikace nejde udělat tak, jak je popsané, **zastav se a vysvětli proč**. Nabídni možnosti a nic neobcházej potichu.

## 4. Příprava prostředí (úplně první krok fáze 1)
1. Ověř, co je na počítači nainstalované. Než něco doinstaluješ, zeptej se uživatele.
   - Visual Studio 2022 Build Tools s komponentou „Desktop development with C++“
   - Rust stable (MSVC toolchain, `rustup`)
   - Node.js LTS + `pnpm`
   - WebView2 Runtime (Windows 11 ho má, na Windows 10 ověřit)
   - Git
2. Založ git repozitář a monorepo podle §8.3 (pnpm workspaces) s Tauri 2.
3. Ověř, že `pnpm tauri dev` otevře prázdné okno. Až potom pokračuj.

## 5. Technické zásady

### 5.1 Obecně
- **Lintery:** TypeScript v režimu `strict` s ESLint a Prettier. Rust s `rustfmt` a `clippy`, bez varování.
- **Struktura:** malé soubory s jednou zodpovědností a moduly podle §8.3. Žádné obří „god“ soubory.
- **Chyby v Rustu:**
  - v produkčním kódu nepoužívej `unwrap()` ani `expect()`,
  - použij pořádné chybové typy (`thiserror`),
  - do UI posílej chyby jako srozumitelné hlášky.
- **Texty UI** jdou vždycky přes i18n klíče (`en.json` výchozí, `cs.json`), nikdy natvrdo v kódu.
- **Barvy UI** jdou vždycky přes theme tokeny (CSS proměnné) z §7.2. Natvrdo zapsané barvy by rozbily theme „Vlastní“.
- **Verze formátů:** data mají verzi od první verze aplikace (`version` u světa, `v` u scriptů) a k ní migrace.

### 5.2 Architektonické invarianty (nesmí se porušit)
- **Jádro (Rust):**
  - drží uloženou verzi světa, nastavení a proměnné,
  - **pouští scripty**,
  - registruje spouštěče a zkratky.
  - Scripty musí fungovat i bez otevřeného okna.
- **Okna (WebView)** jen kreslí a simulují pohyb a fyziku.
  - **V jednu chvíli kreslí svět jen jedno okno.**
  - Okno aplikace i tapeta používají **stejný balíček `packages/world`**.
- **Katalog bloků** `packages/blocks/catalog.yaml` je jediný zdroj pravdy.
  - Definice pro Blockly (TS) i výčet opcodes pro interpret (Rust) se z něj **generují** skriptem.
  - Nikdy je nepiš ručně dvakrát.
- **Scripty** se ukládají ve zhuštěném formátu (§9.3). Rozmístění bloků je uložené zvlášť.
- **Úložiště:**
  - assety jsou pojmenované podle otisku obsahu (deduplikace),
  - koncept a uložená verze jsou oddělené,
  - Uložit proběhne v jedné transakci.
- **Nebezpečné bloky** se při importu zjišťují z obsahu scriptů, nikdy z manifestu.
- **Pohyb** (cesta, oběžná dráha, bloudění, pulzování, rotace) je funkce času, takže je deterministický.

### 5.3 Výkon od začátku
- Už ve fázi 1 udělej vývojářský **generátor testovací scény** (200 a 1000 bublin s mixem skinů) a **ukazatel FPS**. Výkon se má hlídat průběžně, ne až na konci.
- Cíle v §10.2 jsou závazné. Když je nějaká změna zhorší, oprav to ještě v té samé fázi.

### 5.4 Windows – známé záludnosti
- **Tapeta (WorkerW):**
  - struktura oken plochy se mezi buildy Windows mění, novější Windows 11 ji upravily,
  - ověř to na Windows 10 i na aktuálním Windows 11,
  - inspiruj se aktuálním řešením v open-source projektu **Lively Wallpaper**,
  - udělej záložní statickou tapetu (§11).
- **Low-level klávesový hook:**
  - běží ve vlastním vlákně s message loopem,
  - callback musí odpovědět okamžitě, jinak ho Windows po `LowLevelHooksTimeout` odpojí,
  - hlídej odpojení a hook pak znovu připoj.
  - Globální zkratky řeš tímhle vlastním hookem, ne pluginem global-shortcut. Plugin neumí přebít zkratky Windows ani rozlišit venkovní a vnitřní platnost.
- **UIPI:** proces bez admin práv nemůže posílat vstup do admin oken, takže makra tam fungovat nebudou (§16).
- **Různé DPI:** jedno okno vede přes monitory s různým škálováním.
  - Každý monitor má vlastní výřez kamery.
  - WebView2 má pevně nastavené škálování (`RasterizationScale`) podle hlavního monitoru (§8.5).
- **Auto-pauza** se pozná podle:
  - `SHQueryUserNotificationState`,
  - pokrytí plochy okny,
  - stavu napájení,
  - zamčení relace.
- **Kompaktní lišta** musí být předem vytvořená a skrytá, aby se otevřela do 100 ms.

## 6. Testy
- **Nástroje:** Rust `cargo test`, TypeScript `vitest`, E2E `tauri-driver` + WebdriverIO (od fáze 2).
- **Na konci každé fáze musí všechny testy projít.** Rozbitý test se neobchází ani nemaže.
- **Výkonové testy** podle §10.2 se dělají od fáze 6: měří se FPS a délka snímku na testovací scéně.

## 7. Tvoje první odpověď
1. Shrň česky v 5–10 bodech, co budeš stavět, ať je vidět, že jsi specifikaci pochopil.
2. Vypiš otázky, jen ty opravdu nutné.
3. Ověř prostředí (§4 instrukcí) a předlož plán **fáze 1** (`docs/plans/phase-1.md`).
4. Počkej na schválení.

---
---

# B) Specifikace

# BubbleVerse – specifikace návrhu

> **Stav:** schváleno · **Datum:** 2026-10-07 · **Platforma:** Windows 10 (22H2) a Windows 11

---

## 0. O co jde

BubbleVerse je launcher a automatizační nástroj pro Windows v podobě **živého světa bublin**.

- Bubliny tvoří strom: **main bubliny → složky → akční bubliny**.
- Hýbou se, mají fyziku a vzhled, který si nastavíš.
- Akční bubliny spouští **bublinové scripty** poskládané z bloků jako ve Scratchi.
- Ke všemu se dostaneš jen klávesnicí přes **vyhledávání**: `Ctrl+F` nebo globální zkratkou.
- Svět běží v okně aplikace přes všechny monitory a volitelně i jako **živá tapeta na ploše** pod ikonami.

**Pro koho:** veřejně pro všechny, s instalátorem. **Jazyk:** angličtina (výchozí) a čeština (volitelně).

**Úspěch znamená:**
- 200 bublin s efekty běží plynule (60 FPS) a ani 1000 bublin nesecká.
- Libovolnou akci jde spustit jen z klávesnice na pár úhozů.
- 30 bublin pro 30 programů vznikne jedním přetažením souborů.
- Tapeta na pozadí nezatěžuje počítač, když není vidět (0 % GPU).

---

## 1. Rozhodnutí v kostce

| Téma | Rozhodnutí |
|---|---|
| Technologie | Tauri 2 (jádro v Rustu) + TypeScript + Svelte 5 (UI) + PixiJS v8 (svět) + Blockly (editor bloků) |
| Vztah k ploše | Okno aplikace (prohlížení a úpravy) **a k tomu** živá tapeta pod ikonami plochy. Tapetu jde vypnout. |
| Tapeta | Jen zobrazení a `Ctrl+F`, na bubliny se na ploše neklikne |
| Okno aplikace | Bez rámečku přes všechny monitory, UI jen na hlavním monitoru |
| Plátno | Nekonečné (posun, zoom) |
| Podbubliny | U každé složky jde nastavit rozbaleno / sbaleno |
| Vyhledávání | `Ctrl+F` v aplikaci a na ploše + globální zkratka (kompaktní lišta). Hledá podle začátku jména, fuzzy jako záloha. Po spuštění akce se zavře. |
| Úpravy | Boční panel (inspektor), strom, undo/redo, kopírování, mřížka, šablony |
| Ukládání | Tlačítko **Uložit** + autosave konceptu |
| Sdílení | Export a import větví jako balíčky `.bubble` s bezpečnostním náhledem |
| Jazyk | EN výchozí, CZ volitelná |
| Podepsání aplikace certifikátem | **Ne** (důsledky v §16) |
| Jméno | **BubbleVerse** |

---

## 2. Povrchy a režimy

### 2.1 Okno aplikace
- Jedno okno bez rámečku přes **celou virtuální plochu**, tedy přes všechny monitory.
  - Ve výchozím stavu zakrývá i hlavní panel Windows. Jde to vypnout v nastavení Obecné.
- **Hlavní monitor** (vybírá se v nastavení) má UI. Vpravo nahoře jsou ikony:
  - 👁 rychlé přepínače zobrazení,
  - 🔨 edit mód,
  - ⚙️ nastavení.
- **Ostatní monitory** ukazují jen plátno, tedy pozadí světa a bubliny.
  - Svět je jeden, takže bublinu jde přetáhnout z monitoru na monitor.
- **Otevření a skrytí:**
  - otevřít jde zkratkou (výchozí `Ctrl+Alt+B`), přes tray ikonu nebo z nabídky Start,
  - skryté okno odejde do tray a jádro běží dál.

### 2.2 Tapeta na ploše
- Okno vložené do vrstvy plochy **pod ikony** (technika WorkerW) přes všechny monitory.
- Ukazuje **uloženou verzi** světa z **domovského pohledu**, který se nastavuje v edit módu.
- **Nereaguje na myš.** Kliknutí jdou normálně na plochu a na ikony.
- **`Ctrl+F` při aktivní ploše:**
  - nad ikonami se objeví vyhledávací pole, uprostřed dole na hlavním monitoru,
  - tapeta zešedne a kamera přibližuje jako v aplikaci (§6),
  - `Esc` nebo klik jinam hledání zavře a kamera se vrátí na domovský pohled.
- Tapetu jde vypnout v nastavení Obecné.
- Volba „Skrýt ikony plochy, když běží tapeta“ je ve výchozím stavu vypnutá.

### 2.3 Kompaktní lišta (globální hledání)
- Malé okno nad vším ostatním, třeba nad prohlížečem nebo hrou v okně. Vyvolá ho globální zkratka (výchozí `Alt+Space`).
- **Žádné bubliny:**
  - jen pole s nápovědou,
  - předchozí a další možnost,
  - červená cesta.
- Ovládání je stejné jako u vyhledávání (§6).
- Okno je předem připravené a skryté, takže se ukáže okamžitě.

### 2.4 Tray ikona
Nabídka:
- Otevřít BubbleVerse
- Hledat
- Tapeta zap/vyp
- Pozastavit animace
- Zastavit všechny scripty
- Nastavení
- Ukončit

### 2.5 Uživatelský mód (výchozí)
- Všechno se hýbe (cesty, oběžné dráhy, fyzika) a nic se nedá upravit.
- **Myš:**
  - klik na akční bublinu spustí její spouštěč „Po aktivaci“,
  - klik na složku ji rozbalí nebo sbalí,
  - kolečko zoomuje, tažení prázdného místa posouvá plátno,
  - `Home` vrátí domovský pohled.
- **👁 Rychlé přepínače:**
  - **Jména:** vždy / při najetí / nikdy.
  - **Skiny:** zap/vyp. Vypnuté = jen barevné bubliny bez obrázků a GIFů, rychlejší.
  - **Pohyb:** pauza.

### 2.6 Edit mód (🔨, `Ctrl+E`)
- Pohyb a fyzika se **zastaví**. Bubliny stojí na základních pozicích, aby šly přesně rozmístit.
- Tlačítko **▶ Náhled** pustí pohyb na zkoušku.
- Úpravy jdou do **konceptu**. Do uživatelského módu a na tapetu se dostanou až po **Uložit** (§4.7).

---

## 3. Bubliny

### 3.1 Hierarchie a typy
- **Main bubliny** jsou nejvyšší úroveň, třeba Apps, Games, Work, Weby, Ostatní.
- **Složka** obsahuje další bubliny: složky i akční, libovolně smíchané a do libovolné hloubky.
  - Má výchozí stav **rozbaleno / sbaleno**.
  - Sbalená se v uživatelském módu rozbalí kliknutím. Děti animovaně vyletí z rodiče a při sbalení se do něj zase schovají.
- **Akční bublina** má scripty (§5) a nemá děti.
  - Může mít víc scriptů, každý s jiným spouštěčem.
  - Akční bublina může být i na nejvyšší úrovni, třeba „Slunce“ ze sluneční soustavy.

### 3.2 Skin
| Vlastnost | Možnosti |
|---|---|
| Tvar | kruh, zaoblený čtverec, hexagon, hvězda, vlastní maska z PNG |
| Výplň | barva nebo gradient |
| Médium | žádné / ikona / obrázek / GIF / video (mp4, webm) / **auto-ikona** (z .exe nebo .lnk, ze Steamu nebo Epicu, favicon webu) |
| Efekty okraje | obrys, glow, stín, sklo (rozmazané pozadí), částice kolem bubliny |
| Velikost | průměr ve světových jednotkách |
| Jméno | barva, písmo, velikost, pozice (pod / uvnitř / nad) |

### 3.3 Dědění skinu
- Skin je buď **vlastní**, nebo **„stejný jako“**.
- Zdroj dědění jde vybrat: **rodič**, **nejvyšší předek** (main bublina) nebo **konkrétní předek**.
- Jednotlivé vlastnosti jde přepsat (*overrides*), třeba zdědit obrázek, ale mít vlastní barvu jména.
- Když se změní předek, změní se všechny bubliny, které z něj dědí.
- Totéž umí **výběr více bublin naráz**.

```
Aplikace (modrá) → Pracovní Aplikace (obrázek) → Práce 1 (gif) → Claude Code (skin = jako „Pracovní Aplikace“)
```

### 3.4 Uchycení
- **K rodiči:** pozice je relativní k rodiči a bublina jede s ním.
- **Ke světu:** bublina stojí tam, kam ji dáš. Rodič se může hýbat bez ní.
- Vlastní pohyb (§3.5) se v obou případech přičítá k základní pozici.

### 3.5 Pohyb
| Pohyb | Nastavení |
|---|---|
| **Cesta** | body + úchyty křivek (ostrý / hladký bod), smyčka nebo tam a zpět, rychlost, zrychlování (easing) |
| **Oběžná dráha** | střed = **libovolná bublina**, poloměry elipsy, natočení elipsy, rychlost, směr, počáteční fáze |
| **Bloudění** | oblast (kruh nebo obdélník), rychlost, plynulost |
| **Pulzování** | minimální a maximální velikost, perioda |
| **Rotace skinu** | konstantní nebo kyvadlová, rychlost, úhel |

**Pravidla**
- Bublina má **nejvýš jeden dráhový pohyb** (cestu, oběžnou dráhu nebo bloudění). K němu může mít libovolně pulzování a rotaci.
- Oběžné dráhy jdou **zanořovat**: měsíc obíhá planetu a planeta slunce.
- Editor nedovolí **cyklus**, například když A obíhá B a B obíhá A.
- Pohyby se počítají z času, takže jsou deterministické. Aplikace i tapeta ukazují bublinu na stejném místě.

**Příklad – sluneční soustava:** akční bublina „Slunce“ má jen scripty. Main složky „Apps“, „Games“ a „Work“ ho obíhají po elipsách. Kolem „Games“ obíhají jeho podsložky jako měsíce.

### 3.6 Fyzika (každá část zvlášť zap/vyp)
- **Plování:** amplituda a rychlost pohupování.
- **Kolize:** bubliny se odstrkují. Volba „jen se sourozenci / se všemi“.
- **Pružina k rodiči:** tuhost, tlumení, délka. Když se rodič pohne, děti se za ním houpavě táhnou.
- **Reakce na myš:** odpuzovat nebo přitahovat, síla, dosah. Funguje jen v okně aplikace.

Jak se to skládá: *cílová pozice = základ + pohyb*. Fyzika k ní bublinu táhne pružinou a přidává plování, kolize a reakci na myš.

### 3.7 Spojení s rodičem
- **Typy:**
  - žádné,
  - přímka,
  - blesk (animovaný),
  - lano / křivka (prověšené, houpe se),
  - tok částic (tečkovaná nebo čárkovaná čára s částicemi od rodiče k dítěti),
  - laser / paprsek (s glow),
  - řetěz (články, prověšený).
- **Vlastnosti:** barva, tloušťka, průhlednost a volba „jako rodič“ (dědění).

### 3.8 Hover a aktivace
- **Hover efekty:** zvětšení, zatřesení, záře, tooltip s cestou (`Apps | Work | Claude Code`).
- **Neuron efekt při spuštění:**
  - proběhne světelný puls po spojeních od main bubliny až ke spuštěné bublině a ta se rozzáří,
  - během běhu scriptu bublina jemně svítí,
  - při chybě červeně blikne,
  - když bublina nemá spojení, rozzáří se jen ona sama.

---

## 4. Edit mód

### 4.1 Rozložení obrazovky
```
┌──────────────────────────────────────────────────────────────────────┐
│ [Uložit] [Zahodit] [↶] [↷] [▶ Náhled] [# Mřížka]          👁  🔨  ⚙️ │
├───────────┬──────────────────────────────────────────┬───────────────┤
│ Strom     │                                          │ Inspektor     │
│ ▸ Apps    │                                          │ ▾ Základ      │
│ ▾ Games   │           plátno (svět bublin)           │ ▾ Skin        │
│   • CS2   │                                          │ ▸ Uchycení    │
│   • Mine… │                                          │ ▸ Pohyb       │
│ ▸ Work    │                                          │ ▸ Fyzika      │
│           │                                          │ ▸ Spojení     │
│           │                                          │ ▸ Hover       │
│           │                                          │ ▸ Akce        │
└───────────┴──────────────────────────────────────────┴───────────────┘
```
- **Strom** (vlevo, jde sbalit) ukazuje celou hierarchii. Tažením se mění rodič a pořadí, nahoře je hledání podle jména. *(Návrh navíc, usnadní práci s 200+ bublinami.)*
- **Inspektor** (vpravo) ukazuje vlastnosti vybrané bubliny ve sbalitelných sekcích.
  - Při výběru více bublin ukazuje společné vlastnosti. Rozdílné hodnoty jsou zobrazené jako „—“ a změna se zapíše všem vybraným.

### 4.2 Vytváření
- **Pravý klik na prázdné plátno:**
  - Nová main bublina (složka / akční)
  - Vložit
  - Hromadný generátor
  - Nastavit domovský pohled
- **Pravý klik na bublinu:**
  - Nová podbublina (složka / akční)
  - **Akce…** (otevře editor scriptů)
  - Nastavit cestu / oběžnou dráhu / oblast bloudění
  - Kopírovat skin / Vložit skin
  - Uložit jako šablonu
  - Duplikovat
  - Exportovat…
  - Smazat
- **Po vytvoření** vyskočí rychlé okénko:
  - **jméno** (kurzor je rovnou v něm), barva, ikona, šablona,
  - `Enter` = hotovo, podrobnosti pak v inspektoru.

### 4.3 Výběr a přesun
- **Výběr:** klik, `Ctrl`/`Shift` + klik, výběr obdélníkem, `Ctrl+A`.
- **Přesun:** tažením, i mezi monitory. Se zapnutou mřížkou se bublina přichytává a vodicí čáry ukazují zarovnání se sousedy.
- **Změna rodiče:** přetáhni bublinu se stisknutým `Alt` na složku, nebo ji přesuň ve Stromu.
- **Smazání:** u složky s dětmi chce potvrzení. Všechno jde vrátit přes Undo.

### 4.4 Editor cesty, oběžné dráhy a bloudění
- **Nastavit cestu:**
  - zbytek světa ztlumí,
  - klik přidá bod a tažením bodu vzniknou úchyty křivky,
  - dvojklik na bod přepne ostrý / hladký,
  - nastavuje se smyčka nebo tam a zpět, rychlost a easing,
  - **▶** cestu přehraje, `Enter` potvrdí, `Esc` zruší.
- **Nastavit oběžnou dráhu:**
  - klikneš na středovou bublinu,
  - tažením nastavíš poloměry a natočení elipsy,
  - rychlost, směr a fázi nastavíš v inspektoru.
- **Nastavit oblast bloudění:** nakreslíš kruh nebo obdélník.

### 4.5 Nástroje
- **Undo/Redo** (`Ctrl+Z` / `Ctrl+Y`), 200 kroků.
- **Kopírovat / Vložit / Duplikovat** (`Ctrl+C` / `Ctrl+V` / `Ctrl+D`): bubliny i celé větve včetně scriptů.
- **Mřížka a přichytávání** + vodicí čáry.
- **Šablony:**
  - uloží skin, uchycení, pohyb, fyziku, spojení, hover a scripty,
  - použít je jde při vytváření bubliny, v generátoru nebo přes „Použít šablonu“ na vybrané bubliny.
- **Kopírovat / Vložit skin** mezi bublinami.
- **Kontrola cest:** označí ⚠ akční bubliny, jejichž soubor neexistuje.

### 4.6 Hromadný generátor akčních bublin
**Zdroje:**
1. **Drag & drop:** přetáhneš soubory z Průzkumníku na složku-bublinu a otevře se předvyplněný generátor. Stačí dát `Enter`.
2. **Celá složka:** vybereš složku, filtr přípon (`.exe`, `.lnk`, `.zip`, …) a volbu „včetně podsložek“.
3. **Start menu / Steam / Epic:**
   - aplikace najde zástupce ve Start menu, aplikace z Microsoft Store, hry ze Steamu (spouští se přes `steam://rungameid/…`) a z Epicu (spouští se přes `com.epicgames.launcher://…`),
   - nabídne seznam se zaškrtávátky.
4. **Seznam webů:** vložíš URL, každou na samostatný řádek.

**Nastavení:**
| Krok | Volby |
|---|---|
| Kam | cílová složka-bublina |
| Jméno | šablona `{name}` (bez přípony, výchozí) / `{name}{ext}` / `{folder}` + předpona/přípona |
| Script | sdílený script (výchozí „Spustit soubor `{cesta}`“ nebo „Otevřít URL `{url}`“), případně jiný sdílený script s přiřazením parametru |
| Vzhled | šablona / dědit od rodiče / **auto-ikona** (výchozí zapnuto) |
| Rozložení | kruh kolem rodiče / mřížka / spirála |

Pak se ukáže **náhled**. **Vytvořit** udělá všechny bubliny jako jeden krok Undo.

### 4.7 Ukládání
- **Každá změna** jde do konceptu. **Autosave** proběhne 2 s po poslední změně.
- **Uložit (`Ctrl+S`):**
  - koncept se stane uloženou verzí,
  - projeví se v uživatelském módu a na tapetě,
  - spouštěče scriptů se zaregistrují znovu,
  - vytvoří se záloha.
- **Odchod z edit módu** s neuloženými změnami nabídne: Uložit / Zahodit koncept / Zůstat.
- **Po pádu nebo restartu** se aplikace zeptá: „Máš neuložený koncept z <čas>. Pokračovat / Zahodit“.

---

## 5. Bublinové scripty

### 5.1 Editor scriptů
Otevře se samostatné okno **„Bublinový script – Apps | Work | Claude Code“**. Jde zvětšit a přesunout na libovolný monitor.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Uložit] [▶ Test] [■ Stop] [⏭ Krok] [⏺ Nahrát makro] [⇄ Sdílený script]  │
├────────────────┬───────────────────────────────────────┬─────────────────┤
│ 🔍 hledat blok │                                       │ Parametry       │
│ ● Události     │                                       │ Opakované spušt.│
│ ● Ovládání     │       plocha pro skládání bloků       │ Platnost zkratky│
│ ● Zjišťování   │                                       │ Proměnné        │
│ ● Operátory    │                                       │                 │
│ ● …            │                                       │                 │
├────────────────┴───────────────────────────────────────┴─────────────────┤
│ Debug konzole                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```
- **Paleta vlevo:** bloky po barevných kategoriích. Nahoře je **vyhledávání bloků** podle anglických i českých názvů a klíčových slov.
- **Plocha:** bloky se na ni táhnou. Funguje `Ctrl+C`/`Ctrl+V`, undo, zoom a koš.
- **Víc scriptů:** jedna bublina jich může mít víc, každý s vlastním spouštěčem, jako víc „hat“ bloků ve Scratchi.
- **⏺ Nahrát makro** *(návrh navíc)*: nahraje klávesy a kliky myši i s pauzami a vygeneruje z nich bloky.
- **Nebezpečné bloky** mají štítek ⚠ (§5.6).
- **`Ctrl+F`** v editoru skočí do vyhledávání bloků.

### 5.2 Kategorie a bloky
⚠ = nebezpečný blok (§5.6).

#### 🟡 Události / spouštěče – `#FFBF00`
- **Po aktivaci:** klik v aplikaci nebo `Enter` ve vyhledávání.
- **Při stisku zkratky** `[kombinace]`. Platnost: **všude** (venkovní) / **jen v BubbleVerse** (vnitřní).
- **Každých** `[N] [s / min / h]`.
- **V čase** `[HH:MM]` ve dny `[Po–Ne]`.
- **Při startu** `[PC / BubbleVerse]`.
- **Při zprávě** `[zpráva]`.
- **Při spuštění procesu** `[název.exe]` / **Při ukončení procesu** `[název.exe]`.
- **Při změně aktivního okna.**
- **Při změně schránky.**
- **Při připojení / odpojení** `[USB zařízení / disku]`.
- **Při odemknutí PC** / **Při probuzení ze spánku.**
- **Při připojení / odpojení internetu.**
- Bloky, které script nespouští, ale zprávy posílají: **Vyslat zprávu** `[x]` · **Vyslat zprávu** `[x]` **a počkat**.

#### 🟠 Ovládání – `#FFAB19`
- **Počkej** `[N] [ms / s / min / h]`
- **Opakuj** `[N]×` · **Opakuj stále** · **Opakuj dokud** ⟨⟩
- **Pro každou položku** `[x]` **v seznamu** `[s]`
- **Když** ⟨⟩ **pak** · **Když** ⟨⟩ **pak / jinak**
- **Čekej dokud** ⟨⟩, volitelně s časovým limitem
- **Zkus / při chybě**, text chyby se uloží do proměnné
- **Zastav** `[tento script / ostatní scripty bubliny / všechny scripty]`

#### 🔵 Zjišťování (sensing) – `#5CB1D6`
- je stisknutá klávesa `[k]`? · pozice myši X / Y
- aktuální `[rok / měsíc / den / den v týdnu / hodina / minuta / sekunda]` · časové razítko
- běží proces `[x]`? · aktivní okno (název / proces)
- existuje soubor / složka `[cesta]`?
- je připojen internet? · baterie % · nabíjí se?
- nečinnost uživatele (s)
- barva pixelu na `[x, y]`
- počet monitorů · jméno uživatele · název PC
- odpověď (poslední odpověď z dialogu)
- stopky · vynuluj stopky

#### 🟢 Operátory – `#59C059`
- `+ − × ÷` · zbytek po dělení · zaokrouhli · `[abs / odmocnina / sin / cos / tan / log / …]` z
- náhodné číslo od `[a]` do `[b]`
- `< = > ≤ ≥ ≠` · a · nebo · ne
- spoj `[a] [b]` · znak `[N]` z · délka · obsahuje? · nahraď · rozděl podle · velká / malá písmena · ořízni mezery · shoda s regulárním výrazem
- převeď na číslo / text · formátuj datum `[formát]`

#### 🟧 Proměnné `#FF8C1A` a seznamy `#FF661A`
- Proměnné mají tři platnosti:
  - **script:** dočasná, platí jen během běhu,
  - **bublina:** uložená u bubliny,
  - **globální:** sdílená všemi bublinami a uložená i po restartu.
- nastav `[p]` na · změň `[p]` o
- seznamy: přidej · vlož na · smaž položku · smaž vše · položka `[N]` · délka · obsahuje? · index
- objekty (JSON): získej `[klíč]` · nastav `[klíč]`

#### 🔷 Systém a spouštění – `#4C97FF`
- ⚠ **Spustit soubor** `[cesta] [argumenty]`. Volby: jako správce (UAC), počkat na dokončení, skryté okno.
- **Otevřít URL** `[url]` ve výchozím nebo zvoleném prohlížeči.
- **Otevřít složku v Průzkumníku** `[cesta]`.
- ⚠ **CMD příkaz** `[…]`, výstup jde do proměnné, okno viditelné nebo skryté.
- ⚠ **PowerShell příkaz / script** `[…]`.
- **Zamknout PC** · ⚠ **Uspat / Restartovat / Vypnout**, s odpočtem a možností zrušit.
- **Hlasitost:** nastav / ztlum · **Média:** přehrát/pauza / další / předchozí.

#### 🟣 Okna a procesy – `#855CD6`
- ⚠ **Ukončit proces** `[x]`
- **Přepni na okno** `[název]` · minimalizuj / maximalizuj / obnov / zavři okno
- **Přesuň okno** na monitor `[N]` / na pozici `[x, y]` · **změň velikost**
- **Vždy navrchu** zap/vyp
- **Čekej na okno** `[název]`, s časovým limitem
- seznam běžících procesů

#### 🌸 Klávesnice a myš (makra) – `#E05297`
- ⚠ **Stiskni** `[kombinace]` · **Drž / Pusť** `[klávesa]`
- ⚠ **Napiš text** `[…]` (s rychlostí psaní)
- ⚠ **Klikni** `[levé / pravé / střední]` na `[x, y]` · **Dvojklik** · **Pohni myší** na `[x, y]` (plynule za N ms) · **Kolečko** `[N]`

#### 🟩 Soubory, schránka, web – `#0FBD8C`
- čti text ze souboru · ⚠ zapiš / připiš do souboru
- ⚠ kopíruj / přesuň / přejmenuj soubor · ⚠ smaž (do koše) · vytvoř složku
- seznam souborů ve složce `[filtr, včetně podsložek]`
- rozbal / zabal ZIP
- schránka: získej text / nastav text
- ⚠ **HTTP** `[GET / POST / PUT / DELETE] [url] [tělo] [hlavičky]` → odpověď · ⚠ stáhni soubor do `[cesta]`
- JSON: text → objekt / objekt → text

#### 💜 Bubliny a UI – `#9966FF`
- **Rozsviť bublinu** `[tato / cesta]` (neuron efekt)
- **Změň** `[barvu / skin / velikost]` bubliny `[…]`. Platí jen za běhu, po restartu se vrátí.
- **Ukaž / skryj bublinu** · **Přesuň bublinu** na `[x, y]` (za běhu)
- **Bublina řekne** `[text]` na `[N]` s (komiksová bublina jako ve Scratchi)
- **Aktivuj bublinu** `[cesta]`, spustí její „Po aktivaci“
- **Notifikace Windows** `[titulek] [text]`
- **Zeptej se** `[otázka]` → odpověď · dialog Ano/Ne · vyber soubor / složku
- **Přehraj zvuk** `[asset / soubor]` · **Přečti nahlas** `[text]` (hlas Windows)

#### 🩷 Vlastní bloky – `#FF6680`
- **Definuj blok** `[název]` s parametry (číslo / text / ano-ne). Pak se používá jako běžný blok.

### 5.3 Organizace scriptů
- **Sdílený script s parametry:**
  - script, třeba „Po aktivaci → Spustit soubor `{cesta}`“, žije v knihovně jen jednou,
  - bubliny na něj odkazují a každá má vlastní hodnoty parametrů,
  - když ho změníš, změní se u všech bublin,
  - tlačítko **⇄** převede vlastní script na sdílený a obráceně.
- **Vlastní bloky:** knihovna bloků složených z jiných bloků, použitelná ve všech scriptech.
- **Globální proměnné:** spravují se v okně Proměnné, kde jde vidět a měnit jejich aktuální hodnota.

### 5.4 Běh scriptů (runtime v jádru)
- Interpret běží v Rust jádru. Scripty tak fungují, i když je okno aplikace zavřené a tapeta vypnutá.
- Každý spuštěný script je lehká asynchronní úloha. **Počkej** nic neblokuje a čekat může klidně stovka scriptů najednou.
- **Pojistky:**
  - smyčka bez čekání se každých 10 000 kroků krátce uvolní (yield). Script běží dál, jen nezamrzne aplikace,
  - globální zkratka **Zastavit všechny scripty** (výchozí `Ctrl+Alt+Shift+S`).
- **Opakované spuštění**, když script ještě běží: **ignorovat** (výchozí) / restartovat / paralelně. Nastavuje se zvlášť pro každý script.
- **Zkratky** odchytává jádro (§8.6). Venkovní fungují všude, vnitřní jen když je aktivní okno BubbleVerse.
- **Změny vzhledu ze scriptu** (barva, skin, pozice) platí jen za běhu a neukládají se.
- **Spustit jako správce** vyvolá dotaz UAC při každém spuštění. BubbleVerse sám běží bez admin práv.

### 5.5 Debug
- Při otevřeném editoru se zvýrazňuje právě běžící blok.
- Konzole ukazuje výpisy, chyby (s cestou bubliny a blokem) a časy.
- Krokování (⏭) a zastavení (■).
- Seznam běžících scriptů s tlačítkem Zastavit (v nastavení i v tray).

### 5.6 Bezpečnost
- **Nebezpečné bloky:** spouštění souborů, CMD/PowerShell, makra kláves a myši, zápis, přesun a mazání souborů, HTTP a stahování, ukončení procesu, vypnutí nebo restart, spuštění jako správce.
- **Import balíčku** ukáže náhled (§9.4) s výpisem nebezpečných bloků u každé bubliny a chce potvrzení.
  - Nebezpečné bloky si aplikace zjišťuje **sama z obsahu scriptů**. Popisu v balíčku nevěří.

---

## 6. Vyhledávání

### 6.1 Kde funguje
| Místo | Vyvolání | Zobrazení |
|---|---|---|
| Okno aplikace | `Ctrl+F` | svět zešedne, kamera přibližuje, pole uprostřed dole na hlavním monitoru |
| Plocha (tapeta) | `Ctrl+F`, když je aktivní plocha | totéž na tapetě, pole je nad ikonami |
| Kdekoli | globální zkratka (výchozí `Alt+Space`) | kompaktní lišta bez bublin |
| Edit mód | `Ctrl+F` | totéž, ale `Enter` bublinu **nespustí**: vybere ji a přiblíží |

Všechna místa používají **jeden společný vyhledávací engine**.

### 6.2 Vzhled pole
```
                Louka | Složka | Kouzlo              ← červená cesta (u duplicit a v módu „:“)
  ┌────────────────────────────────────────────────┐
  │   Aplikace                                     │  ← předchozí možnost (tlumeně)
  │ ▸ Automatika | Mi▌necraft auto gui             │  ← aktuální řádek, šedé doplnění
  │   Minecraft servery                     2 / 5  │  ← další možnost (tlumeně) + počítadlo
  └────────────────────────────────────────────────┘
```
- Vždy je vidět **předchozí a další možnost** a počítadlo `aktuální / celkem`, nikdy ne celý seznam.

### 6.3 Úrovňový mód (výchozí)
- **Prázdné pole:** zvýrazní se všechny main bubliny, zbytek je šedý.
- **Psaní** filtruje bubliny aktuální úrovně.
  - Možnosti jsou seřazené podle abecedy. První z nich se šedě doplňuje (*ghost text*).
- **`↑` / `↓`** přepíná mezi možnostmi.
- **`TAB`** potvrdí aktuální možnost:
  - segment se zafixuje a přidá se ` | `,
  - ` | ` odděluje úrovně zleva doprava, od nadřazené k podřízené,
  - **bez `TAB` se o úroveň níž nepokračuje.**
- **`Enter`:**
  - na **akční** bublině ji spustí a hledání se zavře,
  - na **složce** dělá totéž co `TAB`.
- **`Backspace`** v prázdném segmentu smaže poslední ` | ` a vrátí tě o úroveň výš.
- **`Esc`** hledání zavře.
- **Sbalené složky:** hledání vidí i do nich. Po výběru se dočasně rozbalí a po zavření hledání se zase sbalí.

### 6.4 Shoda textu
- Nejdřív se hledá podle **začátku jména**. Když nic nesedí, použije se **fuzzy záloha**, takže třeba `mcgui` najde „Minecraft auto gui“.
- Velká a malá písmena ani **diakritika** nehrají roli, `aplikace` najde „Aplikáce“.
- Volitelně jde v nastavení zapnout řazení podle četnosti použití. Výchozí je abeceda.

### 6.5 Kamera a zvýraznění
- Při otevření vše zešedne (světle, „neaktivní“).
- Možnosti aktuální úrovně se vybarví. Potvrzená cesta má zvýrazněný okraj.
- Po každém potvrzení se kamera plynule přiblíží, aby byla vidět **vybraná bublina a její přímé děti** s okrajem.
  - *Příklad:* bubliny jsou mezi `[-5;5]` a `[5;-5]`, takže výřez bude `[-6;6]` až `[6;-6]`.
- Po zavření se kamera vrátí na původní (nebo domovský) pohled.

### 6.6 Historie
- Po otevření je šedě **poslední příkaz**.
- Když je pole prázdné, `↑` / `↓` listuje historií (posledních 50 položek).
- **`TAB`** příkaz vypíše celý a **`Enter`** ho spustí.

### 6.7 Globální mód (`:`)
- `:` na začátku hledá ve **všech** bublinách, ve složkách i akčních.
- Když mají dvě bubliny **stejné jméno**, nad polem se u aktuální možnosti **červeně** ukáže její cesta:
  - `House | Website | Kouzlo`
  - `Louka | Složka | Kouzlo`
- Předchozí a další možnost mají cestu menším tlumeným červeným písmem.
- Když potvrdíš **složku**, přepneš se do úrovňového módu uvnitř ní. Pole pak ukazuje `Louka | Složka | `.

---

## 7. Nastavení (⚙️)

### 7.1 Obecné
- spouštět po startu Windows
- tapeta na ploše zap/vyp · skrýt ikony plochy, když běží tapeta
- jazyk: English / Čeština
- hlavní monitor
- okno aplikace přes hlavní panel Windows ano/ne
- chování zavření: skrýt do tray / ukončit
- kontrola aktualizací

### 7.2 Vzhled
- **Theme:**
  - **Světlý**,
  - **Tmavý**,
  - **OpiKula style** (červená, černá a jejich odstíny),
  - **Vlastní**.
- **Vlastní:** editor všech barevných tokenů s živým náhledem. Theme jde exportovat a importovat jako soubor `.bvtheme`.
  - **Tokeny:**
    - pozadí aplikace, panely, lišty, okénka (dialogy),
    - text primární / sekundární / tlumený, akcent,
    - okraje, vstupní pole, tlačítka (normální / hover / stisknuté),
    - šednutí při hledání, ghost text, červená cesta,
    - výběr v edit módu, mřížka, vodicí čáry, zvýraznění,
    - chyba / varování / úspěch,
    - tooltip, scrollbar.
- **Scale GUI:** 50–200 %.
- **Písmo**, **zaoblení rohů** a **průhlednost panelů** (efekt skla).

**Navržená paleta OpiKula style:**
| Token | Barva |
|---|---|
| pozadí | `#0B0B0D` |
| panely | `#1A1A1F` |
| tmavá červená | `#7A0E14` |
| akcent (červená) | `#D7192A` |
| světlá červená (hover) | `#FF4D5A` |
| text | `#F2F2F2` |

### 7.3 Zkratky
- Seznam všech akcí s nastavitelnou zkratkou. U každé zkratky je:
  - **platnost:** v aplikaci / globální,
  - **„přebít zkratku Windows“** (funguje, když je BubbleVerse aktivní).
- **Upozornění na kolize:** mezi zkratkami navzájem a se známými zkratkami Windows.
- Zkratky ze scriptů bublin jsou ve stejném seznamu, s odkazem na bublinu. Všechno je tak na jednom místě.
- `Ctrl+Alt+Del` a `Win+L` přebít nejde, Windows to nedovolí nikomu.

### 7.4 Výkon
- Limit FPS:
  - aplikace 30 / 60 / 120 / frekvence monitoru (výchozí 60),
  - tapeta 15 / 30 / 60 (výchozí 30).
- Kvalita efektů: nízká / střední / vysoká.
- Max. počet současně přehrávaných videí (výchozí 8).
- **Auto-pauza** při:
  - hře nebo aplikaci na celou obrazovku,
  - maximalizovaném okně přes plochu,
  - úsporném režimu baterie,
  - zamčené obrazovce.
- Od jakého zoomu se bubliny zjednoduší (§10).
- Grafické API: automaticky / WebGPU / WebGL.
- Ukazatel FPS a zátěže.

### 7.5 Data a zálohy
- umístění dat
- automatické zálohy: počet (výchozí 10), při každém uložení
- obnovit ze zálohy
- export / import celého světa
- vyčistit nepoužité assety · velikost dat

### 7.6 Pozadí světa
- barva / gradient / obrázek / video / tapeta z Windows
- animované hvězdy · paralaxa (pozadí se posouvá pomaleji než bubliny) · mřížka
- volba „stejné pro aplikaci i tapetu“ nebo zvlášť

### 7.7 Zvuky
- zvuky UI zap/vyp · zvuk aktivace bubliny · hlasitost
- vlastní zvuky (assety)
- ztlumit, když běží hra na celou obrazovku

---

## 8. Architektura

### 8.1 Technologie
| Vrstva | Technologie |
|---|---|
| Aplikační rámec | **Tauri 2** (okna, IPC, instalátor NSIS, updater) |
| Jádro | **Rust**: `windows` (Win32 API), `rusqlite`, `rmp-serde` (MessagePack), `zstd`, `tokio`, `reqwest`, `zip`, `image` + `webp-animation` |
| UI | **Svelte 5** + **TypeScript** + Vite |
| Svět | **PixiJS v8** (WebGL2, případně WebGPU) |
| Editor bloků | **Blockly** |
| Fuzzy hledání | vlastní implementace (bodování podsekvencí) |
| Překlady | soubory `en.json` / `cs.json` |

### 8.2 Procesy a okna
```
┌──────────── BubbleVerse Core (Rust, běží pořád, ikona v tray) ────────────┐
│  Úložiště (SQLite + assety)    Běh scriptů       Windows vrstva            │
│  Nastavení, zkratky            Spouštěče         klávesy, tapeta, procesy  │
└───────▲────────────────────────────▲──────────────────────────▲───────────┘
        │ IPC                        │ IPC                      │ IPC
┌───────┴──────────┐      ┌──────────┴─────────┐      ┌─────────┴─────────┐
│ Okno aplikace    │      │ Tapeta na ploše    │      │ Kompaktní lišta   │
│ přes všechny     │      │ pod ikonami,       │      │ + pole hledání    │
│ monitory: svět + │      │ přes všechny       │      │ na ploše          │
│ UI + edit mód    │      │ monitory, jen      │      │                   │
│                  │      │ zobrazení          │      │                   │
└──────────────────┘      └────────────────────┘      └───────────────────┘
         + okno editoru scriptů (otevírá se na vyžádání)
```
- **Jádro** je jediný trvale běžící proces. Drží uloženou verzi světa, nastavení a proměnné, pouští scripty a registruje spouštěče a zkratky.
- **V jednu chvíli kreslí svět jen jedno okno.** Když je otevřené okno aplikace, tapeta se uspí, protože je zakrytá.
- **Pohyb a fyziku** počítá okno, které svět kreslí (TypeScript). **Scripty** běží v jádru.

### 8.3 Struktura repozitáře
```
bubbleverse/
├─ src-tauri/                 # Rust jádro
│  └─ src/
│     ├─ app/                 # stav aplikace, IPC příkazy, tray, autostart
│     ├─ storage/             # SQLite, assety, zálohy, export/import .bubble
│     ├─ script/              # formát, interpret, spouštěče, bloky (modul pro každou kategorii)
│     └─ os/                  # Win32: tapeta, monitory, klávesové hooky, procesy, okna, input, ikony
├─ packages/
│  ├─ world/                  # TS: model světa, simulace (pohyb, fyzika), vykreslení PixiJS
│  ├─ search/                 # TS: vyhledávací engine (bez UI)
│  ├─ blocks/                 # katalog bloků + převod Blockly ↔ zhuštěný formát
│  └─ ui/                     # TS: theme, překlady, sdílené komponenty
└─ apps/
   ├─ main/                   # okno aplikace (uživatelský mód, edit mód, inspektor, nastavení)
   ├─ script-editor/          # okno editoru scriptů (Blockly)
   ├─ wallpaper/              # tapeta
   └─ searchbar/              # kompaktní lišta + pole hledání na ploše
```
**Katalog bloků** (`packages/blocks/catalog.yaml`) je **jediný zdroj pravdy**. Pro každý blok obsahuje:
- číslo bloku (*opcode*),
- kategorii,
- vstupy,
- názvy EN/CZ,
- příznak ⚠.

Z katalogu se generují definice pro Blockly (TypeScript) i výčet bloků pro interpret (Rust). Obě strany se tak nemůžou rozejít.

### 8.4 Komunikace
- **Okno → jádro:**
  - změny konceptu (průběžně, kvůli autosave),
  - Uložit,
  - „bublina aktivována“,
  - požadavky typu vyber soubor nebo ikona z .exe.
- **Jádro → okna:**
  - nová uložená verze světa,
  - události ze scriptů (rozsviť, změň vzhled, „řekne“),
  - stav pauzy,
  - otevření hledání.
- **Koncept** drží při editaci okno aplikace. Jádro drží uloženou verzi, protože ji potřebuje pro scripty a spouštěče.

### 8.5 Multi-monitor a DPI
- **Jednotky světa:** 1 světová jednotka = 1 logický pixel při zoomu 1.
- **Výřez kamery:** okno aplikace i tapeta pokrývají celou virtuální plochu. Každý monitor má **vlastní výřez kamery** se svým škálováním, takže velikosti sedí i při kombinaci 100 % + 150 %.
- **Jedna kamera:** je vztažená k hlavnímu monitoru. Ostatní monitory ukazují navazující část roviny podle fyzického rozložení monitorů.
- **Škálování UI:** WebView2 má pevně nastavené škálování podle hlavního monitoru, aby bylo UI na hlavním monitoru vždy ostré.
- **Změna monitorů** (připojení, odpojení, změna DPI) přepočítá rozložení za běhu.
  - Bubliny z odpojeného monitoru zůstávají ve světě, jen nejsou vidět.
  - UI se přesune na nový hlavní monitor.

### 8.6 Windows vrstva
- **Tapeta:** okno se vloží do WorkerW za ikony plochy, stejný postup jako u Lively Wallpaper.
- **Detekce `Ctrl+F` na ploše:** low-level klávesový hook pozná, že je aktivní plocha (Progman / WorkerW / SHELLDLL_DefView). Zkratku pohltí a otevře pole hledání nad ikonami.
- **Zkratky:**
  - low-level klávesový hook běží ve vlastním vlákně,
  - venkovní zkratky platí vždy, vnitřní jen když je v popředí okno BubbleVerse,
  - „přebít Windows“ znamená, že hook kombinaci pohltí dřív, než ji dostane Windows.
- **Auto-pauza:**
  - detekce aplikace na celou obrazovku (`SHQueryUserNotificationState`),
  - pokrytí plochy okny,
  - stav napájení,
  - zamčení relace.
- **Ikony:**
  - `.exe` a `.lnk` přes Shell API (256 px),
  - Steam z mezipaměti knihovny,
  - favicon stažený přímo z daného webu.

---

## 9. Data a ukládání

### 9.1 Datový model
```ts
type BubbleId = string;              // krátké ULID
type AssetHash = string;             // otisk obsahu souboru

interface World {
  version: number;                   // verze formátu (migrace)
  bubbles: Bubble[];                 // plochý seznam, strom přes parentId
  sharedScripts: SharedScript[];
  customBlocks: CustomBlock[];
  templates: Template[];
  globals: VariableDef[];
  homeView: { x: number; y: number; zoom: number };
}

interface Bubble {
  id: BubbleId;
  parentId: BubbleId | null;         // null = main úroveň
  kind: 'folder' | 'action';
  name: string;
  order: number;
  expanded?: boolean;                // jen složky: výchozí stav
  position: Vec2;                    // vůči rodiči (attach 'parent') nebo ve světě
  attach: 'parent' | 'world';
  skin: SkinRef;
  motion: { track?: PathMotion | OrbitMotion | WanderMotion; pulse?: Pulse; spin?: Spin };  // track = max. 1 dráhový pohyb
  physics: { float?: Float; collide?: Collide; spring?: Spring; mouse?: MouseReact };
  link: Link;                        // spojení s rodičem
  hover: HoverFx;
  showName?: 'inherit' | 'always' | 'hover' | 'never';
  scripts: ScriptSlot[];             // jen akční bubliny
}

type SkinRef =
  | { mode: 'own'; skin: Skin }
  | { mode: 'inherit'; from: 'parent' | 'root' | { ancestor: BubbleId }; overrides?: Partial<Skin> };

interface Skin {
  shape: 'circle' | 'rounded' | 'hexagon' | 'star' | { mask: AssetHash };
  size: number;
  fill: Color | Gradient;
  media?: { type: 'icon' | 'image' | 'gif' | 'video'; asset: AssetHash }
        | { type: 'auto'; source: 'exe' | 'steam' | 'epic' | 'favicon' };
  edge?: { outline?: Outline; glow?: Glow; shadow?: Shadow; glass?: boolean; particles?: Particles };
  label?: LabelStyle;
}

interface OrbitMotion { type: 'orbit'; center: BubbleId; rx: number; ry: number; tilt: number;
                        speed: number; dir: 'cw' | 'ccw'; phase: number }

type ScriptSlot =
  | { kind: 'inline'; script: Script }
  | { kind: 'shared'; ref: string; params: Record<string, Value> };
```

### 9.2 Úložiště
```
%APPDATA%\BubbleVerse\
├─ data.db          # SQLite (WAL)
│                   #  • world: 'draft' (koncept) a 'published' (uložená verze)
│                   #    každý jako jeden dokument MessagePack + zstd
│                   #  • settings, globals (proměnné), search_history (50), script_layouts
├─ assets\ab\abcd….webp   # soubory pojmenované podle otisku → deduplikace
└─ backups\         # posledních N uložených verzí (bez kopií assetů)
```
- **Uložit** zkopíruje `draft` do `published` v jedné transakci, takže se nic nepoškodí ani při pádu.
- **Assety:**
  - PNG a JPG se převedou na WebP, GIF na animovaný WebP,
  - u videa se kontroluje rozlišení a velikost a velké soubory dostanou upozornění,
  - nepoužité assety se po uložení samy smažou (zálohy je drží, dokud existují).
- **Odhad velikosti:** 200 bublin bez médií zabere řádově desítky kB.

### 9.3 Zhuštěný formát scriptů
- Script = `{ v: 1, trigger: Node, body: Node[], runMode }`.
- Node = `[opcode, …argumenty]`. Argument je literál, další Node nebo seznam Node.
- Rozmístění bloků v editoru (souřadnice) je **zvlášť** v `script_layouts` a pro běh se nenačítá.
- Script „Po aktivaci → Spustit soubor `{cesta}`“ zabere zhruba 20–40 B.
- U sdíleného scriptu si bublina pamatuje jen hodnoty parametrů.
- Převod Blockly ↔ zhuštěný formát je obousměrný a testuje se, že se nic neztratí (§12).

### 9.4 Export a import (`.bubble`)
```
moje-bubliny.bubble (ZIP)
├─ manifest.json    # verze formátu a aplikace, název, kořenová bublina, seznam assetů
├─ branch.bin       # větev bublin + použité sdílené scripty, vlastní bloky, definice proměnných
└─ assets\          # jen použité soubory
```
- **Export:** pravým tlačítkem na bublinu → Exportovat… Uloží se celá větev, nebo celý svět z nastavení Data.
- **Import** otevře okno s náhledem:
  1. **strom** importovaných bublin,
  2. **⚠ nebezpečné bloky** u každé bubliny (zjištěné z obsahu, §5.6),
  3. **neexistující cesty**, třeba `C:\Users\někdo-jiný\…`, s hromadným **najít a nahradit**,
  4. **kam vložit:** jako main bublinu, nebo pod vybranou složku.
- **Při importu:**
  - id se přečíslují,
  - stejné sdílené scripty a assety se nezdvojí,
  - import proběhne celý, nebo vůbec (transakce).

---

## 10. Výkon

### 10.1 Techniky
- **Dávkové kreslení:** statické ikony jsou ve společném atlasu textur, takže grafika dostane jen pár příkazů za snímek.
- **Ořez:** co není vidět, nekreslí se. GIFy a videa mimo obrazovku se pozastaví.
- **Detail podle zoomu:**
  - zdálky jsou bubliny barevné kuličky bez textu a efektů,
  - zblízka mají celý skin.
- **Animovaná média:**
  - GIF se dekóduje jednou na pozadí,
  - stejný GIF u více bublin má jedno společné přehrávání,
  - souběžně hraje nejvýš N videí, ostatní ukazují první snímek.
- **Efekty:**
  - glow a stín jsou předpočítané textury, žádné drahé filtry každý snímek,
  - blesk se překresluje zhruba 20× za sekundu,
  - částice se recyklují.
- **Fyzika:** pevný krok simulace a mřížka pro kolize, takže se neporovnává každá bublina s každou.
- **Klid = 0 FPS:** když se nic nehýbe, nekreslí se.
- **Limit FPS a auto-pauza** podle §7.4.

### 10.2 Cíle
Měří se na referenčním PC: notebook s integrovanou grafikou (Intel Iris Xe / AMD Radeon 680M), 16 GB RAM, monitory 1080p + 1440p.

| Scéna | Cíl |
|---|---|
| 200 bublin, mix GIF / video / efekty, okno aplikace | ≥ 60 FPS (snímek ≤ 16 ms) |
| 1000 bublin, okno aplikace | ≥ 45 FPS bez záseků |
| Tapeta, nic se nehýbe | ~0 % GPU, < 1 % CPU |
| Tapeta zakrytá / běží hra | pozastaveno, 0 % GPU |
| Paměť (jádro + jedno okno světa) | ≤ 300 MB |
| Otevření globálního hledání | ≤ 100 ms od stisku |
| Tapeta po přihlášení do Windows | viditelná do 3 s |

---

## 11. Chyby a odolnost

| Situace | Chování |
|---|---|
| Chyba v bloku | Script se zastaví, pokud chybu nezachytí blok *Zkus*. Bublina červeně blikne a chyba jde do debug konzole s cestou bubliny a blokem. |
| Spouštěný soubor neexistuje | Chyba „Soubor nenalezen“. V edit módu má bublina ⚠ (kontrola cest při načtení). |
| Poškozená databáze | Při startu proběhne kontrola integrity. Při chybě se nabídne obnova z poslední zálohy. |
| Pád okna (WebView) | Jádro okno znovu vytvoří, koncept zůstane díky autosave. |
| Tapetu nejde vložit pod ikony | Záloha: snímek světa se nastaví jako obyčejná tapeta Windows a v nastavení se zobrazí upozornění. |
| Zkratku používá jiný program | Kolize se zobrazí v nastavení Zkratky. |
| Neplatný balíček při importu | Hláška s důvodem a nic se neimportuje. |
| Změna monitorů nebo DPI | Rozložení se přepočítá za běhu (§8.5). |
| Nekonečná smyčka ve scriptu | Automatické uvolňování (§5.4), aplikace nezamrzne. Script jde ukončit zkratkou Zastavit všechny scripty nebo v seznamu běžících scriptů. |

---

## 12. Testování
- **Rust (unit testy):**
  - každý blok interpretu,
  - kódování a dekódování formátu tam a zpět,
  - spouštěče (čas, zprávy),
  - zjišťování nebezpečných bloků,
  - export a import tam a zpět,
  - migrace verzí.
- **TypeScript (unit testy):**
  - převod Blockly ↔ zhuštěný formát tam a zpět,
  - vyhledávací engine (začátek jména, fuzzy, diakritika, duplicity, historie, `:`),
  - dědění skinu,
  - výpočet pohybu v čase *t* (cesta, oběžná dráha, zanoření, odhalení cyklu).
- **End-to-end** (`tauri-driver` + WebdriverIO):
  - vytvořit bublinu → uložit → najít přes `Ctrl+F` → spustit,
  - hromadný generátor,
  - import s varováním.
- **Výkonové testy:** scény s 200 a 1000 bublinami, měření FPS a délky snímku proti cílům z §10.2.
- **Ruční checklist pro vydání:**
  - Windows 10 a 11,
  - 1 / 2 / 3 monitory s různým DPI,
  - tapeta pod ikonami,
  - pauza při hře na celou obrazovku,
  - čistá instalace a aktualizace.

---

## 13. Fáze vývoje
Každá fáze končí použitelnou aplikací.

| # | Fáze | Obsah | Hotovo, když… |
|---|---|---|---|
| 1 | **Základ + launcher** | projekt a repozitář, jádro s tray a autostartem, SQLite a assety, okno přes všechny monitory s výřezy kamery, nekonečné plátno, složky a akční bubliny, barva / ikona / obrázek, **dědění skinu**, přímka, rozbalit/sbalit, edit mód (strom, inspektor, vytváření, výběr, přesun, undo/redo, kopírování, mřížka, Uložit + autosave), jednoduchá akce „Spustit soubor / Otevřít URL“, EN/CZ, světlý a tmavý theme, nastavení Obecné | na 2 monitorech jde vytvořit strom o 3 úrovních, přetáhnout bublinu mezi monitory, uložit, restartovat PC a po startu kliknutím spustit program |
| 2 | **Vyhledávání** | celé §6, globální zkratka a kompaktní lišta, editor zkratek (přebíjení Windows, kolize) | jen klávesnicí jde z aplikace i z jiného programu najít a spustit akci 3 úrovně hluboko. Historie, `:` a duplicity fungují podle §6. |
| 3 | **Tapeta** | vrstva pod ikonami, `Ctrl+F` na ploše, auto-pauza, nastavení Výkon, záložní statická tapeta | bubliny jsou pod ikonami na všech monitorech, `Ctrl+F` na ploše funguje a při hře na celou obrazovku BubbleVerse nezatěžuje GPU |
| 4 | **Scripty** | editor scriptů (Blockly), katalog bloků, interpret v Rustu, všechny spouštěče a kategorie z §5.2, sdílené scripty, vlastní bloky, proměnné, debug, neuron efekt, nahrávání maker. Jednoduché akce z fáze 1 se automaticky převedou na sdílené scripty. | sdílený script pro 30 bublin, časovač, venkovní a vnitřní zkratka, broadcast i CMD blok fungují. Debug ukazuje běžící blok. |
| 5 | **Hromadně a sdílení** | hromadný generátor (všechny 4 zdroje), auto-ikony, šablony, export/import `.bubble` s náhledem, zálohy a nastavení Data | přetažením 30 `.exe` vznikne 30 bublin s ikonami a jmény. Větev exportovaná na jiném PC se importuje s varováním a opravou cest. |
| 6 | **Pohyb a efekty** | fyzika, editory cesty / oběžné dráhy / bloudění, pulzování, rotace, hover, všechna spojení, GIF a video, tvary, efekty okraje, zjednodušování podle zoomu | sluneční soustava z §3.5 běží a scéna s 200 bublinami splní cíle z §10.2 |
| 7 | **Dokončení a vydání** | OpiKula style a vlastní theme, scale GUI, pozadí světa, zvuky, instalátor NSIS, auto-update (GitHub Releases), výkonové testy, ruční checklist | čistá instalace na Windows 10 i 11 projde checklistem z §12 |

---

## 14. Výchozí hodnoty (dají se změnit)
| Co | Výchozí hodnota |
|---|---|
| Otevřít / skrýt aplikaci | `Ctrl+Alt+B` |
| Hledání v aplikaci a na ploše | `Ctrl+F` |
| Globální hledání | `Alt+Space` (koliduje s nabídkou okna Windows a s PowerToys Run, BubbleVerse ji přebije) |
| Edit mód | `Ctrl+E` |
| Uložit | `Ctrl+S` |
| Zastavit všechny scripty | `Ctrl+Alt+Shift+S` |
| Domovský pohled | `Home` |
| FPS aplikace / tapety | 60 / 30 |
| Max. současných videí | 8 |
| Kroky Undo | 200 |
| Historie hledání | 50 |
| Zálohy | 10 posledních |
| Autosave konceptu | 2 s po poslední změně |
| Okno aplikace přes hlavní panel Windows | ano |
| Opakované spuštění běžícího scriptu | ignorovat |
| Řazení ve vyhledávání | abecedně |

---

## 15. Mimo rozsah (verze 1)
- macOS a Linux
- cloudová synchronizace a uživatelské účty
- online galerie balíčků bublin (sdílí se jen soubory `.bubble`)
- **podepsání aplikace certifikátem** (rozhodnutí, viz §16)
- klikání na bubliny přímo na tapetě (na ploše je jen zobrazení a `Ctrl+F`)
- scripty na složkách (scripty mají jen akční bubliny)
- reakce bublin na myš na tapetě

---

## 16. Rizika
| Riziko | Dopad | Co s tím |
|---|---|---|
| **Aplikace není podepsaná certifikátem** | Při instalaci se ukáže varování SmartScreen „Windows ochránil váš počítač“ a pokračuje se přes *Další informace → Přesto spustit*. Antivirus může hlásit planý poplach kvůli klávesovému hooku a makrům. | Vydávat na GitHubu se SHA-256 otiskem souborů, planý poplach nahlásit Microsoft Defenderu a dalším antivirům, nepoužívat packery (UPX), zveřejnit zdrojový kód pro důvěru. Aktualizace se přesto ověřují **bezplatným klíčem Tauri updateru**. To není podepsání aplikace certifikátem, jen ochrana proti podvržené aktualizaci. |
| Trik s WorkerW není oficiálně podporovaný | Aktualizace Windows může tapetu rozbít. | Záloha se statickou tapetou (§11), sledovat řešení v projektu Lively Wallpaper. |
| Okna spuštěná jako správce | Neadmin aplikace nemůže posílat klávesy a kliky do admin oken (ochrana UIPI), takže makra tam nefungují. | Upozornění v nápovědě, volitelně „Spustit BubbleVerse jako správce“ v nastavení Obecné. |
| Makra ve hrách | Můžou porušovat pravidla her nebo spustit anti-cheat. | Upozornění v nápovědě, odpovědnost nese uživatel. |
| Pomalý klávesový hook | Windows pomalý hook sám odpojí a zkratky přestanou fungovat. | Hook běží ve vlastním vlákně a jen předává události dál. Když ho Windows odpojí, jádro ho samo znovu připojí. |
| Různé DPI monitorů v jednom okně | Rozmazané UI nebo nesedící velikosti. | Výřez kamery pro každý monitor a pevné škálování WebView2 podle hlavního monitoru (§8.5). |
