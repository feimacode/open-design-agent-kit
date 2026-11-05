// Pure scoring for the taste calibration (openspec calibrate-site-audit-taste-checks):
// per-rule false-alarm rate on hand-made sites and hit rate on AI-default pages.

export const TASTE_RULES = ['slop-glow', 'card-row', 'uniform-surface', 'intent'];
export const TEMPLATE_TELLS = ['slop-glow', 'card-row', 'uniform-surface'];
export const MAX_FALSE_ALARM = 0.05;

/** The rules a page fired, plus template-look for two or more different tells. */
export function firedOn(checks) {
  const fired = new Set(checks.filter((c) => TASTE_RULES.includes(c)));
  if (TEMPLATE_TELLS.filter((t) => fired.has(t)).length >= 2) fired.add('template-look');
  return [...fired].sort();
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * pages: [{ site, set: 'handMade' | 'aiDefault', status: 'ok' | 'failed', fired: string[] }].
 * Failed pages are left out of both counts.
 */
export function calibrate(pages, date) {
  const ok = pages.filter((p) => p.status === 'ok');
  const hand = ok.filter((p) => p.set === 'handMade');
  const ai = ok.filter((p) => p.set === 'aiDefault');
  const rules = {};
  for (const rule of [...TASTE_RULES, 'template-look']) {
    const handMadeHits = hand.filter((p) => p.fired.includes(rule)).length;
    const aiDefaultHits = ai.filter((p) => p.fired.includes(rule)).length;
    rules[rule] = hand.length === 0
      ? null
      : { handMadeHits, aiDefaultHits, falseAlarmRate: round(handMadeHits / hand.length), hitRate: ai.length ? round(aiDefaultHits / ai.length) : 0 };
  }
  return { version: 1, calibratedAt: hand.length ? date : null, maxFalseAlarm: MAX_FALSE_ALARM, handMade: hand.length, aiDefault: ai.length, rules };
}

const pct = (x) => `${Math.round(x * 1000) / 10}%`;

export function resultMarkdown(cal, pages) {
  const lines = [
    `# Taste calibration ${cal.calibratedAt ?? '(not calibrated)'}`,
    '',
    `${cal.handMade} hand-made sites and ${cal.aiDefault} AI-default pages loaded. A rule counts as a problem on live sites only at ${pct(cal.maxFalseAlarm)} false alarms or fewer.`,
    '',
    '| Rule | False alarms (hand-made) | Hits (AI-default) | On live sites |',
    '|---|---|---|---|',
  ];
  for (const [rule, r] of Object.entries(cal.rules)) {
    if (!r) {
      lines.push(`| \`${rule}\` | n/a | n/a | note |`);
      continue;
    }
    lines.push(`| \`${rule}\` | ${r.handMadeHits}/${cal.handMade} (${pct(r.falseAlarmRate)}) | ${r.aiDefaultHits}/${cal.aiDefault}${cal.aiDefault ? ` (${pct(r.hitRate)})` : ''} | ${r.falseAlarmRate <= cal.maxFalseAlarm ? 'problem' : 'note'} |`);
  }
  lines.push('', '## Pages each rule fired on', '');
  for (const rule of Object.keys(cal.rules)) {
    const on = pages.filter((p) => p.status === 'ok' && p.fired.includes(rule));
    lines.push(`- \`${rule}\`: ${on.length ? on.map((p) => `${p.site}${p.set === 'aiDefault' ? ' (AI)' : ''}`).join(', ') : 'none'}`);
  }
  const failed = pages.filter((p) => p.status !== 'ok');
  if (failed.length) lines.push('', '## Not loaded', '', ...failed.map((p) => `- ${p.site}: ${p.error ?? 'failed'}`));
  return lines.join('\n') + '\n';
}
