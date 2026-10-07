/** Case and diacritics do not matter in search (spec §6.4): `aplikace` finds `Aplikáce`. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
