# Fáze 2 – Vyhledávání

> Zdroj pravdy: `BubbleVerse-spec.md` §6, §2.3, §7.3, §13 (řádek 2).
>
> **Hotovo, když:** jen klávesnicí jde z aplikace i z jiného programu najít a spustit akci 3 úrovně
> hluboko. Historie, `:` a duplicity fungují podle §6.

| # | Úkol | Soubory | Ověření |
|---|---|---|---|
| 1 | Vyhledávací engine: začátek jména, fuzzy záloha, diakritika, úrovně (`TAB`, `Enter`, `Backspace`), předchozí/další, ghost text, počítadlo, `:` globální mód, červená cesta u duplicit, historie 50, řazení podle četnosti, sbalené složky | `packages/search/src/**` | A: unit testy (TDD) |
| 2 | Pole hledání (sdílená komponenta) | `packages/ui/src/components/SearchField.svelte` | R |
| 3 | `Ctrl+F` v aplikaci: zešednutí, zvýraznění, kamera na vybranou bublinu a děti, dočasné rozbalení, návrat kamery; v edit módu `Enter` vybere | `apps/main/src/search/**` | A: e2e přes CDP; R |
| 4 | Low-level klávesový hook ve vlastním vlákně: venkovní / vnitřní platnost, přebití Windows, potlačení Alt/Win menu, znovupřipojení | `src-tauri/src/os/hook.rs`, `app/shortcuts.rs` | A: testy parsování a shody kombinací; R |
| 5 | Kompaktní lišta: předem vytvořené skryté okno nad vším, globální zkratka `Alt+Space`, převzetí fokusu | `apps/searchbar/**`, `src-tauri/src/app/search.rs` | R: do 100 ms |
| 6 | Nastavení Zkratky: seznam akcí, platnost, přebít Windows, zachytávání kombinace, kolize navzájem a se zkratkami Windows; řazení hledání podle četnosti | `apps/main/src/settings/ShortcutsTab.svelte`, `packages/ui/src/shortcuts.ts` | A: testy kolizí; R |
| 7 | Uzavření: testy, PROGRESS, DECISIONS | `docs/**` | A |
