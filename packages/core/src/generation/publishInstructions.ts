// "Publish this artifact" — composes instructions only, like
// shareToCommunityInstructions and portToAppInstructions. The bundle is
// already built (a local, reversible export); everything that reaches the
// internet is done by the model with its own terminal, under the user's own
// CLI login, and only after an explicit yes. openspec: add-artifact-sharing.
import type { PackageExportResult } from '../export/packageArtifact';
import { PUBLISH_PROVIDERS, type PublishProvider, type ShareRecord } from '../workspace/shareRecords';
import { PUBLISH_RECIPES, type RecipeContext } from './publishProviders';

export const PUBLISH_TOOL_NAME = 'publish_open_design_artifact';

type PackagedSite = Extract<PackageExportResult, { ok: true }>;

export interface ComposePublishInstructionsInput {
  entryPath: string;
  title?: string;
  bundle: PackagedSite;
  /** Absolute path of bundle.output. */
  bundleDir: string;
  provider?: PublishProvider;
  /** Every share record for this artifact, oldest first. */
  records: ShareRecord[];
  siteName: string;
  slug: string;
  today: string;
  /** Bundle paths of extra hosted files (includeFiles), e.g. files/poster.pdf. */
  includedFiles?: string[];
}

/** Short kebab-case name from a title or file name. */
export function slugForShare(title: string | undefined, entryPath: string): string {
  const fromTitle = (title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const fromFile = (entryPath.split('/').pop() ?? '').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (fromTitle || fromFile || 'design').slice(0, 30).replace(/-+$/g, '') || 'design';
}

/** `od-<slug>-<4 hex>`: hosts with a global namespace (netlify.app, pages.dev) need a name nobody else has. */
export function siteNameForShare(slug: string, random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 0x10000).toString(16).padStart(4, '0');
  return `od-${slug}-${suffix}`;
}

function bundleSummary(input: ComposePublishInstructionsInput): string {
  const { bundle } = input;
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  const lines = [
    `Bundle folder: \`${input.bundleDir}\` (${bundle.files.length} file(s), ${kb(bundle.totalBytes)}):`,
    ...bundle.files.map((f) => `- ${f.path} (${kb(f.bytes)})`),
    '',
    bundle.badge
      ? `Footer badge: **included** — a small "Made with Open Design · Remix this" note in the bottom corner, which viewers can close. To leave it out, call \`${PUBLISH_TOOL_NAME}\` again with \`badge: false\`.`
      : 'Footer badge: not included.',
  ];
  if (bundle.preflight.length > 0) {
    lines.push('', 'Preflight findings (none block publishing; mention the relevant ones to the user):', ...bundle.preflight.map((w) => `- [${w.code}] ${w.message}`));
  }
  if (bundle.warnings.length > 0) lines.push('', ...bundle.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}

function providerTable(): string {
  const rows = PUBLISH_PROVIDERS.map((id) => {
    const r = PUBLISH_RECIPES[id];
    return `| \`${id}\` | ${r.label} | ${r.account} | ${r.lifetime} | ${r.visibility} |`;
  });
  return ['| provider | host | account needed | link lasts | who can see it |', '|---|---|---|---|---|', ...rows].join('\n');
}

export function composePublishInstructions(input: ComposePublishInstructionsInput): string {
  const parts: string[] = [];
  const name = input.title ? `"${input.title}" (\`${input.entryPath}\`)` : `\`${input.entryPath}\``;
  parts.push(
    `# Publish ${name}\n\nThe artifact has been packaged into a deploy-ready folder (a local export; nothing is online yet). Publishing it makes it reachable on the internet, under the user's own account or a temporary no-account link, so follow the stages below in order and do not skip the confirmation stage.`,
  );
  parts.push(`\n\n## The bundle\n\n${bundleSummary(input)}`);
  if (input.includedFiles?.length) {
    parts.push(
      `\n\n## Hosted files\n\nThese files go online with the page, each publicly downloadable at \`<site URL>/<path>\` once deployed:\n${input.includedFiles.map((f) => `- \`${f}\``).join('\n')}`,
    );
  }

  const live = input.records.filter((r) => !r.expiresAt || Date.parse(r.expiresAt) > Date.now());
  if (live.length > 0) {
    parts.push(`\n\n## Already published\n\n${live.map((r) => `- ${r.provider}: ${r.url}${r.expiresAt ? ` (expires ${r.expiresAt})` : ''}`).join('\n')}`);
  }

  if (!input.provider) {
    parts.push(
      `\n\n## Stage 1 — choose where to publish\n\nShow the user these options and ask which one they want. Don't pick for them.\n\n${providerTable()}\n\nA temporary link suits a quick look ("can you see this?"). For a review that lasts days, or a link to keep, recommend their own account. Once they choose, call \`${PUBLISH_TOOL_NAME}\` again with the same \`entryPath\` and \`provider\` set to their choice, and follow the instructions it returns. Stop here until then.`,
    );
    return parts.join('');
  }

  const recipe = PUBLISH_RECIPES[input.provider];
  const ctx: RecipeContext = {
    bundleDir: input.bundleDir,
    siteName: input.siteName,
    slug: input.slug,
    siteRef: recipe.temporary && input.provider !== 'cloudflare-temporary' ? undefined : [...input.records].reverse().find((r) => r.provider === input.provider && r.siteRef)?.siteRef,
    today: input.today,
  };
  parts.push(`\n\n## Stage 1 — check the tool and login (${recipe.label})\n\n${recipe.check(ctx)}`);

  const confirmPoints = [
    `where: ${recipe.label}${ctx.siteRef ? `, updating the existing site \`${ctx.siteRef}\`` : ', as a new site'}`,
    `what: the ${input.bundle.files.length} file(s) listed above, and nothing else from the workspace`,
    `who can see it: ${recipe.visibility} — anyone with the link`,
    `how long: ${recipe.lifetime}`,
    input.bundle.badge ? 'the footer badge is included, and can be left out (badge: false)' : 'no footer badge',
    ...recipe.caveats,
  ];
  parts.push(
    `\n\n## Stage 2 — confirm before anything goes online\n\nStop and tell the user, in plain words:\n${confirmPoints.map((p) => `- ${p}`).join('\n')}\n\nThen ask whether to publish now. Do NOT run any deploy command until the user has said yes in this conversation. If they want changes first (for example no badge), make them and start again.`,
  );

  parts.push(
    `\n\n## Stage 3 — deploy, only once confirmed\n\n${recipe.deploy(ctx)}\n\nRules:\n- Deploy only the bundle folder above. Never deploy the workspace root or any other folder.\n- If a command fails, show the user the actual error and stop. Don't retry with commands you guessed, other than a retry these steps spell out.\n- Never invent an account, team, owner, project or token. If the CLI asks for one, ask the user.`,
  );

  parts.push(
    `\n\n## Stage 4 — report and record\n\n${recipe.report(ctx)}\n\nTell the user the link${recipe.temporary ? ', when it expires, and the claim URL (for them only)' : ''}. Then record it by calling \`${PUBLISH_TOOL_NAME}\` with:\n\n\`\`\`json\n{ "entryPath": "${input.entryPath}", "published": { "provider": "${input.provider}", "url": "<url>"${recipe.temporary ? ', "claimUrl": "<claim url>", "expiresAt": "<ISO time>"' : ''}, "siteRef": "<siteRef, if any>" } }\n\`\`\`\n\nThis lets the next publish update the same site, and lets the user copy the link later.`,
  );

  if (!recipe.temporary) {
    const og = input.bundle.ogImage;
    parts.push(
      og?.tag
        ? '\n\n## Link preview\n\nThe page already carries a preview image for link unfurls in Slack, X and similar.'
        : og?.file
          ? `\n\n## Stage 5 (optional) — link preview image\n\nLink previews currently show the title and description only, because \`og:image\` needs the site's own address. After recording, offer to redeploy once: call \`${PUBLISH_TOOL_NAME}\` again with the same provider (the bundle will then include the image tag), tell the user it's the same content plus the preview tag, and repeat Stage 3.`
          : `\n\n## Link preview\n\nThere's no preview image yet. If the user wants one in Slack or X unfurls, export a PNG first (\`export_open_design_artifact\`), then publish again.`,
    );
  }
  return parts.join('');
}
