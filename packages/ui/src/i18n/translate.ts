import cs from './cs.json';
import en from './en.json';

export type Lang = 'en' | 'cs';
export type MessageKey = keyof typeof en;
export type Params = Record<string, string | number>;

export const LANGS: readonly Lang[] = ['en', 'cs'];

const dictionaries: Record<Lang, Record<string, string>> = { en, cs };

/** Replaces `{name}` placeholders with values from `params`. Unknown placeholders stay as they are. */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Looks up a message; falls back to English and then to the key itself. */
export function translate(lang: Lang, key: string, params?: Params): string {
  const text = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  return interpolate(text, params);
}

export function dictionary(lang: Lang): Readonly<Record<string, string>> {
  return dictionaries[lang];
}
