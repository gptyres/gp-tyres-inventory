import { beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import postcss, { type Root, type Rule } from 'postcss';

let html: string;
let styles: Root;

const declaration = (rule: Rule, property: string) => {
  const node = rule.nodes.find((node) => node.type === 'decl' && node.prop === property);
  return node?.type === 'decl' ? node.value : undefined;
};

const rulesFor = (selector: string): Rule[] => {
  const rules: Rule[] = [];
  styles.walkRules((rule) => {
    if (rule.selector === selector) rules.push(rule);
  });
  return rules;
};

beforeAll(async () => {
  // Exercise the actual Vite/PostCSS production pipeline without changing dist/.
  const result = await build({ logLevel: 'silent', build: { write: false } });
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one production output');
  const assets = result.output.filter((item) => item.type === 'asset');
  const index = assets.find((asset) => asset.fileName === 'index.html');
  if (!index) throw new Error('Missing production HTML');
  html = String(index.source);
  styles = postcss.parse(assets.filter((asset) => asset.fileName.endsWith('.css'))
    .map((asset) => String(asset.source)).join('\n'));
}, 60_000);

describe('production CSS delivery', () => {
  it('serves compiled app CSS without the development Tailwind browser runtime', () => {
    const scriptSources = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), (match) => match[1]);
    expect(scriptSources.some((src) => /cdn\.tailwindcss\.com|@tailwindcss\/browser/.test(src))).toBe(false);
    expect(html).toMatch(/<link\b[^>]*rel="stylesheet"[^>]*href="\/assets\/[^\"]+\.css"/);
    expect(rulesFor('.bg-gp-panel').some((rule) => declaration(rule, 'background-color') === 'var(--color-gp-panel)')).toBe(true);
    expect(rulesFor('.text-gp-text-main').some((rule) => declaration(rule, 'color') === 'var(--color-gp-text-main)')).toBe(true);
  });

  it('keeps the GP fonts, brand red and class-driven dark palette', () => {
    expect(rulesFor('html,:host').some((rule) => declaration(rule, 'font-family')?.startsWith('Manrope'))).toBe(true);
    expect(rulesFor('.font-display').some((rule) => declaration(rule, 'font-family')?.startsWith('Oswald'))).toBe(true);
    expect(rulesFor('.bg-gp-red').some((rule) => declaration(rule, 'background-color')?.includes('255 0 0'))).toBe(true);
    // Theme variables remain inline so first paint matches the chosen palette.
    const theme = postcss.parse(html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '');
    let darkPanel: string | undefined;
    theme.walkRules('.dark', (rule) => {
      darkPanel = declaration(rule, '--color-gp-panel');
    });
    expect(darkPanel).toBe('#1b1d1f');
  });

  it('compiles wheel filter grids at their existing responsive breakpoints', () => {
    const grids: Array<{ columns: string | undefined; breakpoint: string }> = [];
    styles.walkRules((rule) => {
      if (rule.selector.startsWith('.xl\\:grid-cols-') && rule.parent?.type === 'atrule') {
        grids.push({ columns: declaration(rule, 'grid-template-columns'), breakpoint: rule.parent.params });
      }
    });
    expect(grids).toContainEqual({ columns: '.9fr 1fr 1.2fr 1.4fr', breakpoint: '(min-width:1280px)' });
    expect(grids).toContainEqual({ columns: 'minmax(360px,1fr) 220px auto', breakpoint: '(min-width:1280px)' });
    expect(rulesFor('.sm\\:grid-cols-2').some((rule) => (
      rule.parent?.type === 'atrule' && rule.parent.params === '(min-width:640px)'
    ))).toBe(true);
    expect(rulesFor('.min-h-11').some((rule) => declaration(rule, 'min-height') === '2.75rem')).toBe(true);
  });

  it('keeps all inventory header alignments constructed at runtime', () => {
    for (const alignment of ['left', 'center', 'right']) {
      expect(rulesFor(`.text-${alignment}`).some((rule) => declaration(rule, 'text-align') === alignment)).toBe(true);
    }
  });
});
