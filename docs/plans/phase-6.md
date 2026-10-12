# Fáze 6 – Pohyb a efekty

> Zdroj pravdy: `BubbleVerse-spec.md` §3.2, §3.5–3.8, §4.4, §10, §13 (řádek 6).
>
> **Hotovo, když:** sluneční soustava z §3.5 běží a scéna s 200 bublinami splní cíle z §10.2.

Hotové už dřív: výpočet pohybů (cesta, oběžná dráha, bloudění, pulzování, rotace) z času, fyzika
(plování, kolize, pružina, myš), inspektor Pohyb a Fyzika, hover (zvětšení, zatřesení, záře, tooltip),
neuron efekt, zjednodušení podle zoomu, ořez, klid = 0 FPS.

| # | Úkol | Soubory | Ověření |
|---|---|---|---|
| 1 | Spojení: přímka, blesk (~20× za s), lano, tok částic, laser, řetěz | `packages/world/src/render/links.ts` | A: testy geometrie; R |
| 2 | Efekty okraje: glow, sklo, částice kolem bubliny | `render/effects.ts`, `render/textures.ts` | R |
| 3 | GIF a video: jedno přehrávání na asset a tvar, GIF dekódovaný jednou, nejvýš N videí, mimo obrazovku pauza | `render/media.ts` | R |
| 4 | Editory na plátně: cesta (body, úchyty, ostrý/hladký, ▶, Enter/Esc), oběžná dráha (střed kliknutím, poloměry, natočení, bez cyklů), bloudění (kruh/obdélník) | `apps/main/src/edit/motion/**` | A: testy cyklů a úprav; R |
| 5 | Sluneční soustava jako testovací scéna, měření výkonu 200 a 1000 bublin | `packages/world/src/dev/**` | R přes CDP |
| 6 | Dokumentace, ruční checklist | `docs/**` | – |

A = automatický test, R = ruční ověření v aplikaci.
