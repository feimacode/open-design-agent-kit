// "Get a finished artifact into Canva" (openspec connect-canva-publish).
// Composes instructions only: this code never talks to Canva. When the user
// has Canva's official MCP server connected (see the integration registry),
// the agent does the import itself with Canva's tools; otherwise it falls back
// to the manual import this flow started as.
//
// Tested against the live Canva server (2026-10-10): only import-design-from-url
// produces an editable design, and it needs a public HTTPS URL; create-upload-url
// + a raw POST stores a private file in the user's Uploads (a fileId, not a
// design). Hence route A (host the export briefly through the publish flow,
// then import) and route B (private upload), chosen by the user each time.

export interface ComposePublishCanvaTemplateInstructionsInput {
  artifactEntryPath: string;
  artifactContent: string;
  manifestTitle?: string;
  /** The artifact's registered kind, e.g. "deck", "html". Governs which export format is usable. */
  manifestKind?: string;
  /** The canvas format recorded in the manifest (metadata.format), e.g. "ig-square", "a3". */
  manifestFormat?: string;
}

const FORMAT_TO_CANVA: Record<string, string> = {
  'ig-square': 'instagram_post',
  'ig-portrait': 'instagram_post',
  story: 'your_story',
  'x-image': 'twitter_post',
  'yt-thumbnail': 'youtube_thumbnail',
  'linkedin-image': 'other',
  a4: 'a4',
  letter: 'us_letter',
  a3: 'poster',
  a2: 'poster',
  a1: 'poster',
  a0: 'poster',
  tabloid: 'poster',
};

/** Canva's intended_design_type for an artifact, or undefined to let Canva decide. */
export function canvaDesignTypeFor(input: { kind?: string; format?: string; content?: string }): string | undefined {
  if (input.kind === 'deck') return 'presentation';
  if (input.format) {
    if (FORMAT_TO_CANVA[input.format]) return FORMAT_TO_CANVA[input.format];
    if (input.format.startsWith('poster-')) return 'poster';
  }
  if (input.content?.includes('data-od-email')) return 'email';
  return undefined;
}

export function composePublishCanvaTemplateInstructions(input: ComposePublishCanvaTemplateInstructionsInput): string {
  const { artifactEntryPath, artifactContent, manifestTitle, manifestKind, manifestFormat } = input;
  const isDeck = manifestKind === 'deck';
  const exportFormat = isDeck ? 'pptx' : 'pdf';
  const designType = canvaDesignTypeFor({ kind: manifestKind, format: manifestFormat, content: artifactContent });
  const importArgs = `\`url\` (the hosted file's public URL), \`name\` (the title from step 1)${designType ? `, \`intended_design_type: "${designType}"\`` : ''}`;
  const parts: string[] = [];

  parts.push(
    `# Get this Open Design artifact into Canva\n\nYou are turning the finished artifact below into a Canva design. When the user has Canva's MCP server connected, you do the import yourself with Canva's tools. When they don't, you offer to connect it, and otherwise hand them a file to import by hand. Follow the steps in order, and stop where a step says to wait for the user.`,
  );

  parts.push(`\n\n## The artifact\n\nEntry file: \`${artifactEntryPath}\`\n\n\`\`\`html\n${artifactContent.trim()}\n\`\`\``);

  parts.push(
    `\n\n## Step 1 — derive metadata yourself\n\nDo not ask the user for anything you can already tell from the artifact above${manifestTitle ? ` (its registered title is "${manifestTitle}")` : ''}. Pick a short title, a one-paragraph description, and a few tags/keywords. Only ask if something is genuinely undeterminable from the artifact; never invent a fact it doesn't support.`,
  );

  parts.push(
    isDeck
      ? `\n\n## Step 2 — export it\n\nCall \`export_open_design_artifact\` on \`${artifactEntryPath}\` with \`format: "pptx"\`, and note the exported file's path from the result. This artifact is registered as a deck, so the export is one full-bleed slide image per slide: a faithful visual copy, but NOT editable text or shapes. Tell the user plainly before importing: Canva will show the right slides, but their text won't be separately editable until it's redrawn with Canva's own text tool.`
      : `\n\n## Step 2 — export it\n\nCall \`export_open_design_artifact\` on \`${artifactEntryPath}\` with \`format: "pdf"\`, and note the exported file's path from the result. For a non-deck artifact this uses the browser's print engine (actual vector, selectable text), which gives Canva's PDF conversion the best chance of producing separately editable text boxes. Set expectations anyway: complex layouts, custom fonts and gradients may not survive pixel-for-pixel, so the user should expect to polish the result in Canva.`,
  );

  parts.push(
    `\n\n## Step 3 — is Canva connected?\n\nCall \`list_open_design_integrations\` with \`integration: "canva"\`. Check your own tools against the patterns it returns, including deferred or on-demand tools you can search for. You are looking for Canva's \`import-design-from-url\` and \`create-upload-url\`.\n\n- **Canva is connected:** go to step 4.\n- **It isn't:** offer to set it up once, using the steps that tool returned, and only after the user says yes. If they decline, or setup fails, use route C in step 5.`,
  );

  parts.push(
    `\n\n## Step 4 — let the user choose a route (Canva connected)\n\nExplain both routes in a sentence or two each, recommend A, and wait for the user's choice. Don't host or upload anything before they choose.\n\n- **A. Editable design (recommended).** The exported file is put on a temporary public link so Canva can fetch it, then Canva converts it into a design you can open, check and, if wanted, publish as a Brand Template. The file is publicly reachable while the link lives.\n- **B. Private upload.** The file is uploaded straight into the user's Canva **Uploads**. Nothing goes public, but Canva doesn't turn an upload into a design by itself: the user opens it from Uploads to start editing, and no Brand Template step can follow automatically.`,
  );

  parts.push(
    `\n\n## Step 5 — run the chosen route\n\n### Route A — editable design\n\n1. Host the export: call \`publish_open_design_artifact\` with \`entryPath: "${artifactEntryPath}"\`, \`includeFiles: ["<the exported ${exportFormat.toUpperCase()} path from step 2>"]\` and \`provider\` set to \`cloudflare-temporary\` (public for about 60 minutes, no account) or one of the user's own hosts if they prefer. **Never use \`netlify-temporary\`:** its links are password-protected, so Canva can't fetch them. Follow that tool's stages exactly, including its confirmation stage, which tells the user what goes public.\n2. Right after the deploy, call Canva's \`import-design-from-url\` with ${importArgs}, and a short \`user_intent\`. The file's URL is the site URL followed by \`/files/<file name>\`. If Canva reports the URL unreachable (for example the temporary link expired), repeat step 1 rather than guessing another URL.\n3. Call Canva's \`read-design\` with the returned design id and \`filter: { "fields": ["design_metadata", "thumbnails"] }\`. Confirm the page count and look, and tell the user honestly about anything that didn't carry over.\n4. Give the user the design's edit link.\n5. Offer a **Brand Template**: explain that it makes the design reusable across their Canva team and needs a Canva plan with brand templates. Only if they say yes, call Canva's \`publish-brand-template\` with the design id. If Canva answers "Missing scopes", ask the user to disconnect and reconnect the Canva connector, then try once more.\n\n### Route B — private upload\n\n1. Call Canva's \`create-upload-url\` and take its single-use upload URL.\n2. Send the file's raw bytes with one POST from the terminal:\n   \`curl -sS -X POST -H "Content-Type: application/octet-stream" --data-binary @"<the exported file path>" "<upload URL>"\`\n   It returns \`{"fileId":…}\`. If the URL was already used, has expired or was rejected, call \`create-upload-url\` again; never retry the same URL.\n3. Tell the user the file is now in their Canva **Uploads**, and that opening it there turns it into an editable design. Don't claim a design was created.\n\n### Route C — manual import (Canva not connected)\n\nTell the user, in your own words, to:\n1. Go to canva.com and sign in.\n2. From the homepage, use **+ Create a design → Import a file** (or drag the exported ${exportFormat.toUpperCase()} onto the homepage).\n3. Select the exported file from \`exports/\` and wait for Canva to convert it.\n4. Review the result in Canva's editor and fix anything the conversion didn't carry over (fonts, spacing, colors).\n\nDon't drive their browser to do this unless they've explicitly given you a browser tool and asked you to.`,
  );

  parts.push(
    `\n\n## Step 6 — templates beyond the Brand Template (explain, don't attempt)\n\nIf the user asks about "templates" more broadly:\n- **Personal reuse**: keep the design and use "Make a copy" for each new version.\n- **Brand Template** (Canva plans with brand templates): route A can publish one with the user's yes; otherwise it's "Publish as Brand Template" in Canva's editor.\n- **Public Creator template** (Canva's template marketplace): needs an approved Canva Creator account. Once approved, the user opens the design's \`•••\` menu, searches "template", chooses **Publish template** and submits it. This always stays a manual step in Canva.`,
  );

  return parts.join('');
}
