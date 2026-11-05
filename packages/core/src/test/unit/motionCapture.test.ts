import * as assert from 'node:assert';
import { observedMotionTokens, summariseMotion, type ObservedAnimation } from '../../generation/motionCapture';

const anim = (o: Partial<ObservedAnimation>): ObservedAnimation => ({ trigger: 'scroll', role: 'card', selector: 'div.card', props: ['opacity'], from: {}, to: {}, duration: 600, delay: 0, easing: 'ease-out', at: 0, ...o });

describe('runtime motion (add-runtime-motion)', () => {
  it('takes motion tokens from script-driven animations with nothing declared', () => {
    // Web Animations from a library: keyframes, no transitionProperty.
    const t = observedMotionTokens({ animations: [anim({ trigger: 'hover', role: 'button', props: ['transform'], duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }), anim({ duration: 700, easing: 'cubic-bezier(0.2, 0, 0, 1)' })] });
    assert.deepStrictEqual({ fast: t?.fast, base: t?.base, ease: t?.ease }, { fast: '180ms', base: '700ms', ease: 'cubic-bezier(0.2, 0, 0, 1)' });
    assert.strictEqual(observedMotionTokens({ animations: [] }), undefined);
  });

  it('summarises a staggered rise, a fade, and triggers that moved nothing as none', () => {
    const rise = summariseMotion({
      animations: [0, 80, 160].flatMap((delay) => [
        anim({ props: ['transform'], from: { transform: 'matrix(1, 0, 0, 1, 0, 24)' }, to: { transform: 'none' }, delay }),
        anim({ props: ['opacity'], from: { opacity: '0' }, to: { opacity: '1' }, delay }),
      ]),
    });
    assert.deepStrictEqual(rise.entrance, { kind: 'rise', distance: 24, duration: 600, stagger: 80, easing: 'ease-out', targets: ['card'] });
    assert.strictEqual(rise.hover, 'none');
    assert.strictEqual(rise.load, 'none');
    const fade = summariseMotion({ animations: [anim({ from: { opacity: '0' }, to: { opacity: '1' }, duration: 400 })] });
    assert.deepStrictEqual(fade.entrance, { kind: 'fade', distance: undefined, duration: 400, stagger: undefined, easing: 'ease-out', targets: ['card'] });
  });

  it('describes a hover with the values that changed', () => {
    const m = summariseMotion({ animations: [anim({ trigger: 'hover', role: 'button', props: ['transform', 'box-shadow'], from: { transform: 'none', 'box-shadow': 'none' }, to: { transform: 'translateY(-2px)', 'box-shadow': 'rgba(0, 0, 0, 0.2) 0px 6px 16px 0px' }, duration: 150 })] });
    assert.deepStrictEqual(m.hover, [{ target: 'button', changes: ['transform: none → translateY(-2px)', 'box-shadow: none → rgba(0, 0, 0, 0.2) 0px 6px 16px 0px'], duration: 150, easing: 'ease-out' }]);
  });
});
