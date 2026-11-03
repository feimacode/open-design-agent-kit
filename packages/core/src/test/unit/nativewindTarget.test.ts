import * as assert from 'node:assert';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentIndex } from '../../content/contentIndex';
import { chooseLibrary, detectApp, installCommand, nativewindMajor, prepareComponentLibrary } from '../../generation/componentLibrary';
import { buildLibraryTheme, darkTokensOf, deriveOtherScheme } from '../../generation/libraryThemes';
import { composeExpoSection, composePortToAppInstructions, nativePromoteContext } from '../../generation/portToAppInstructions';
import { writeArtifactManifest } from '../../vendored/artifactCreate';

const ASSETS = path.resolve(__dirname, '../../../../content/assets/open-design');
const index = new ContentIndex(ASSETS);
const getDesignSystem = (id: string) => index.getDesignSystem(id);

const EXPO_APP = { dependencies: { react: '19.0.0', 'react-native': '0.79.0', expo: '~53.0.0', 'expo-router': '~5.0.0', nativewind: '^4.1.23' } };
const LIGHT = new Map([
  ['--bg', '#ffffff'],
  ['--fg', '#111111'],
  ['--accent', '#2563eb'],
  ['--accent-on', '#ffffff'],
  ['--surface', '#f4f4f5'],
  ['--border', '#e4e4e7'],
  ['--danger', '#dc2626'],
  ['--radius-md', '10px'],
  ['--font-body', '"Inter", system-ui, sans-serif'],
  ['--elev-1', '0 1px 2px rgba(0,0,0,.1)'],
]);

async function workspace(pkg: unknown, files: Record<string, string> = {}): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od-nativewind-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg));
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), content);
  }
  return root;
}

describe('nativewind target: theme', () => {
  it('maps tokens to global.css variables and a Tailwind extension, deriving the dark scheme when there is none', () => {
    const theme = buildLibraryTheme(LIGHT, 'nativewind');
    assert.strictEqual(theme.library, 'nativewind');
    assert.strictEqual(theme.mode, 'light');
    assert.ok(theme.otherScheme?.derived);
    assert.strictEqual(theme.otherScheme?.mode, 'dark');
    assert.match(theme.code, /@tailwind base;/);
    assert.match(theme.code, /:root \{\n\s+--background: 0 0% 100%;/);
    assert.match(theme.code, /\.dark:root \{\n\s+--background: 0 0% 6%;/);
    assert.match(theme.code, /--primary: 221\.2 83\.2% 53\.3%;[\s\S]*\.dark:root[\s\S]*--primary: 221\.2 83\.2% 53\.3%;/, 'brand colours keep their value');
    assert.match(theme.code, /DERIVED/);
    assert.match(theme.tailwindExtend!, /'primary': 'hsl\(var\(--primary\)\)'/);
    assert.match(theme.tailwindExtend!, /borderRadius: \{ lg: 'var\(--radius\)'/);
    assert.match(theme.tailwindExtend!, /sans: \['Inter'\]/);
    assert.ok(theme.unmapped.some((u) => u.token === '--elev-1' && /elevation/.test(u.suggestion)), JSON.stringify(theme.unmapped));
    assert.ok(!theme.unmapped.some((u) => u.token === '--font-body'));
  });

  it('uses the design system\'s own dark tokens when it has them', () => {
    const dark = darkTokensOf(':root{--bg:#fff}\n@media (prefers-color-scheme: dark){:root{--bg:#0b0b0c;--fg:#f5f5f5}}', LIGHT);
    assert.strictEqual(dark?.get('--bg'), '#0b0b0c');
    assert.strictEqual(dark?.get('--accent'), '#2563eb', 'unset tokens fall back to the light value');
    assert.strictEqual(darkTokensOf('[data-mode="dark"]{--fg:#eee}', LIGHT)?.get('--fg'), '#eee');
    assert.strictEqual(darkTokensOf(':root{--bg:#fff}', LIGHT), undefined);
    const theme = buildLibraryTheme(LIGHT, 'nativewind', dark);
    assert.strictEqual(theme.otherScheme?.derived, false);
    assert.doesNotMatch(theme.code, /DERIVED/);
    assert.strictEqual(theme.otherScheme?.cssVarsHsl['--background'], '240 4.3% 4.5%');
  });

  it('mirrors only the neutrals when deriving', () => {
    assert.deepStrictEqual(deriveOtherScheme({ '--background': '0 0% 100%', '--foreground': '0 0% 7%', '--primary': '221 83% 53%' }), {
      '--background': '0 0% 6%',
      '--foreground': '0 0% 93%',
      '--primary': '221 83% 53%',
    });
  });
});

describe('nativewind target: app and instructions', () => {
  it('detects Expo apps and the NativeWind version, and keeps web libraries off them', async () => {
    const app = (await detectApp(await workspace(EXPO_APP)))!;
    assert.strictEqual(app.nativewindVersion, '^4.1.23');
    assert.strictEqual(nativewindMajor(app.nativewindVersion), 4);
    assert.deepStrictEqual(chooseLibrary(app, 'auto'), { library: 'nativewind', installed: true });
    assert.deepStrictEqual(chooseLibrary(app, 'shadcn'), { error: 'unsupported-framework', found: ['react-native'] });
    const web = (await detectApp(await workspace({ dependencies: { react: '19.0.0' } })))!;
    assert.deepStrictEqual(chooseLibrary(web, 'nativewind'), { error: 'unsupported-framework', found: ['react (web)'] });
    const bare = (await detectApp(await workspace({ dependencies: { react: '19.0.0', 'react-native': '0.79.0' } })))!;
    assert.deepStrictEqual(chooseLibrary(bare, 'auto'), { library: 'nativewind', installed: false });
    assert.strictEqual(installCommand('nativewind', 'npm'), 'npx expo install nativewind tailwindcss@^3.4 react-native-reanimated react-native-safe-area-context');
  });

  it('composes native instructions: theme files, native rules, core components or reusables, gallery screen', async () => {
    const root = await workspace(EXPO_APP);
    const entry = '.open-design/habits/home.html';
    await fs.mkdir(path.join(root, path.dirname(entry)), { recursive: true });
    await fs.writeFile(path.join(root, entry), '<!doctype html><html><head><style>:root{--bg:#fff;--fg:#111;--accent:#2563eb}</style></head><body data-od-device="iphone"><button class="btn">Add</button><button class="btn">Done</button></body></html>');
    await writeArtifactManifest({ workspaceRoot: root, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Habits' } });
    const result = await prepareComponentLibrary({ workspaceRoot: root, outputDir: '.open-design', entryPaths: [entry], library: 'auto', getDesignSystem });
    assert.ok(result.ok, result.text);
    const text = result.text;
    assert.match(text, /React Native component set styled with NativeWind/);
    assert.match(text, /## NativeWind 4/);
    assert.match(text, /Write it to `global.css`/);
    assert.match(text, /merge this into `tailwind.config.js`/);
    assert.match(text, /## Native rules/);
    assert.match(text, /React Native core: Pressable, Text, TextInput/);
    assert.match(text, /default, pressed and disabled/);
    assert.match(text, /in Expo Router a file under `app\/` is a route/);
    assert.doesNotMatch(text, /hover, focus-visible/);
    assert.doesNotMatch(text, /Before you start: set up NativeWind/);

    const withReusables = await workspace({ dependencies: { ...EXPO_APP.dependencies, '@rn-primitives/slot': '^1.0.0' } });
    await fs.mkdir(path.join(withReusables, path.dirname(entry)), { recursive: true });
    await fs.copyFile(path.join(root, entry), path.join(withReusables, entry));
    await writeArtifactManifest({ workspaceRoot: withReusables, entryPath: entry, artifactManifest: { kind: 'html', renderer: 'html', exports: ['html'], title: 'Habits' } });
    const r2 = await prepareComponentLibrary({ workspaceRoot: withReusables, outputDir: '.open-design', entryPaths: [entry], library: 'nativewind', getDesignSystem });
    assert.ok(r2.ok, r2.text);
    assert.match(r2.text, /react-native-reusables primitives/);
  });

  it('turns a flow screen into Expo Router routes, links and a tabs layout on promote', async () => {
    const plan = {
      screens: [
        { id: 'today', title: 'Today' },
        { id: 'habit', title: 'Habit' },
        { id: 'stats', title: 'Stats' },
      ],
      links: [{ from: 'today', trigger: 'Open habit', to: 'habit' }],
      nav: [
        { label: 'Today', to: 'today' },
        { label: 'Stats', to: 'stats' },
      ],
    };
    const root = await workspace(EXPO_APP);
    const ctx = await nativePromoteContext(root, { flow: { plan, screenId: 'today' } });
    assert.deepStrictEqual(ctx.nativeApp, { expoRouter: true, appDir: '', nativewind: true });
    const section = composeExpoSection(ctx.nativeApp!, ctx.flow);
    assert.match(section, /`app\/\(tabs\)\/today\.tsx`/);
    assert.match(section, /"Open habit" → `router\.push\('\/habit'\)`/);
    assert.match(section, /`app\/\(tabs\)\/_layout\.tsx` with `<Tabs>`/);
    const promote = composePortToAppInstructions({ artifactEntryPath: 'a.html', artifactContent: '<p></p>', ...ctx });
    assert.match(promote, /## This is an Expo \/ React Native app/);
    assert.deepStrictEqual(await nativePromoteContext(await workspace({ dependencies: { react: '19.0.0' } }), {}), {});
  });
});
