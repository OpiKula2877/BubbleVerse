import { translate, type Lang, type MessageKey, type Params } from './translate';

/** Reactive UI language. Components re-render when `i18n.lang` changes. */
export const i18n = $state({ lang: 'en' as Lang });

export function setLang(lang: Lang): void {
  i18n.lang = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function t(key: MessageKey, params?: Params): string {
  return translate(i18n.lang, key, params);
}

/** For keys built at runtime (e.g. from enum values); prefer `t` when the key is static. */
export function tk(key: string, params?: Params): string {
  return translate(i18n.lang, key, params);
}
