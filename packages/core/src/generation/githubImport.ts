// Fetches design-token-like content from a GitHub repository — no auth, no
// SDK, just plain HTTPS requests to raw.githubusercontent.com (and one
// api.github.com call to resolve a bare repo's default branch). Public
// repos only in this round; private-repo support would need a stored
// personal access token (context.secrets), deferred alongside Figma import.
// Same never-throw posture as brandExtraction.ts: any failure degrades to
// an empty/partial result with warnings, never rejects.

const FETCH_TIMEOUT_MS = 8000;
const MAX_TEXT_LENGTH = 1_000_000;
const MAX_CANDIDATES = 3;

// Common locations a design token set is plausibly checked in at. DESIGN.md
// is probed first and, if found, used alone (it's already in the exact
// shape this catalog wants) rather than being concatenated with the rest.
const CANDIDATE_PATHS = [
  'tailwind.config.js',
  'tailwind.config.ts',
  'tailwind.config.cjs',
  'tokens.json',
  'design-tokens.json',
  'design-tokens/tokens.json',
  'src/styles/tokens.css',
  'src/tokens.css',
  'tokens.css',
  'variables.css',
  'src/styles/variables.css',
  'theme.json',
];

export interface GithubRef {
  owner: string;
  repo: string;
  branch?: string;
  /** Present only when the URL pointed at one specific file. */
  path?: string;
}

// Pure — no network. Accepts a `github.com/{owner}/{repo}[/blob/{branch}/{path}]`
// or `github.com/{owner}/{repo}/tree/{branch}` URL, or an already-raw
// `raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}` URL.
export function normalizeGithubUrl(url: string): GithubRef | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  if (parsed.hostname === 'raw.githubusercontent.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return undefined;
    const [owner, repo, branch, ...rest] = parts;
    return { owner, repo, branch, path: rest.join('/') };
  }

  if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return undefined;
    const [owner, repo, kind, branch, ...rest] = parts;
    if (kind === 'blob' && branch && rest.length > 0) {
      return { owner, repo, branch, path: rest.join('/') };
    }
    if (kind === 'tree' && branch) {
      return { owner, repo, branch };
    }
    return { owner, repo };
  }

  return undefined;
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (!response.ok) return undefined;
    const text = await response.text();
    return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveDefaultBranch(owner: string, repo: string, warnings: string[]): Promise<string | undefined> {
  const text = await fetchText(`https://api.github.com/repos/${owner}/${repo}`, { Accept: 'application/vnd.github+json' });
  if (!text) {
    warnings.push(`Could not look up the "${owner}/${repo}" repository (it may be private, or rate-limited without authentication).`);
    return undefined;
  }
  try {
    const data = JSON.parse(text);
    return typeof data.default_branch === 'string' ? data.default_branch : 'main';
  } catch {
    return 'main';
  }
}

export interface FetchGithubDesignTokensResult {
  sourceLabel: string;
  content: string;
  warnings: string[];
}

export async function fetchGithubDesignTokens(url: string): Promise<FetchGithubDesignTokensResult> {
  const warnings: string[] = [];
  const ref = normalizeGithubUrl(url);
  if (!ref) {
    return { sourceLabel: url, content: '', warnings: [`"${url}" doesn't look like a GitHub repository or file URL.`] };
  }

  // A direct file reference (blob URL or already-raw URL) — fetch exactly
  // that file, nothing else.
  if (ref.path) {
    const branch = ref.branch ?? 'main';
    const rawUrl = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/${ref.path}`;
    const text = await fetchText(rawUrl);
    if (!text) warnings.push(`Could not fetch ${rawUrl}.`);
    return { sourceLabel: `${ref.owner}/${ref.repo}/${ref.path}`, content: text ?? '', warnings };
  }

  const branch = ref.branch ?? (await resolveDefaultBranch(ref.owner, ref.repo, warnings));
  if (!branch) return { sourceLabel: `${ref.owner}/${ref.repo}`, content: '', warnings };

  const designMd = await fetchText(`https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/DESIGN.md`);
  if (designMd) {
    return { sourceLabel: `${ref.owner}/${ref.repo}/DESIGN.md`, content: designMd, warnings };
  }

  const foundPaths: string[] = [];
  const parts: string[] = [];
  for (const candidate of CANDIDATE_PATHS) {
    if (foundPaths.length >= MAX_CANDIDATES) break;
    const text = await fetchText(`https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/${candidate}`);
    if (text) {
      foundPaths.push(candidate);
      parts.push(`/* file: ${candidate} */\n${text}`);
    }
  }

  if (foundPaths.length === 0) {
    warnings.push(`No design-token-like files were found at common paths in ${ref.owner}/${ref.repo} — try pointing directly at a file instead of the repo root.`);
  }

  return {
    sourceLabel: `${ref.owner}/${ref.repo}${foundPaths.length > 0 ? ` (${foundPaths.join(', ')})` : ''}`,
    content: parts.join('\n\n'),
    warnings,
  };
}
