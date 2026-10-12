/**
 * Finds UI texts and colors written directly into Svelte/CSS files (AI prompt §5.1):
 * texts must go through i18n keys, colors through theme tokens (CSS variables).
 */

export interface Finding {
  line: number;
  kind: 'text' | 'color';
  snippet: string;
}

const LETTER = /\p{L}/u;
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const TEXT_ATTRS = /\b(title|placeholder|aria-label|alt|label)="([^"{}]*)"/g;

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

/** Blanks a range with spaces but keeps newlines, so line numbers stay right. */
function blank(s: string): string {
  return s.replace(/[^\n]/g, ' ');
}

export function checkSvelte(src: string): Finding[] {
  const out: Finding[] = [];
  // Styles: no color literals.
  for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = m[1] ?? '';
    const base = (m.index ?? 0) + m[0].indexOf(css);
    for (const c of checkCss(css)) out.push({ ...c, line: lineOf(src, base) + c.line - 1 });
  }
  // Markup: remove script, style, comments and {expressions}.
  let markup = src
    .replace(/<script[\s\S]*?<\/script>/g, blank)
    .replace(/<style[\s\S]*?<\/style>/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
  markup = stripBraces(markup);
  for (const m of markup.matchAll(TEXT_ATTRS)) {
    if (LETTER.test(m[2] ?? ''))
      out.push({ line: lineOf(markup, m.index ?? 0), kind: 'text', snippet: m[0] });
  }
  for (const m of markup.matchAll(/style="([^"]*)"/g)) {
    if (COLOR.test(m[1] ?? ''))
      out.push({ line: lineOf(markup, m.index ?? 0), kind: 'color', snippet: m[0] });
  }
  const textOnly = markup.replace(/<[^>]*>/g, blank);
  for (const m of textOnly.matchAll(/[^\s]+(?:[ \t]+[^\s]+)*/g)) {
    if (LETTER.test(m[0]))
      out.push({ line: lineOf(textOnly, m.index ?? 0), kind: 'text', snippet: m[0] });
  }
  return out;
}

/** Replaces `{…}` (with nesting and strings) by spaces. */
function stripBraces(s: string): string {
  let out = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (depth > 0) {
      if (quote) {
        if (ch === '\\') {
          out += '  ';
          i++;
          continue;
        }
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
      out += ch === '\n' ? '\n' : ' ';
      continue;
    }
    if (ch === '{') {
      depth = 1;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

export function checkCss(css: string): Finding[] {
  const out: Finding[] = [];
  css.split('\n').forEach((text, i) => {
    const code = text.replace(/\/\*.*?\*\//g, '');
    if (COLOR.test(code)) out.push({ line: i + 1, kind: 'color', snippet: text.trim() });
  });
  return out;
}
