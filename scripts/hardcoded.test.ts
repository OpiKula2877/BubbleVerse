import { describe, expect, it } from 'vitest';
import { checkCss, checkSvelte } from './hardcoded';

describe('hardcoded text and color check', () => {
  it('flags plain text and text attributes but not expressions', () => {
    const src = `<script>let a = 'Hello';</script>
<button title="Save">{t('save')}</button>
<p>Hello world</p>
<span>{a} · 3</span>
<input placeholder={t('x')} />`;
    const f = checkSvelte(src);
    expect(f.map((x) => [x.line, x.kind])).toEqual([
      [2, 'text'],
      [3, 'text'],
    ]);
  });

  it('flags colors in styles but not variables', () => {
    expect(
      checkCss(
        'a { color: var(--bv-text); }\nb { color: #fff; }\nc { background: rgba(0,0,0,.5) }',
      ),
    ).toHaveLength(2);
    const svelte =
      '<div style="color: #f00"></div>\n<style>\n  .x { color: var(--bv-accent); }\n</style>';
    expect(checkSvelte(svelte).map((x) => x.kind)).toEqual(['color']);
  });
});
