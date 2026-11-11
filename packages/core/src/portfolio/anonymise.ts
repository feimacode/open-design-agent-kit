// Review versions (openspec add-portfolio-share-and-review): an anonymised copy
// of the portfolio for a community critique. The brief replaces the library's
// identifying facts (the owner's name, email and profile links, employers,
// clients, schools and live links) with neutral labels; the check then
// searches the built page where names usually leak: the text, alt text, file
// names, <title>, Open Graph and other meta tags, and link targets. Faces or
// logos inside pictures aren't detected: the recipe asks for redaction boxes.
import { load } from 'cheerio';
import type { Finding } from '../poster/preflight';
import type { Library, Project } from './library';
import type { Target } from './targets';

export interface IdentifyingTerm {
  term: string;
  /** What it is, for the message: "your name", "the employer of checkout-redesign"… */
  what: string;
  /** Links and emails match anywhere (a substring); names match whole words. */
  match: 'word' | 'substring';
}

/** The library's identifying facts for these projects. */
export function identifyingTerms(library: Library, projects: Project[]): IdentifyingTerm[] {
  const out: IdentifyingTerm[] = [];
  const seen = new Set<string>();
  const add = (term: string | undefined, what: string, match: IdentifyingTerm['match']) => {
    const t = (term ?? '').trim();
    if (t.length < 3 || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push({ term: t, what, match });
  };
  const o = library.owner;
  if (o.name) {
    add(o.name, 'your name', 'word');
    // Each part of the name on its own too ("Rivera" in an alt text or a file name).
    for (const part of o.name.split(/\s+/)) add(part, 'part of your name', 'word');
  }
  add(o.email, 'your email', 'substring');
  if (o.email) add(o.email.split('@')[0], 'your email name', 'word');
  for (const l of o.links ?? []) {
    add(bareUrl(l.url), `your ${l.label || 'profile'} link`, 'substring');
    const handle = handleOf(l.url);
    if (handle) add(handle, `your ${l.label || 'profile'} handle`, 'word');
  }
  for (const p of projects) {
    add(p.company, `the employer in ${p.slug}`, 'word');
    add(p.client, `the client in ${p.slug}`, 'word');
    for (const l of p.links ?? []) add(bareUrl(l.url), `a ${l.kind} link of ${p.slug}`, 'substring');
  }
  return out;
}

/** A URL without its protocol, "www." and trailing slash: "dribbble.com/samrivera". */
export function bareUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '').replace(/^mailto:/i, '').replace(/\/+$/, '') || undefined;
}

/** The handle in a profile URL ("samrivera" in dribbble.com/samrivera), when the path is one segment. */
function handleOf(url: string): string | undefined {
  const m = /^(?:[a-z]+:\/\/)?(?:www\.)?[^/]+\/@?([\w.-]{3,40})\/?$/i.exec(url.trim());
  return m?.[1];
}

/** The neutral label for a project's employer or client: the designer's own label from the target, else "Company A, 2025". */
export function neutralLabels(projects: Project[], target: Target | undefined): Map<string, string> {
  const labels = new Map<string, string>();
  const letters = new Map<string, string>();
  for (const p of projects) {
    const own = target?.review?.labels?.[p.slug];
    const org = (p.client ?? p.company ?? '').trim();
    if (!org) continue;
    if (own) {
      labels.set(p.slug, own);
      continue;
    }
    if (!letters.has(org.toLowerCase())) letters.set(org.toLowerCase(), String.fromCharCode(65 + letters.size));
    const year = (p.dates?.end ?? p.dates?.start ?? '').slice(0, 4);
    labels.set(p.slug, `${p.client ? 'Client' : 'Company'} ${letters.get(org.toLowerCase())}${/^\d{4}$/.test(year) ? `, ${year}` : ''}`);
  }
  return labels;
}

/** The brief's "Anonymise" part: what to replace with what. */
export function composeAnonymiseSection(library: Library, projects: Project[], target: Target): string {
  const labels = neutralLabels(projects, target);
  const lines = [
    '### Anonymise this version',
    '',
    'Reviewers see the work, not the designer. In every page, alt text, file name, `<title>`, meta and Open Graph tag and link, replace:',
    '',
    `- the designer's name, email and profile links: "the designer", no contact block, no social links`,
  ];
  for (const p of projects) {
    const label = labels.get(p.slug);
    const org = p.client ?? p.company;
    if (org && label) lines.push(`- ${org} (${p.slug}): "${label}"${target.review?.labels?.[p.slug] ? '' : ' (ask the designer for a sector word, e.g. "Grocery company, 2025", and save it in review.labels)'}`);
    if (p.links?.length) lines.push(`- ${p.slug}'s links (${p.links.map((l) => l.url).join(', ')}): leave them out`);
  }
  lines.push(
    '- any school, team or colleague name in the facts: a neutral word ("a design school", "the PM")',
    '',
    'Pictures keep their brief markup; if a picture shows a face, a logo or a name, ask the designer to add a redaction box (save_open_design_project with the asset\'s redactions) before building. The check can\'t see inside pictures.',
    `Build it as its own collection (e.g. \`${target.slug}\`), put \`<meta name="robots" content="noindex">\` in every page, publish it unlisted, and never link it from the real portfolio.`,
  );
  return lines.join('\n');
}

/** The brief's "Review post" part: the file to write beside the version. */
export function composeReviewPostSection(target: Target): string {
  const q = target.review?.questions ?? [];
  return [
    '### review-post.md',
    '',
    `Write \`review-post.md\` beside the home page, ready to paste${target.review?.community ? ` into ${target.review.community}` : ''} (follow that community's own posting rules from the notes):`,
    '',
    '1. Context: one or two lines on who it is for (the role or level the designer is aiming at), from the library, with no name.',
    `2. Questions: ${q.length ? q.map((x, i) => `${i + 1}. ${x}`).join(' ') : 'up to three the designer wants answered (ask them; at most three)'}`,
    `3. Not wanted: ${target.review?.notWanted ?? 'what the designer doesn\'t want feedback on (ask, e.g. "the colour palette is fixed by the brand")'}`,
    '4. The link: the unlisted address once published (leave `<link>` until then).',
  ].join('\n');
}

const META_SELECTOR = 'meta[property^="og:"], meta[name^="twitter:"], meta[name="description"], meta[name="author"], meta[property="article:author"]';

/** Each identifying term found in the page, as an error naming where. */
export function anonymityFindings(html: string, page: string, terms: IdentifyingTerm[]): Finding[] {
  const $ = load(html);
  const places: Array<{ where: string; text: string; selector?: string }> = [];
  places.push({ where: 'page title', text: $('title').text(), selector: 'title' });
  $(META_SELECTOR).each((_, el) => {
    const name = $(el).attr('property') ?? $(el).attr('name') ?? 'meta';
    places.push({ where: `${name} tag`, text: $(el).attr('content') ?? '', selector: `meta[${$(el).attr('property') ? 'property' : 'name'}="${name}"]` });
  });
  $('[alt]').each((_, el) => {
    places.push({ where: 'alt text', text: $(el).attr('alt') ?? '', selector: $(el).attr('data-od-asset') ? `[data-od-asset="${$(el).attr('data-od-asset')}"]` : undefined });
  });
  $('[src], [srcset], [poster], link[href]').each((_, el) => {
    const refs = [$(el).attr('src'), $(el).attr('poster'), ...(($(el).attr('srcset') ?? '').split(',').map((s) => s.trim().split(/\s+/)[0])), el.tagName === 'link' ? $(el).attr('href') : undefined];
    for (const ref of refs) if (ref && !ref.startsWith('data:')) places.push({ where: 'file name', text: decodeURIComponent(ref.split(/[?#]/)[0]) });
  });
  $('a[href], area[href], form[action]').each((_, el) => {
    places.push({ where: 'link target', text: $(el).attr('href') ?? $(el).attr('action') ?? '' });
  });
  const body = $('body').clone();
  body.find('script, style, template, noscript').remove();
  places.push({ where: 'text', text: body.text().replace(/\s+/g, ' ') });

  const findings: Finding[] = [];
  const reported = new Set<string>();
  for (const t of terms) {
    const re = t.match === 'word' ? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t.term)}(?![\\p{L}\\p{N}])`, 'iu') : new RegExp(escapeRe(t.term), 'i');
    for (const p of places) {
      if (!p.text || !re.test(p.text) || reported.has(`${t.term}|${p.where}`)) continue;
      reported.add(`${t.term}|${p.where}`);
      findings.push({
        check: 'review-anonymity',
        severity: 'error',
        message: `${page}: the ${p.where} still has "${t.term}" (${t.what}). A review version names no one: replace it with the neutral label from the brief, or remove it.`,
        ...(p.selector ? { selector: p.selector } : {}),
      });
    }
  }
  return findings;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
