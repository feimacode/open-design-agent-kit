// "Get a finished artifact into Canva as a starting point for a template" —
// a sibling to shareToCommunityInstructions.ts, but for a destination this
// project has no automation path into: Canva has no `gh`-equivalent CLI, and
// its Connect API (OAuth, a registered Canva app) is deliberately out of
// scope for now — see the user's own choice among three options when this
// was scoped. So unlike the community-share flow, there is no "Stage 4:
// publish it" the model can run with a terminal tool; every Canva-side step
// past the export is a manual action in the user's own browser, under their
// own Canva account, and the instructions say so rather than implying the
// model can drive Canva's UI. Like every other content-producing piece of
// this extension, this only composes instructions and calls the existing
// export tool — it never talks to Canva itself.

export interface ComposePublishCanvaTemplateInstructionsInput {
  artifactEntryPath: string;
  artifactContent: string;
  manifestTitle?: string;
  /** The artifact's registered kind, e.g. "deck", "html". Governs which export format is usable — see exportArtifact.ts. */
  manifestKind?: string;
}

export function composePublishCanvaTemplateInstructions(input: ComposePublishCanvaTemplateInstructionsInput): string {
  const { artifactEntryPath, artifactContent, manifestTitle, manifestKind } = input;
  const isDeck = manifestKind === 'deck';
  const exportFormat = isDeck ? 'pptx' : 'pdf';
  const parts: string[] = [];

  parts.push(
    `# Prepare this Open Design artifact for Canva\n\nYou are turning the finished artifact below into a design the user can import into Canva and, if they choose, publish there as a reusable template. This extension has no automated publish path into Canva — there is no CLI and no connected account — so everything past the export step below is a manual action the user completes themselves, in their own Canva account. Your job ends at handing them a ready-to-import file and clear next steps.`,
  );

  parts.push(`\n\n## The artifact\n\nEntry file: \`${artifactEntryPath}\`\n\n\`\`\`html\n${artifactContent.trim()}\n\`\`\``);

  parts.push(
    `\n\n## Step 1 — derive metadata yourself\n\nDo not ask the user for anything you can already tell from the artifact above${manifestTitle ? ` (its registered title is "${manifestTitle}")` : ''}. Pick a short title, a one-paragraph description, and a few free-text tags/keywords a Canva searcher might use — these are for the user to paste into Canva's own fields later, not written anywhere by you. Only ask if something is genuinely undeterminable from the artifact — never invent a fact it doesn't support.`,
  );

  parts.push(
    isDeck
      ? `\n\n## Step 2 — export it\n\nCall \`export_open_design_artifact\` on \`${artifactEntryPath}\` with \`format: "pptx"\`. This artifact is registered as a deck, so the export is one full-bleed slide image per slide — a faithful visual copy, but NOT editable text or shapes inside the PPTX itself. Tell the user this plainly before they import it: Canva will show the right slides, but text on them won't be separately editable until they redraw it with Canva's own text tool on top.`
      : `\n\n## Step 2 — export it\n\nCall \`export_open_design_artifact\` on \`${artifactEntryPath}\` with \`format: "pdf"\`. For a non-deck artifact this uses the browser's real print engine — actual vector, selectable text, not a flattened image — which gives Canva's PDF import the best realistic chance of reconstructing separately editable text boxes rather than one flat picture. Set expectations honestly anyway: complex CSS layouts, custom fonts, and gradients often don't survive the PDF round-trip pixel-for-pixel, so the user should expect to polish the result in Canva, not get an exact clone.`,
  );

  parts.push(
    `\n\n## Step 3 — hand off to the user for Canva's own import\n\nTell the user, in your own words, to:\n1. Go to canva.com and sign in.\n2. From the homepage, use **+ Create a design → Import a file** (or just drag the exported ${exportFormat.toUpperCase()} file onto the homepage).\n3. Select the exported file from \`exports/\` and wait for Canva to convert it — Canva does this automatically, with no configuration.\n4. Review the result inside Canva's editor and fix anything the conversion didn't carry over cleanly (fonts, spacing, colors) before doing anything else with it.\n\nDo not attempt to perform these steps yourself (e.g. by driving a browser) unless the user has explicitly given you a browser tool and asked you to use it for this — by default, treat this as a handoff to the user's own Canva session, not something you complete on their behalf.`,
  );

  parts.push(
    `\n\n## Step 4 — turning it into an actual "template" (explain, don't attempt)\n\nExplain to the user that "publish as a template" means different things in Canva, and none of them are reachable through this extension:\n- **Personal reuse**: they can just keep the design and duplicate it ("Make a copy") whenever they want a fresh instance — no special step needed.\n- **Brand Template** (Canva Pro/Teams only): reusable within their own account/team via their Brand Kit — a manual "Publish as Brand Template" action inside Canva's own editor, gated by their Canva plan, not something an API call from here can do.\n- **Public Creator template** (the Canva Template marketplace, discoverable by other Canva users): requires an approved Canva Creator account (an account-level application reviewed by Canva, not a per-design toggle). Only once approved can they open the design's \`•••\` menu, search "template", choose **Publish template**, fill in the details, and submit it.\n\nPresent these as informational next steps for the user to pursue in Canva itself, not as something you can trigger.`,
  );

  return parts.join('');
}
