// Flow plans for collections (openspec add-linked-flows, "screen-flows"): the
// screens of a multi-screen design, the links between them and the shared
// navigation, planned before the first screen and given to every screen's
// brief, then kept on each screen's manifest as metadata.flow. Ideas from
// OpenPencil's screen route inventory and shared-nav unification (MIT); the
// code is the kit's own. Pure: no I/O.
import * as path from 'node:path';
import { suggestCollectionScreenEntryPath } from './collectionEntryPath';

export const MAX_FLOW_SCREENS = 20;
export const MAX_FLOW_LINKS = 80;
export const MAX_NAV_ITEMS = 7;
/** The shared navigation fragment, relative to the collection's directory. */
export const SHARED_NAV_PATH = '_shared/nav.html';

export interface FlowScreen {
  /** A slug: the screen's role and its file name in the collection. */
  id: string;
  title: string;
  /** One line on what the screen is for. */
  role?: string;
  /** True when the flow ends here (no way forward is expected). */
  end?: boolean;
}

export interface FlowLink {
  from: string;
  /** The label of what the user taps, e.g. "Continue". */
  trigger: string;
  to: string;
}

export interface FlowNavItem {
  label: string;
  to: string;
}

export interface FlowPlan {
  screens: FlowScreen[];
  links: FlowLink[];
  /** The navigation every screen shares (a tab bar or sidebar), when the flow has one. */
  nav?: FlowNavItem[];
}

/** What a screen's manifest keeps: the plan and which screen it is. */
export interface FlowRecord {
  plan: FlowPlan;
  screenId: string;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function slugifyScreenId(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export type FlowPlanResult = { ok: true; plan: FlowPlan } | { ok: false; error: string };

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Checks a flow plan's shape and limits; screen ids are slugified, links must name planned screens. */
export function validateFlowPlan(value: unknown): FlowPlanResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'flow must be an object: { screens: [{ id, title, role }], links: [{ from, trigger, to }], nav?: [{ label, to }] }.' };
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.screens) || v.screens.length === 0) return { ok: false, error: 'flow.screens must list at least one screen: { id, title, role }.' };
  if (v.screens.length > MAX_FLOW_SCREENS) return { ok: false, error: `flow.screens has ${v.screens.length} screens; a flow plan holds at most ${MAX_FLOW_SCREENS}. Split it into two collections.` };
  const screens: FlowScreen[] = [];
  const ids = new Set<string>();
  for (const raw of v.screens as unknown[]) {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const id = slugifyScreenId(str(s.id) || str(s.title));
    if (!id || !SLUG.test(id)) return { ok: false, error: `Each flow screen needs an id (a short slug such as "sign-in"); got ${JSON.stringify(raw)}.` };
    if (ids.has(id)) return { ok: false, error: `flow.screens lists "${id}" twice.` };
    ids.add(id);
    screens.push({ id, title: str(s.title) || id, ...(str(s.role) ? { role: str(s.role) } : {}), ...(s.end === true ? { end: true } : {}) });
  }
  const linksIn = v.links === undefined ? [] : v.links;
  if (!Array.isArray(linksIn)) return { ok: false, error: 'flow.links must be a list of { from, trigger, to }.' };
  if (linksIn.length > MAX_FLOW_LINKS) return { ok: false, error: `flow.links has ${linksIn.length} links; at most ${MAX_FLOW_LINKS}.` };
  const links: FlowLink[] = [];
  for (const raw of linksIn as unknown[]) {
    const l = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const from = slugifyScreenId(str(l.from));
    const to = slugifyScreenId(str(l.to));
    const trigger = str(l.trigger);
    if (!ids.has(from) || !ids.has(to)) return { ok: false, error: `flow.links: "${str(l.from)}" → "${str(l.to)}" names a screen that isn't in flow.screens.` };
    if (!trigger) return { ok: false, error: `flow.links: the link from "${from}" to "${to}" needs a trigger, the label the user taps.` };
    links.push({ from, trigger, to });
  }
  let nav: FlowNavItem[] | undefined;
  if (v.nav !== undefined) {
    if (!Array.isArray(v.nav)) return { ok: false, error: 'flow.nav must be a list of { label, to }.' };
    if (v.nav.length > MAX_NAV_ITEMS) return { ok: false, error: `flow.nav has ${v.nav.length} items; shared navigation holds at most ${MAX_NAV_ITEMS}.` };
    nav = [];
    for (const raw of v.nav as unknown[]) {
      const n = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const to = slugifyScreenId(str(n.to));
      if (!str(n.label) || !ids.has(to)) return { ok: false, error: `flow.nav: each item needs a label and a "to" naming a planned screen; got ${JSON.stringify(raw)}.` };
      nav.push({ label: str(n.label), to });
    }
    if (nav.length === 0) nav = undefined;
  }
  return { ok: true, plan: { screens, links, ...(nav ? { nav } : {}) } };
}

/** The flow record on a manifest's metadata, when it has a valid one. */
export function flowRecordOf(metadata: unknown): FlowRecord | undefined {
  const flow = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).flow : undefined;
  if (!flow || typeof flow !== 'object') return undefined;
  const f = flow as Record<string, unknown>;
  const plan = validateFlowPlan(f.plan);
  if (!plan.ok || typeof f.screenId !== 'string') return undefined;
  return { plan: plan.plan, screenId: f.screenId };
}

/** The screen's entry path in the collection's directory. */
export function flowScreenEntryPath(outputDir: string, collectionId: string, screenId: string): string {
  return suggestCollectionScreenEntryPath(outputDir, collectionId, screenId);
}

/** The href from one screen's file to another's (siblings in the collection's directory). */
export function flowHref(screenId: string): string {
  return `${screenId}.html`;
}

/** The plan with `screenId` added (as the last screen) when it isn't planned yet. */
export function withScreen(plan: FlowPlan, screenId: string, title: string): { plan: FlowPlan; added: boolean } {
  if (plan.screens.some((s) => s.id === screenId)) return { plan, added: false };
  return { plan: { ...plan, screens: [...plan.screens, { id: screenId, title }] }, added: true };
}

/** The "Part of a planned flow" section of one screen's instructions. */
export function composeFlowSection(plan: FlowPlan, screenId: string, collectionDir: string): string {
  const me = plan.screens.find((s) => s.id === screenId);
  const screens = plan.screens.map((s) => `- \`${s.id}\` — ${s.title}${s.role ? `: ${s.role}` : ''}${s.end ? ' (ends the flow)' : ''}${s.id === screenId ? ' **← this screen**' : ''}`).join('\n');
  const own = plan.links.filter((l) => l.from === screenId);
  const ownLinks =
    own.length > 0
      ? own.map((l) => `- "${l.trigger}" → \`${l.to}\`: \`<a href="${flowHref(l.to)}" data-od-goto="${l.to}">${l.trigger}</a>\` (or a button inside that link)`).join('\n')
      : '- (none planned: this screen links nowhere; mark it `data-od-end` on <body> if the flow ends here)';
  const parts = [
    `## Part of a planned flow\n\nThis screen is \`${screenId}\`${me ? ` ("${me.title}")` : ''} in a flow of ${plan.screens.length} screen(s), all in \`${collectionDir}\`:\n\n${screens}\n\n### This screen's links\n\nWrite each one as a real link, so the flow can be clicked through in the preview and in an exported prototype:\n\n${ownLinks}\n\nA back link to the screen before it uses the same markup. Don't link to screens outside this plan.${me?.end ? ' This screen ends the flow: put `data-od-end` on its <body>.' : ''}`,
  ];
  if (plan.nav && plan.nav.length > 0) {
    const navFile = path.posix.join(collectionDir, SHARED_NAV_PATH);
    const items = plan.nav.map((n) => `- ${n.label} → \`${n.to}\``).join('\n');
    const active = plan.nav.find((n) => n.to === screenId);
    parts.push(
      `### Shared navigation\n\nEvery screen shares one navigation, written once so it can't drift between screens:\n\n${items}\n\nIf \`${navFile}\` doesn't exist yet, write it: just the navigation element (no <html> or <head>), with each item as \`<a href="<to>.html" data-od-goto="<to>">Label</a>\`, styled by classes this screen's CSS defines. Then put \`<template data-od-include="${SHARED_NAV_PATH}"></template>\` where the navigation goes on this screen; the kit replaces it with the file in the preview, the check and exports. Don't write a navigation of your own. ${active ? `On this screen "${active.label}" is the current item: add \`data-od-current="${active.to}"\` to <body>, and the kit marks the matching link with aria-current="page".` : 'This screen is not a navigation item; no item is current.'}`,
    );
  }
  parts.push(
    `### When you register\n\nPass \`flow\` (this same plan) and use \`${screenId}\` as screenRole. After the last screen, call check_open_design_artifact with this collection's \`collectionId\` to check links, dead ends, missing screens and navigation drift, and open the flow map it reports.`,
  );
  return parts.join('\n\n');
}

/** The flow a brief builds to: the plan given, else the latest registered one; undefined when there is none. */
export function resolveBriefFlow(
  flow: unknown,
  latest: FlowPlan | undefined,
  screenRole: string,
  suggestedEntryPath: string,
): { ok: true; context?: { plan: FlowPlan; screenId: string; collectionDir: string }; note?: string } | { ok: false; error: string } {
  let plan = latest;
  if (flow !== undefined) {
    const checked = validateFlowPlan(flow);
    if (!checked.ok) return checked;
    plan = checked.plan;
  }
  if (!plan) return { ok: true };
  const screenId = slugifyScreenId(screenRole);
  const withThis = withScreen(plan, screenId, screenRole);
  return {
    ok: true,
    context: { plan: withThis.plan, screenId, collectionDir: path.posix.dirname(suggestedEntryPath) },
    note: withThis.added ? `"${screenId}" isn't a screen in the flow plan, so it was added as the last screen with no links. Add its links to the plan if it belongs in the flow.` : undefined,
  };
}

/** The flow record a registration stores as metadata.flow. */
export function registeredFlow(
  flow: unknown,
  collectionId: string | undefined,
  screenRole: string | undefined,
): { ok: true; record?: FlowRecord; note?: string } | { ok: false; error: string } {
  if (flow === undefined) return { ok: true };
  if (!collectionId || !screenRole) return { ok: false, error: 'Failed to register artifact: flow needs collectionId and screenRole (this screen\'s id in the plan).' };
  const checked = validateFlowPlan(flow);
  if (!checked.ok) return { ok: false, error: `Failed to register artifact: ${checked.error}` };
  const screenId = slugifyScreenId(screenRole);
  const withThis = withScreen(checked.plan, screenId, screenRole);
  return {
    ok: true,
    record: { plan: withThis.plan, screenId },
    note: withThis.added ? `"${screenId}" wasn't in the flow plan, so it was added as the last screen. Check the collection with collectionId to see its links.` : undefined,
  };
}

export function withFlowMetadata(metadata: Record<string, unknown> | undefined, record: FlowRecord | undefined): Record<string, unknown> | undefined {
  if (!record) return metadata;
  return { ...(metadata ?? {}), flow: record };
}
