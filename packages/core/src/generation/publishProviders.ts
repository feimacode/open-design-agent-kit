// How to publish a `site` bundle with each host's own CLI. Data only: the
// model runs these commands with its own terminal after the user confirms;
// this project never runs them, never sees a token. Commands were checked
// against netlify-cli 27.10, wrangler 4.147 and vercel 62.2 (see the
// add-artifact-sharing design, Open Questions). Keep every CLI detail here so
// a flag change is a one-place fix. openspec: add-artifact-sharing.
import type { PublishProvider } from '../workspace/shareRecords';

export interface RecipeContext {
  /** Absolute path of the bundle folder (exports/site). */
  bundleDir: string;
  /** A fresh, globally-unlikely name for a new site/project/worker. */
  siteName: string;
  /** Short kebab-case name for the artifact (GitHub Pages subfolder). */
  slug: string;
  /** From the newest share record for this provider, if any. */
  siteRef?: string;
  /** YYYY-MM-DD, for Wrangler's compatibility date. */
  today: string;
}

export interface ProviderRecipe {
  id: PublishProvider;
  label: string;
  temporary: boolean;
  /** One line each, for the provider-choice table. */
  account: string;
  lifetime: string;
  visibility: string;
  /** Step 1: confirm the CLI works and the login state is right. */
  check: (ctx: RecipeContext) => string;
  /** Step 2 (after confirmation): the commands, run from the bundle folder. */
  deploy: (ctx: RecipeContext) => string;
  /** How to read url / claimUrl / expiresAt / siteRef out of the output. */
  report: (ctx: RecipeContext) => string;
  /** Said to the user at the confirmation step. */
  caveats: string[];
}

const NETLIFY = 'npx -y netlify-cli@latest';
const WRANGLER = 'npx -y wrangler@latest';
const VERCEL = 'npx -y vercel@latest';

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const inBundle = (ctx: RecipeContext) => `cd ${shellQuote(ctx.bundleDir)}`;

export const PUBLISH_RECIPES: Readonly<Record<PublishProvider, ProviderRecipe>> = {
  'netlify-temporary': {
    id: 'netlify-temporary',
    label: 'Netlify, temporary (no account)',
    temporary: true,
    account: 'none',
    lifetime: 'about 60 minutes unless claimed',
    visibility: 'password-protected until claimed (Netlify sets the password)',
    check: () =>
      `Run \`${NETLIFY} status\`. If it shows a logged-in user, stop and suggest the \`netlify\` provider instead (a logged-in CLI refuses anonymous deploys without a linked site). Otherwise continue.`,
    deploy: (ctx) => `\`\`\`sh\n${inBundle(ctx)}\n${NETLIFY} deploy --allow-anonymous --dir . --no-build --json\n\`\`\``,
    report: () =>
      'From the JSON: `site_url` is the url, `claim_url` is the claimUrl, and expiresAt is 60 minutes from now. If the JSON has a `password`, tell the user viewers must enter it until the site is claimed. Leave siteRef out: an anonymous site can\'t be redeployed to. If the deploy fails with a daily-limit error, stop and say a Netlify login (the `netlify` provider) is needed.',
    caveats: [
      'The link expires in about 60 minutes unless the user claims it with a Netlify account.',
      'Until it is claimed, Netlify shows a password prompt; the deploy output gives the password.',
      'The claim URL contains a private token: give it to the user only, never post it with the share link.',
    ],
  },
  'cloudflare-temporary': {
    id: 'cloudflare-temporary',
    label: 'Cloudflare Workers, temporary (no account)',
    temporary: true,
    account: 'none',
    lifetime: '60 minutes unless claimed',
    visibility: 'public',
    check: () =>
      `Run \`${WRANGLER} whoami\`. If it shows a logged-in account, stop and suggest the \`cloudflare-pages\` provider instead (\`--temporary\` refuses to run while logged in; don't log the user out). Otherwise continue.`,
    deploy: (ctx) =>
      `\`\`\`sh\n${inBundle(ctx)}\n${WRANGLER} deploy . --temporary --name ${ctx.siteName} --compatibility-date ${ctx.today}\n\`\`\`\nThe first run shows Cloudflare's terms for temporary accounts. In an interactive terminal it asks for "yes": show the user the terms text and type "yes" only if they agree.`,
    report: (ctx) =>
      `The output prints "Temporary account ready" with a "Claim URL:" line (the claimUrl) and "Claim within:" (expiresAt is that long from now), then the Worker's \`https://${ctx.siteName}.<subdomain>.workers.dev\` address (the url). siteRef is \`${ctx.siteName}\`; Wrangler reuses the same temporary account for redeploys until it expires.`,
    caveats: [
      'The link expires in 60 minutes unless the user claims it with a Cloudflare account.',
      'The claim URL is private to the user: never post it with the share link.',
    ],
  },
  netlify: {
    id: 'netlify',
    label: 'Netlify (your account)',
    temporary: false,
    account: "the user's Netlify login",
    lifetime: 'until deleted',
    visibility: 'public',
    check: () => `Run \`${NETLIFY} status\`. If it doesn't show a logged-in user, stop and ask the user to run \`${NETLIFY} login\` themselves, then try again.`,
    deploy: (ctx) =>
      ctx.siteRef
        ? `\`\`\`sh\n${inBundle(ctx)}\n${NETLIFY} deploy --dir . --no-build --prod --json --site ${shellQuote(ctx.siteRef)}\n\`\`\``
        : `\`\`\`sh\n${inBundle(ctx)}\n${NETLIFY} deploy --dir . --no-build --prod --json --site-name ${ctx.siteName}\n\`\`\`\n(\`--site-name\` creates the site. If the CLI asks which team, ask the user; don't pick one.)`,
    report: () => 'From the JSON: `url` is the url and `site_id` is the siteRef.',
    caveats: ['The site is public at its netlify.app address until the user deletes it.'],
  },
  vercel: {
    id: 'vercel',
    label: 'Vercel (your account)',
    temporary: false,
    account: "the user's Vercel login",
    lifetime: 'until deleted',
    visibility: "public, unless the user's team protects production deployments",
    check: () => `Run \`${VERCEL} whoami\`. If it fails, stop and ask the user to run \`${VERCEL} login\` themselves, then try again.`,
    deploy: (ctx) => {
      const project = ctx.siteRef ?? ctx.siteName;
      const run = `\`\`\`sh\n${inBundle(ctx)}\n${VERCEL} deploy . --prod --yes --project ${shellQuote(project)} --format json\n\`\`\``;
      return ctx.siteRef
        ? run
        : `${run}\nIf it fails because project \`${project}\` doesn't exist, run \`${VERCEL} project add ${shellQuote(project)}\` once, then the deploy command once more.`;
    },
    report: (ctx) =>
      `The url is the production address the output reports (\`https://${ctx.siteRef ?? ctx.siteName}.vercel.app\` or the project's own domain), not the per-deployment URL. siteRef is the project name, \`${ctx.siteRef ?? ctx.siteName}\`.`,
    caveats: [
      'Production deployments are public by default. If the team has Deployment Protection on production, viewers will be asked to sign in to Vercel.',
    ],
  },
  'cloudflare-pages': {
    id: 'cloudflare-pages',
    label: 'Cloudflare Pages (your account)',
    temporary: false,
    account: "the user's Cloudflare login",
    lifetime: 'until deleted',
    visibility: 'public',
    check: () => `Run \`${WRANGLER} whoami\`. If it doesn't show an account, stop and ask the user to run \`${WRANGLER} login\` themselves, then try again.`,
    deploy: (ctx) => {
      const project = ctx.siteRef ?? ctx.siteName;
      const create = ctx.siteRef ? '' : `${WRANGLER} pages project create ${project} --production-branch main\n`;
      return `\`\`\`sh\n${inBundle(ctx)}\n${create}${WRANGLER} pages deploy . --project-name ${project} --branch main --commit-dirty=true\n\`\`\``;
    },
    report: (ctx) =>
      `The url is \`https://${ctx.siteRef ?? ctx.siteName}.pages.dev\` (the production address; the output also prints a per-deployment address). siteRef is \`${ctx.siteRef ?? ctx.siteName}\`.`,
    caveats: ['The site is public at its pages.dev address until the user deletes the project.'],
  },
  'github-pages': {
    id: 'github-pages',
    label: 'GitHub Pages (your account)',
    temporary: false,
    account: "the user's GitHub login (gh)",
    lifetime: 'until deleted',
    visibility: 'public, and so is the repository holding it',
    check: () =>
      'Run `gh auth status`. If it reports not logged in, stop and ask the user to run `gh auth login` themselves. Then get the owner with `gh api user --jq .login`. Never invent an owner.',
    deploy: (ctx) => {
      const [repoOwner, repoName, folder] = ctx.siteRef ? ctx.siteRef.split('/') : [];
      const repo = repoOwner && repoName ? `${repoOwner}/${repoName}` : '<owner>/od-shares';
      const sub = folder ?? ctx.slug;
      return [
        `Publish into the subfolder \`${sub}/\` of the repository \`${repo}\`, one folder per shared design:`,
        `1. \`gh repo view ${repo}\`. If it doesn't exist, create it: \`gh repo create od-shares --public --description "Designs shared from Open Design"\` (GitHub Pages on a free plan needs a public repository).`,
        `2. Clone it into a new temporary directory **outside this workspace**: \`gh repo clone ${repo} <tmp>\`.`,
        `3. Replace \`<tmp>/${sub}/\` with the contents of ${shellQuote(ctx.bundleDir)}, and make sure \`<tmp>/.nojekyll\` exists (so folders starting with "_" or "." are served).`,
        `4. Commit ("Publish ${sub}") and push to the default branch.`,
        `5. Enable Pages once: \`gh api -X POST repos/${repo}/pages -f "source[branch]=<default branch>" -f "source[path]=/"\`. A "409" or "already enabled" answer is fine.`,
        `6. Delete the temporary clone.`,
      ].join('\n');
    },
    report: (ctx) => {
      const [repoOwner, repoName, folder] = ctx.siteRef ? ctx.siteRef.split('/') : [];
      const sub = folder ?? ctx.slug;
      const owner = repoOwner ?? '<owner>';
      const name = repoName ?? 'od-shares';
      return `The url is \`https://${owner}.github.io/${name}/${sub}/\` (the first Pages build takes a minute or two; \`gh api repos/${owner}/${name}/pages/builds/latest --jq .status\` shows "built" when it's live). siteRef is \`${owner}/${name}/${sub}\`.`;
    },
    caveats: [
      'GitHub Pages sites are public, even from private repositories, and the od-shares repository itself is public: anyone can read the files.',
    ],
  },
};
