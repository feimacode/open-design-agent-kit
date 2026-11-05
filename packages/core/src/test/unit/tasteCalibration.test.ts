import * as assert from 'node:assert';
import { applyTasteCalibration, calibrationLine, tasteRulePasses, type TasteCalibration } from '../../export/tasteCalibration';
import { AUDIT_CHECKS, groupFindings, renderAuditReport, type AuditFinding } from '../../export/siteAudit';

const rates = (handMadeHits: number) => ({ handMadeHits, aiDefaultHits: 20, falseAlarmRate: handMadeHits / 40, hitRate: 0.66 });
const CAL: TasteCalibration = {
  version: 1,
  calibratedAt: '2026-11-05',
  maxFalseAlarm: 0.05,
  handMade: 40,
  aiDefault: 30,
  rules: { 'slop-glow': rates(4), 'card-row': rates(2), 'uniform-surface': rates(1), intent: rates(0), 'template-look': rates(1) },
};
const PAGE = 'https://example.com/';
const f = (check: string, page = PAGE): AuditFinding => ({ check, severity: 'warning', message: check, page, viewport: 'desktop', region: 'main', aboveFold: true });

describe('taste calibration on live sites (calibrate-site-audit-taste-checks)', () => {
  it('a rule over 5% false alarms is a note; a rule under the bar stays a problem', () => {
    assert.strictEqual(tasteRulePasses('slop-glow', CAL), false);
    assert.strictEqual(tasteRulePasses('uniform-surface', CAL), true);
    const r = applyTasteCalibration([f('slop-glow'), f('uniform-surface'), f('contrast')], CAL);
    assert.deepStrictEqual(r.findings.map((x) => x.check), ['uniform-surface', 'contrast']);
    assert.strictEqual(r.notes.length, 1);
    assert.match(r.notes[0], /^\/: stock indigo glows and gradients\. A common pattern, but many hand-made sites do this too/);
  });

  it('never calibrated: every taste rule is a note, other checks are untouched', () => {
    const cal = { ...CAL, calibratedAt: null, rules: {} };
    const r = applyTasteCalibration([f('uniform-surface'), f('intent'), f('tap-target')], cal);
    assert.deepStrictEqual(r.findings.map((x) => x.check), ['tap-target']);
    assert.match(r.notes[0], /isn’t calibrated on hand-made sites yet/);
    assert.match(calibrationLine(cal), /not been calibrated/);
  });

  it('one tell is titled by what was seen; template look needs two different tells on one page', () => {
    const one = applyTasteCalibration([f('uniform-surface')], CAL);
    assert.deepStrictEqual(one.templateLook, []);
    assert.strictEqual(groupFindings(one.findings)[0].title, 'Every surface looks the same');
    const two = applyTasteCalibration([f('uniform-surface'), f('card-row'), f('card-row', 'https://example.com/about')], CAL);
    assert.deepStrictEqual(two.templateLook, [{ page: PAGE, tells: ['uniform-surface', 'card-row'], counted: true }]);
    const glowOnly = applyTasteCalibration([f('slop-glow'), f('intent')], CAL);
    assert.deepStrictEqual(glowOnly.templateLook, [], 'intent is not a template tell');
  });

  it('the checklist and report no longer call single tells a template look, and name the calibration', () => {
    const labels = AUDIT_CHECKS.map((c) => c.label);
    assert.ok(!labels.some((l) => /Default-template/.test(l)), String(labels));
    assert.ok(labels.some((l) => /^Template look: two or more/.test(l)));
    const html = renderAuditReport({ url: PAGE, capturedAt: '2026-11-05T00:00:00Z', pages: [PAGE], groups: groupFindings([{ ...f('slop-glow') }]), screenshots: [], blocked: [], pageWeight: [], notes: [] }, '.open-design/.audit/x');
    assert.match(html, /Stock indigo glows and gradients/);
    assert.ok(!/Generic template look/.test(html));
    assert.match(calibrationLine(CAL), /calibrated on 40 hand-made sites and 30 AI-default pages on 2026-11-05.*\(card-row, uniform-surface, intent\)/);
  });
});
