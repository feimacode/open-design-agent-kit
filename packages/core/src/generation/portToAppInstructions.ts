// "Promote a finished prototype to real app code" — the third phase of the
// design/code round-trip workflow explored with the user: (1) ground a
// prototype in the existing app's conventions, (2) iterate it in the
// sandboxed Artifact Preview editor (unchanged, already built), (3) this —
// port the finished result into real production code, once, on request.
// Like every other content-producing piece of this extension, this only
// composes instructions; the model reproduces the design as real code with
// its own file-editing tools. No bespoke "apply" step, no live/continuous
// sync with the prototype afterward — a deliberate one-time action.

import { markedComponents, type AppComponentsFile } from './appDesignSystem';
import { composeMockDataSection, type SampleData } from '../export/sampleData';
import { flowRecordOf, type FlowPlan } from './flowPlan';
import { detectApp, isNativeApp } from './componentLibrary';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const CANDIDATE_COMPONENT_DIRS = ['src/components', 'app/components', 'components'];
const KNOWN_COMPONENT_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte', '.ts', '.js'];

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function toPascalCase(name: string): string {
  const words = name
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('') || 'Component';
}

// Best-effort only — a suggestion the model or user can override, not a
// classification the rest of the tool depends on. Checks a fixed, small set
// of conventional component directories and, if one exists, guesses the
// file extension from whatever's already there rather than assuming a
// framework.
export async function suggestTargetComponentPath(workspaceRoot: string, artifactName: string): Promise<string | undefined> {
  for (const candidateDir of CANDIDATE_COMPONENT_DIRS) {
    const absDir = path.join(workspaceRoot, candidateDir);
    if (!(await pathExists(absDir))) continue;

    let entries: string[] = [];
    try {
      entries = await fs.readdir(absDir);
    } catch {
      continue;
    }

    const extensionCounts = new Map<string, number>();
    for (const entry of entries) {
      const ext = KNOWN_COMPONENT_EXTENSIONS.find((e) => entry.endsWith(e));
      if (ext) extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
    }
    const guessedExt = [...extensionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '.tsx';

    return path.posix.join(candidateDir, `${toPascalCase(artifactName)}${guessedExt}`);
  }
  return undefined;
}

export interface ComposePortToAppInstructionsInput {
  artifactEntryPath: string;
  artifactContent: string;
  targetComponentPath?: string;
  referenceComponentPath?: string;
  /** The component vocabulary of the app design system the design was built on (openspec add-design-from-app). */
  appComponents?: AppComponentsFile;
  /** The sample data file the design binds to (openspec add-sample-data). */
  sampleData?: { path: string; data: SampleData };
  /** The workspace app is Expo / React Native (openspec add-expo-nativewind-target). */
  nativeApp?: { expoRouter: boolean; appDir: string; nativewind: boolean };
  /** The design's flow plan and its screen id, when it is a screen of a flow. */
  flow?: { plan: FlowPlan; screenId: string };
}

/** "Port into the Expo app": React Native rules, and Expo Router screens, links and tabs from the flow. */
export function composeExpoSection(native: NonNullable<ComposePortToAppInstructionsInput['nativeApp']>, flow: ComposePortToAppInstructionsInput['flow']): string {
  const appDir = native.appDir ? `${native.appDir}/` : '';
  const lines = [
    '## This is an Expo / React Native app',
    '',
    `Rebuild the design with React Native components (View, Text, Pressable, TextInput, FlatList, SafeAreaView), not HTML elements${native.nativewind ? ', styled with NativeWind `className`s bound to the theme' : ', styled the way the app\'s existing screens are'}. Follow the native rules: 44/48-point touch targets, pressed and disabled states instead of hover, safe-area insets instead of fixed padding, platform shadows, no web-only CSS (grid, fixed position, hover), and accessibility roles and labels on every control. The kit drew the device frame in its previews; it is not part of the screen.`,
  ];
  if (native.expoRouter) {
    if (flow) {
      const tabIds = new Set((flow.plan.nav ?? []).map((n) => n.to));
      const route = (id: string) => (tabIds.has(id) ? `${appDir}app/(tabs)/${id}.tsx` : `${appDir}app/${id}.tsx`);
      lines.push(
        '',
        '### Screens and links (Expo Router)',
        '',
        `This design is the \`${flow.screenId}\` screen of a flow. Write it as \`${route(flow.screenId)}\` (keep a route the app already has for it). Each link in the flow becomes \`router.push('/<screen>')\` (or \`<Link href="/<screen>">\`), so the app is clickable like the prototype:`,
        '',
        ...flow.plan.links.filter((l) => l.from === flow.screenId).map((l) => `- "${l.trigger}" → \`router.push('/${l.to}')\``),
        ...(flow.plan.links.some((l) => l.from === flow.screenId) ? [] : ['- (this screen has no planned links)']),
      );
      if (flow.plan.nav && flow.plan.nav.length > 0) {
        lines.push(
          '',
          `The shared navigation is a tab bar: \`${appDir}app/(tabs)/_layout.tsx\` with \`<Tabs>\` and one \`<Tabs.Screen>\` per item (${flow.plan.nav.map((n) => `${n.label} → \`${n.to}\``).join(', ')}). Write the layout once if it doesn't exist; don't repeat the tab bar inside the screen.`,
        );
      }
      lines.push('', 'Promote the other screens of the flow the same way, one at a time, so every link has a route to go to.');
    } else {
      lines.push('', `Put the screen under \`${appDir}app/\` following the app's existing routes; a link to another screen is \`router.push('/<route>')\`.`);
    }
  }
  return lines.join('\n');
}

/** "Reuse the app's components": the marked parts to import, and the new: parts to create. */
export function composeComponentReuseSection(html: string, file: AppComponentsFile | undefined): string | undefined {
  const { reused, proposed } = markedComponents(html);
  if (reused.length === 0 && proposed.length === 0) return undefined;
  const known = new Map((file?.components ?? []).map((c) => [c.name, c]));
  const lines = reused.map((n) => {
    const c = known.get(n);
    return c ? `- **${n}**: import it from \`${c.file}\`; pass the variant the design's \`data-variant\` (or classes) shows${Object.keys(c.variants).length ? ` (${Object.entries(c.variants).map(([k, v]) => `${k}: ${v.join(' | ')}`).join('; ')})` : ''}.` : `- **${n}**: find the app's ${n} component and import it; don't write a new one.`;
  });
  return `## Reuse the app's components\n\nThe design marks its parts with \`data-od-component\`. Every part marked with an existing component is that component: import and use it, and create no new component for it.\n\n${lines.join('\n') || '- (none)'}\n\n${proposed.length ? `Create new components only for the parts marked \`new:\` (${proposed.join(', ')}) and for unmarked parts, in the app's own style and next to its other components.` : 'Create new components only for unmarked parts.'}`;
}

export function composePortToAppInstructions(input: ComposePortToAppInstructionsInput): string {
  const { artifactEntryPath, artifactContent, targetComponentPath, referenceComponentPath } = input;
  const parts: string[] = [];

  parts.push(
    `# Promote an Open Design prototype into this app's real code\n\nYou are porting the finished Open Design artifact below into this workspace's actual, existing application — reproducing its visual design as idiomatic, real production code, not copying it into the app verbatim.`,
  );

  parts.push(`\n\n## The artifact\n\nEntry file: \`${artifactEntryPath}\`\n\n\`\`\`html\n${artifactContent.trim()}\n\`\`\``);

  parts.push(
    targetComponentPath
      ? `\n\n## Target location\n\nWrite the new component at \`${targetComponentPath}\` (adjust the filename or extension if the app's own conventions clearly call for something different — this is a suggestion, not a requirement).`
      : `\n\n## Target location\n\nNo target location could be suggested automatically. Infer an appropriate one from the app's existing structure, or ask the user if it's genuinely ambiguous.`,
  );

  parts.push(
    referenceComponentPath
      ? `\n\n## Match the app's real conventions\n\nRead \`${referenceComponentPath}\` first — treat it as the authoritative pattern for imports, prop/typing style, file organization, and how this app actually handles styling (Tailwind utilities, CSS Modules, styled-components, plain CSS, design tokens as CSS variables, or whatever it genuinely uses).`
      : `\n\n## Match the app's real conventions\n\nBefore writing anything, find one or two existing components in this workspace that are structurally similar to the artifact (a card, a hero section, a form — whatever it most resembles) and read them as your pattern reference for imports, prop/typing style, file organization, and the app's actual styling approach. Do not guess at the app's conventions — verify them from real files.`,
  );

  const reuse = composeComponentReuseSection(artifactContent, input.appComponents);
  if (reuse) parts.push(`\n\n${reuse}`);

  parts.push(
    `\n\n## Styling and content\n\nDo NOT copy the artifact's inline CSS verbatim into the new component unless the app's own components genuinely use inline styles — translate to whatever styling approach the reference component(s) actually use. Use the artifact's own text/images as static content${input.sampleData ? ' (except the records bound to the data file: see below)' : ''}, unless the reference component's pattern clearly shows data arriving via props, in which case shape the new component the same way.`,
  );

  if (input.nativeApp) parts.push(`\n\n${composeExpoSection(input.nativeApp, input.flow)}`);

  const mocks = input.sampleData ? composeMockDataSection(input.sampleData) : '';
  if (mocks) parts.push(`\n\n${mocks}`);

  parts.push(
    `\n\n## Explicitly out of scope for this task\n\nDo NOT wire the new component into routing, navigation, or any other part of the app — leave that as a separate, deliberate step for the user to review and do themselves once they've seen the ported code.`,
  );

  return parts.join('');
}

/** The Expo context for promote: the workspace's app when it is Expo / React Native, and the design's flow plan. */
export async function nativePromoteContext(workspaceRoot: string, metadata: unknown): Promise<Pick<ComposePortToAppInstructionsInput, 'nativeApp' | 'flow'>> {
  const app = await detectApp(workspaceRoot);
  const record = flowRecordOf(metadata);
  if (!app || !isNativeApp(app)) return {};
  return {
    nativeApp: { expoRouter: app.dependencies.has('expo-router'), appDir: app.appDir, nativewind: app.dependencies.has('nativewind') },
    ...(record ? { flow: { plan: record.plan, screenId: record.screenId } } : {}),
  };
}
