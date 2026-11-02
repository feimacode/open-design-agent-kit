import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scanApp } from '../../workspace/appScan';
import {
  appComponentsFile,
  appTokensCss,
  composeComponentVocabularySection,
  diffAppProfile,
  formatAppScanResult,
  markedComponents,
  tokenFindings,
} from '../../generation/appDesignSystem';
import { composeComponentReuseSection } from '../../generation/portToAppInstructions';

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-app-'));
  for (const [p, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, p)), { recursive: true });
    await fs.writeFile(path.join(root, p), body);
  }
  return root;
}

const NEXT_TAILWIND = {
  'package.json': JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0', 'class-variance-authority': '0.7.0' }, devDependencies: { tailwindcss: '3.4.0' } }),
  'tailwind.config.ts': `import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.tsx'],
  theme: {
    extend: {
      colors: {
        brand: {
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      borderRadius: { card: '12px' },
      fontFamily: { sans: ['Inter', 'sans-serif'] },
    },
  },
} satisfies Config;
`,
  'app/globals.css': `:root { --background: 0 0% 100%; --radius: 0.5rem; }
.dark { --background: 222 47% 11%; }
[data-theme="ocean"] { --background: 200 50% 20%; }
.btn { --local: 1px; }
`,
  'components/ui/button.tsx': `import { cva, type VariantProps } from 'class-variance-authority';
const buttonVariants = cva('btn', { variants: { variant: { default: '', outline: '', ghost: '' }, size: { sm: '', lg: '' } } });
export interface ButtonProps extends VariantProps<typeof buttonVariants> { asChild?: boolean }
export function Button({ asChild }: ButtonProps) { return <button />; }
`,
  'components/stat-card.tsx': `type StatCardProps = { tone: 'good' | 'bad'; label: string; value: number };
export const StatCard = ({ tone, label }: StatCardProps) => <div>{label}</div>;
const Internal = () => null;
`,
  'app/page.tsx': `import { Button } from '@/components/ui/button';\nexport default function Home() { return <Button />; }`,
  'app/settings/page.tsx': `import { Button } from '@/components/ui/button';\nimport { StatCard } from '@/components/stat-card';\nexport default function Settings() { return <Button />; }`,
  'app/(marketing)/pricing/page.tsx': 'export default function P() { return null; }',
  '.env.local': 'SECRET=--brand-600',
};

describe('app scan', () => {
  it('reads a Next.js + Tailwind app: theme tokens with lines, CSS variables by theme, components and routes', async () => {
    const root = await fixture(NEXT_TAILWIND);
    const p = await scanApp(root);
    assert.ok(p.found);
    assert.deepStrictEqual(p.frameworks.slice(0, 2), ['Next.js', 'React']);
    assert.ok(p.styling.includes('Tailwind'));
    const brand = p.tokens.find((t) => t.name === 'colors.brand.600');
    assert.deepStrictEqual([brand?.value, brand?.source, brand?.kind], ['#2563eb', 'tailwind.config.ts:8', 'color']);
    assert.ok(p.tokens.some((t) => t.name === '--background' && t.theme === 'dark'));
    assert.ok(p.tokens.some((t) => t.name === '--background' && t.theme === 'ocean'));
    assert.ok(!p.tokens.some((t) => t.name === '--local'), 'variables scoped to a component class are not tokens');
    assert.deepStrictEqual(p.themes, ['light', 'dark', 'ocean']);
    const button = p.components.find((c) => c.name === 'Button');
    assert.deepStrictEqual(button?.variants, { variant: ['default', 'outline', 'ghost'], size: ['sm', 'lg'] });
    assert.strictEqual(button?.imports, 2);
    assert.strictEqual(p.components[0].name, 'Button', 'most imported first');
    const stat = p.components.find((c) => c.name === 'StatCard');
    assert.deepStrictEqual(stat?.variants, { tone: ['good', 'bad'] });
    assert.deepStrictEqual(stat?.props, ['label', 'value']);
    assert.ok(!p.components.some((c) => c.name === 'Internal'));
    assert.deepStrictEqual(p.routes.map((r) => r.path).sort(), ['/', '/pricing', '/settings']);
  });

  it('reads an MUI theme and an Expo Router app, and finds nothing where there is no app', async () => {
    const mui = await scanApp(
      await fixture({
        'package.json': JSON.stringify({ dependencies: { react: '18', '@mui/material': '6', vite: '5' } }),
        'src/theme.ts': `import { createTheme } from '@mui/material/styles';\nexport const theme = createTheme({\n  palette: { primary: { main: '#6200ee' } },\n  shape: { borderRadius: 8 },\n});\n`,
      }),
    );
    assert.ok(mui.styling.includes('MUI'));
    assert.ok(mui.tokens.some((t) => t.name === 'palette.primary.main' && t.value === '#6200ee' && t.source === 'src/theme.ts:3'));
    const expo = await scanApp(
      await fixture({
        'package.json': JSON.stringify({ dependencies: { expo: '52', 'react-native': '0.76', nativewind: '4', react: '18' } }),
        'app/(tabs)/index.tsx': 'export default function Home() { return null; }',
        'app/(tabs)/_layout.tsx': 'export default function L() { return null; }',
        'app/settings.tsx': 'export default function S() { return null; }',
      }),
    );
    assert.ok(expo.styling.includes('NativeWind'));
    assert.deepStrictEqual(expo.routes.map((r) => r.path).sort(), ['/', '/settings']);
    const none = await scanApp(await fixture({ 'README.md': 'hi' }));
    assert.strictEqual(none.found, false);
    assert.match(none.notes[0], /No app found/);
  });
});

describe('app design system', () => {
  it('writes tokens.css that agrees with the scan, and diffs a re-scan', async () => {
    const root = await fixture(NEXT_TAILWIND);
    const before = await scanApp(root);
    const css = appTokensCss(before);
    assert.match(css, /--colors-brand-600: #2563eb; \/\* tailwind\.config\.ts:8 \*\//);
    assert.match(css, /\[data-theme="dark"\], \.dark \{\n {2}--background: 222 47% 11%;/);
    const saved = appComponentsFile(before, '2026-11-01T00:00:00Z');
    await fs.writeFile(path.join(root, 'tailwind.config.ts'), NEXT_TAILWIND['tailwind.config.ts'].replace('#2563eb', '#4f46e5'));
    const diff = diffAppProfile(saved, await scanApp(root));
    assert.deepStrictEqual(diff.tokensChanged.map((c) => [c.name, c.from, c.to]), [['--colors-brand-600', '#2563eb', '#4f46e5']]);
    const text = formatAppScanResult(before, { outputDir: '.open-design', name: 'Acme app' });
    assert.match(text, /\.open-design\/design-systems\/acme-app\/DESIGN\.md/);
    assert.match(text, /set_active_design_system with id `user:acme-app`/);
  });

  it('lists the vocabulary in a brief and asks for new: marks', async () => {
    const file = appComponentsFile(await scanApp(await fixture(NEXT_TAILWIND)));
    const section = composeComponentVocabularySection(file)!;
    assert.match(section, /\*\*Button\*\* — variant: default \| outline \| ghost; size: sm \| lg/);
    assert.match(section, /data-od-component="new:<Name>"/);
  });

  it('reports hard-coded and undefined tokens', () => {
    const tokens = [{ name: '--brand-600', value: '#2563EB', source: 'tailwind.config.ts:14', kind: 'color' as const }, { name: '--radius-card', value: '12px', source: 'app.css:2', kind: 'radius' as const }];
    const html = `<style>:root{--mine:#2563eb}.b{background:#2563eb;color:var(--nope);border-radius:12px;padding:var(--pad, 4px)}</style><div style="color:var(--mine)"></div>`;
    const f = tokenFindings(html, tokens);
    assert.ok(f.some((x) => x.check === 'token-hardcoded' && /var\(--brand-600\) \(tailwind\.config\.ts:14\)/.test(x.message)));
    assert.ok(f.some((x) => x.check === 'token-hardcoded' && /--radius-card/.test(x.message)));
    const undef = f.filter((x) => x.check === 'token-undefined');
    assert.deepStrictEqual(undef.map((x) => /var\((--[\w-]+)\)/.exec(x.message)?.[1]), ['--nope'], 'a fallback or a local definition is fine');
  });

  it('promote imports marked components and creates only new: ones', async () => {
    const html = '<button data-od-component="Button">Save</button><ol data-od-component="new:Stepper"></ol>';
    assert.deepStrictEqual(markedComponents(html), { reused: ['Button'], proposed: ['Stepper'] });
    const file = appComponentsFile(await scanApp(await fixture(NEXT_TAILWIND)));
    const section = composeComponentReuseSection(html, file)!;
    assert.match(section, /\*\*Button\*\*: import it from `components\/ui\/button\.tsx`/);
    assert.match(section, /Create new components only for the parts marked `new:` \(Stepper\)/);
  });
});
