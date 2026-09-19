// "Promote a finished prototype to real app code" — the third phase of the
// design/code round-trip workflow explored with the user: (1) ground a
// prototype in the existing app's conventions, (2) iterate it in the
// sandboxed Artifact Preview editor (unchanged, already built), (3) this —
// port the finished result into real production code, once, on request.
// Like every other content-producing piece of this extension, this only
// composes instructions; the model reproduces the design as real code with
// its own file-editing tools. No bespoke "apply" step, no live/continuous
// sync with the prototype afterward — a deliberate one-time action.

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
}

export function composePortToAppInstructions(input: ComposePortToAppInstructionsInput): string {
  const { artifactEntryPath, artifactContent, targetComponentPath, referenceComponentPath } = input;
  const parts: string[] = [];

  parts.push(
    `# Promote an OpenDesign prototype into this app's real code\n\nYou are porting the finished OpenDesign artifact below into this workspace's actual, existing application — reproducing its visual design as idiomatic, real production code, not copying it into the app verbatim.`,
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

  parts.push(
    `\n\n## Styling and content\n\nDo NOT copy the artifact's inline CSS verbatim into the new component unless the app's own components genuinely use inline styles — translate to whatever styling approach the reference component(s) actually use. Use the artifact's own text/images as static content, unless the reference component's pattern clearly shows data arriving via props, in which case shape the new component the same way.`,
  );

  parts.push(
    `\n\n## Explicitly out of scope for this task\n\nDo NOT wire the new component into routing, navigation, or any other part of the app — leave that as a separate, deliberate step for the user to review and do themselves once they've seen the ported code.`,
  );

  return parts.join('');
}
