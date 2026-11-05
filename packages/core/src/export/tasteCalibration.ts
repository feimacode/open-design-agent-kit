// Taste findings on live sites, held to a measured false-alarm rate
// (openspec calibrate-site-audit-taste-checks). The taste rules were tuned on
// the kit's own designs; on someone's hand-made site a "template look" claim
// costs the user credibility, so a rule counts as a problem only while it fires
// on 5% or fewer of the hand-made calibration sites. The rates come from
// `npm run calibrate:taste` (evals/taste-calibration), checked in as
// taste-calibration.json. The design check on the kit's own designs is not
// affected.

import calibrationFile from './taste-calibration.json';

/** The taste rules the site audit runs. */
export const TASTE_RULES = ['slop-glow', 'card-row', 'uniform-surface', 'intent'] as const;
/** The rules that are tells of a stock template; two different ones on a page make a template look. */
export const TEMPLATE_TELLS: ReadonlySet<string> = new Set(['slop-glow', 'card-row', 'uniform-surface']);
/** The synthetic check for two or more tells on one page. */
export const TEMPLATE_LOOK = 'template-look';

export interface RuleRates {
  /** Hand-made sites it fired on, of `handMade`. */
  handMadeHits: number;
  /** AI-default pages it fired on, of `aiDefault`. */
  aiDefaultHits: number;
  falseAlarmRate: number;
  hitRate: number;
}

export interface TasteCalibration {
  version: number;
  /** YYYY-MM-DD of the latest calibration run, or null when it has never run. */
  calibratedAt: string | null;
  maxFalseAlarm: number;
  handMade: number;
  aiDefault: number;
  /** Rates per rule (and `template-look`); null when the rule has not been calibrated. */
  rules: Record<string, RuleRates | null>;
}

export const TASTE_CALIBRATION: TasteCalibration = calibrationFile as TasteCalibration;

/** A rule counts as a problem on a live site only when it was calibrated and stayed at or under the bar. */
export function tasteRulePasses(check: string, cal: TasteCalibration = TASTE_CALIBRATION): boolean {
  const r = cal.rules[check];
  return !!cal.calibratedAt && !!r && r.falseAlarmRate <= cal.maxFalseAlarm;
}

/** What each tell looks like, for notes. */
const SEEN: Record<string, string> = {
  'slop-glow': 'stock indigo glows and gradients',
  'card-row': 'a row of identical cards',
  'uniform-surface': 'every card the same',
  intent: 'actions that don’t look like what they do',
};

interface TasteInput {
  check: string;
  page: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

const pathOf = (u: string): string => {
  try {
    return new URL(u).pathname || '/';
  } catch {
    return u;
  }
};

/**
 * Splits the audit's findings: taste findings from rules over the bar (or not
 * yet calibrated) become notes, and a page with two or more different template
 * tells gains one `template-look` finding (itself a note unless that
 * combination is calibrated under the bar).
 */
export function applyTasteCalibration<F extends TasteInput>(findings: F[], cal: TasteCalibration = TASTE_CALIBRATION): { findings: F[]; notes: string[]; templateLook: Array<{ page: string; tells: string[]; counted: boolean }> } {
  const kept: F[] = [];
  const held = new Map<string, Set<string>>();
  const tells = new Map<string, Set<string>>();
  for (const f of findings) {
    const isTaste = (TASTE_RULES as readonly string[]).includes(f.check);
    if (isTaste && TEMPLATE_TELLS.has(f.check)) {
      const t = tells.get(f.page) ?? new Set<string>();
      t.add(f.check);
      tells.set(f.page, t);
    }
    if (isTaste && !tasteRulePasses(f.check, cal)) {
      const h = held.get(f.page) ?? new Set<string>();
      h.add(f.check);
      held.set(f.page, h);
      continue;
    }
    kept.push(f);
  }
  const notes: string[] = [];
  for (const [page, checks] of held) {
    notes.push(`${pathOf(page)}: ${[...checks].map((c) => SEEN[c] ?? c).join('; ')}. A common pattern, but many hand-made sites do this too, so it isn’t counted as a problem${cal.calibratedAt ? '' : ' (this check isn’t calibrated on hand-made sites yet)'}.`);
  }
  const templateLook: Array<{ page: string; tells: string[]; counted: boolean }> = [];
  for (const [page, t] of tells) {
    if (t.size < 2) continue;
    const counted = tasteRulePasses(TEMPLATE_LOOK, cal);
    const list = [...t];
    templateLook.push({ page, tells: list, counted });
    if (!counted) notes.push(`${pathOf(page)}: ${list.length} template tells together (${list.map((c) => SEEN[c] ?? c).join(', ')}). Shown as a note until the combination is calibrated on hand-made sites.`);
  }
  return { findings: kept, notes, templateLook };
}

/** One line for the report on how the taste checks were held to account. */
export function calibrationLine(cal: TasteCalibration = TASTE_CALIBRATION): string {
  if (!cal.calibratedAt) return 'The template-look checks have not been calibrated on hand-made sites yet, so what they find is listed as notes, not problems.';
  const counted = TASTE_RULES.filter((r) => tasteRulePasses(r, cal));
  return `Template-look checks calibrated on ${cal.handMade} hand-made sites and ${cal.aiDefault} AI-default pages on ${cal.calibratedAt}; only those that fired on ${Math.round(cal.maxFalseAlarm * 100)}% or fewer of the hand-made sites count as problems (${counted.length ? counted.join(', ') : 'none yet'}).`;
}
