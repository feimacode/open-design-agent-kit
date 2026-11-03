// Flow findings for a collection (openspec add-linked-flows) and store-rules
// notes (openspec add-app-screens): read from the screens' HTML with cheerio,
// no browser. Pure apart from the inputs it is given.
import * as path from 'node:path';
import * as cheerio from 'cheerio';
import type { Finding } from '../poster/preflight';
import { SHARED_NAV_PATH, slugifyScreenId, type FlowPlan, type FlowTask } from '../generation/flowPlan';

export interface FlowScreenSource {
  /** The screen's id: its flow id, else its slugified screenRole, else its file name. */
  id: string;
  title: string;
  /** Workspace-relative entry path. */
  entryPath: string;
  /** The screen's HTML as written (includes not resolved), or undefined when the file is missing. */
  html?: string;
}

export interface FoundLink {
  from: string;
  to: string;
  trigger: string;
  /** True when the link targets a file or screen that doesn't exist. */
  broken: boolean;
  /** The raw target, for broken links. */
  target: string;
}

export interface FlowAnalysis {
  findings: Finding[];
  links: FoundLink[];
  /** Planned links that no screen has. */
  missingLinks: Array<{ from: string; trigger: string; to: string }>;
  /** Each planned task's shortest path over the real links (screen ids), or undefined when there is none. */
  taskPaths: TaskPath[];
}

export interface TaskPath {
  task: FlowTask;
  /** Screen ids from start to end; undefined when the end can't be reached. */
  path?: string[];
  /** The label followed at each step (one fewer than the screens). */
  triggers?: string[];
}

/** The shortest path for each task over the links found in the screens (breadth-first; a step is one link followed). */
export function taskPathsOf(tasks: FlowTask[], links: FoundLink[]): TaskPath[] {
  return tasks.map((task) => {
    if (task.start === task.end) return { task, path: [task.start], triggers: [] };
    const prev = new Map<string, { from: string; trigger: string }>();
    const seen = new Set([task.start]);
    const queue = [task.start];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const l of links) {
        if (l.from !== id || l.broken || seen.has(l.to)) continue;
        seen.add(l.to);
        prev.set(l.to, { from: id, trigger: l.trigger });
        if (l.to === task.end) {
          const path = [task.end];
          const triggers: string[] = [];
          let cur = task.end;
          while (cur !== task.start) {
            const p = prev.get(cur)!;
            triggers.unshift(p.trigger);
            path.unshift(p.from);
            cur = p.from;
          }
          return { task, path, triggers };
        }
        queue.push(l.to);
      }
    }
    return { task };
  });
}

/** task-unreachable and task-too-long for each task path. */
export function taskFindings(paths: TaskPath[]): Finding[] {
  const out: Finding[] = [];
  for (const { task, path: p, triggers } of paths) {
    if (!p) {
      out.push({
        check: 'task-unreachable',
        severity: 'error',
        screen: task.start,
        message: `"${task.name}" can't be finished: no chain of links leads from ${task.start} to ${task.end}. Add the missing link (the flow map shows which screens are connected).`,
      });
      continue;
    }
    const steps = p.length - 1;
    if (task.maxSteps !== undefined && steps > task.maxSteps) {
      const route = p.map((id, i) => (i === 0 ? id : `"${triggers![i - 1]}" → ${id}`)).join(' ');
      out.push({
        check: 'task-too-long',
        severity: 'warning',
        screen: task.start,
        message: `"${task.name}" takes ${steps} steps (${route}); it should take at most ${task.maxSteps}. Link the screens more directly or merge a step.`,
      });
    }
  }
  return out;
}

const text = (s: string) => s.replace(/\s+/g, ' ').trim();

function isLocalHtml(href: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('//') && !href.startsWith('#') && /\.html?(?:[?#].*)?$/i.test(href);
}

/** The links on one screen's markup (and its shared nav, when it includes it) to other screens. */
export function linksOf(
  html: string,
  from: string,
  entryPath: string,
  idByPath: Map<string, string>,
  ids: Set<string>,
): FoundLink[] {
  const $ = cheerio.load(html);
  const dir = path.posix.dirname(entryPath);
  const out: FoundLink[] = [];
  $('a[href], [data-od-goto]').each((_, el) => {
    const $el = $(el);
    const goto = $el.attr('data-od-goto');
    const href = $el.attr('href');
    const trigger = text($el.text()) || $el.attr('aria-label') || $el.attr('title') || '';
    if (href && isLocalHtml(href)) {
      const target = path.posix.normalize(path.posix.join(dir, href.replace(/[?#].*$/, '')));
      const to = idByPath.get(target);
      const named = goto ? slugifyScreenId(goto) : slugifyScreenId(path.posix.basename(target, path.posix.extname(target)));
      out.push({ from, to: to ?? named, trigger, broken: !to, target: href });
    } else if (goto) {
      const to = slugifyScreenId(goto);
      out.push({ from, to, trigger, broken: !ids.has(to), target: goto });
    }
  });
  return out;
}

function navLabels(html: string): string[] {
  const $ = cheerio.load(html);
  const nav = $('nav').first();
  return (nav.length ? nav.find('a, button') : $('a, button'))
    .map((_, el) => text($(el).text()))
    .get()
    .filter(Boolean);
}

/** Every flow finding for a collection's screens against its plan and shared navigation. */
export function analyzeFlow(input: {
  screens: FlowScreenSource[];
  plan?: FlowPlan;
  /** The shared navigation fragment, when the collection has one. */
  sharedNav?: string;
  /** The collection's directory, workspace-relative. */
  collectionDir: string;
}): FlowAnalysis {
  const findings: Finding[] = [];
  const { screens, plan } = input;
  const idByPath = new Map(screens.map((s) => [s.entryPath, s.id]));
  const built = new Map(screens.filter((s) => s.html !== undefined).map((s) => [s.id, s]));
  const ids = new Set(screens.map((s) => s.id));
  const planned = new Set(plan?.screens.map((p) => p.id) ?? []);
  const links: FoundLink[] = [];

  for (const s of screens) {
    if (s.html === undefined) continue;
    const own = linksOf(s.html, s.id, s.entryPath, idByPath, ids);
    const includesNav = /data-od-include\s*=\s*["'][^"']*_shared\/nav\.html/i.test(s.html);
    const nav = includesNav && input.sharedNav ? linksOf(input.sharedNav, s.id, path.posix.join(input.collectionDir, SHARED_NAV_PATH), idByPath, ids) : [];
    for (const l of own) {
      if (l.broken) findings.push({ check: 'flow-broken-link', severity: 'error', screen: s.id, message: `"${l.trigger || l.target}" links to ${l.target}, which isn't a screen of this collection.` });
    }
    links.push(...own, ...nav.filter((l) => l.to !== s.id));
    // A link to a planned screen that isn't built yet still counts as a way on (flow-unfilled reports the screen).
    const forward = [...own, ...nav].filter((l) => l.to !== s.id && (!l.broken || planned.has(l.to)));
    const $ = cheerio.load(s.html);
    const markedEnd = $('body').is('[data-od-end]') || plan?.screens.find((p) => p.id === s.id)?.end === true;
    if (forward.length === 0 && !markedEnd && screens.length > 1) {
      findings.push({ check: 'flow-dead-end', severity: 'warning', screen: s.id, message: `"${s.title}" links to no other screen, so a user who reaches it is stuck. Add a way forward or back, or put data-od-end on <body> if the flow ends here.` });
    }
    if (plan?.nav && plan.nav.length > 0) {
      if (!includesNav) {
        const labels = navLabels(s.html);
        const shared = plan.nav.map((n) => n.label);
        const differs = $('nav').length > 0 && shared.some((label) => !labels.includes(label));
        if (differs || $('nav').length === 0) {
          findings.push({
            check: 'flow-nav-drift',
            severity: 'warning',
            screen: s.id,
            message: differs
              ? `"${s.title}" writes its own navigation (${labels.slice(0, 7).join(', ') || 'no labels'}) instead of the shared one (${shared.join(', ')}). Replace it with <template data-od-include="${SHARED_NAV_PATH}"></template>.`
              : `"${s.title}" doesn't include the shared navigation. Add <template data-od-include="${SHARED_NAV_PATH}"></template> where it goes.`,
          });
        }
      }
    }
  }

  if (plan?.nav && plan.nav.length > 0 && input.sharedNav === undefined) {
    findings.push({ check: 'flow-nav-drift', severity: 'warning', message: `The plan has a shared navigation but ${path.posix.join(input.collectionDir, SHARED_NAV_PATH)} doesn't exist. Write it once with ${plan.nav.map((n) => n.label).join(', ')}.` });
  } else if (plan?.nav && input.sharedNav !== undefined) {
    const labels = navLabels(input.sharedNav);
    const missing = plan.nav.filter((n) => !labels.includes(n.label)).map((n) => n.label);
    if (missing.length > 0) findings.push({ check: 'flow-nav-drift', severity: 'warning', message: `The shared navigation is missing ${missing.map((m) => `"${m}"`).join(', ')} from the plan.` });
  }

  const missingLinks: FlowAnalysis['missingLinks'] = [];
  if (plan) {
    for (const p of plan.screens) {
      const s = built.get(p.id);
      const empty = s?.html !== undefined && text(cheerio.load(s.html)('body').text()).length === 0;
      if (!s || empty) {
        findings.push({ check: 'flow-unfilled', severity: 'warning', screen: p.id, message: s ? `The planned screen "${p.title}" is empty.` : `The planned screen "${p.title}" (${p.id}) hasn't been built or registered yet.` });
      }
    }
    for (const l of plan.links) {
      if (!built.has(l.from)) continue;
      const found = links.some((f) => f.from === l.from && f.to === l.to && !f.broken);
      if (!found) {
        missingLinks.push(l);
        findings.push({ check: 'flow-unlinked', severity: 'warning', screen: l.from, message: `The plan links "${l.trigger}" on ${l.from} to ${l.to}, and that screen has no such link. Add <a href="${l.to}.html" data-od-goto="${l.to}">${l.trigger}</a>.` });
      }
    }
  }
  const taskPaths = plan?.tasks ? taskPathsOf(plan.tasks, links) : [];
  findings.push(...taskFindings(taskPaths));
  return { findings, links, missingLinks, taskPaths };
}

const SIGN_UP = /sign[-\s]?up|register|create[-\s]account|sign[-\s]?in|log[-\s]?in|onboard/i;
const PAYWALL = /paywall|subscri|upgrade|pricing|premium|\bpro\b|trial/i;
const PERMISSION = /permission|allow (?:notifications|location|camera|contacts|photos|tracking)|enable (?:notifications|location|camera)/i;
const STORE_BRIEF = /app\s*store|play\s*store|google\s*play|testflight|ship(?:s|ping)? to (?:ios|android)|ios app|android app/i;

/** Store-rules notes for a collection with sign-up or paywall screens (openspec add-app-screens). */
export function storeRuleFindings(screens: FlowScreenSource[], brief: string | undefined): Finding[] {
  const roleOf = (s: FlowScreenSource) => `${s.id} ${s.title}`;
  const built = screens.filter((s) => s.html !== undefined);
  const signUp = built.filter((s) => SIGN_UP.test(roleOf(s)));
  const paywalls = built.filter((s) => PAYWALL.test(roleOf(s)));
  if (signUp.length === 0 && paywalls.length === 0) return [];
  const severity = brief && STORE_BRIEF.test(brief) ? 'warning' : 'info';
  const all = built.map((s) => ({ s, body: text(cheerio.load(s.html!)('body').text()).toLowerCase() }));
  const out: Finding[] = [];
  if (signUp.length > 0 && !all.some(({ body }) => /delete (?:my |your )?account|close (?:my |your )?account|account deletion/.test(body))) {
    out.push({ check: 'store-rules', severity, screen: signUp[0].id, message: 'There is a sign-up but no screen where the user can delete their account. The App Store and Play require account deletion reachable inside the app: add it to settings.' });
  }
  for (const p of paywalls) {
    const body = all.find((a) => a.s.id === p.id)!.body;
    const missing: string[] = [];
    if (!/restore/.test(body)) missing.push('"Restore purchases"');
    if (!/terms/.test(body)) missing.push('a Terms link');
    if (!/privacy/.test(body)) missing.push('a Privacy link');
    if (!/[$€£¥]\s?\d|\d\s?(?:usd|eur|gbp)|\/\s?(?:mo|month|yr|year|week)|per (?:month|year|week)/.test(body)) missing.push('the price and billing period');
    if (missing.length > 0) out.push({ check: 'store-rules', severity, screen: p.id, message: `The paywall "${p.title}" has no ${missing.join(', ')}. Store review expects them beside the purchase button.` });
  }
  for (const { s, body } of all) {
    if (PERMISSION.test(`${roleOf(s)} ${body}`) && /allow|enable/.test(body) && !/(?:so|to) (?:we|you) can|so that|because|we use|lets you|to (?:send|show|find|remind)/.test(body)) {
      out.push({ check: 'store-rules', severity, screen: s.id, message: `"${s.title}" asks for a permission without saying why. Say what the user gets from it before the system prompt.` });
    }
  }
  return out;
}
