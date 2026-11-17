## Context

`motion-export` installs a virtual clock before page scripts run and can set every animation's `currentTime`. The check already forces hover and focus states and renders with reduced motion. Steering edits snapshot a design, run the edit, and compare markup, pixels and verb measurements inside the scope.

## Goals / Non-Goals

**Goals:** catch the motion mistakes a demanding reviewer would flag in the first second of watching, without false alarms on films and spinners; give people words to steer motion; let the agent and critic see a moving design as a set of key frames.

**Non-Goals:** measuring frame rate on real hardware; scoring choreography; checking motion in JavaScript libraries that bypass `getAnimations()` (canvas, WebGL) beyond their screenshots.

## Decisions

1. **Inventory with `getAnimations()` on the virtual clock.** CSS transitions, CSS animations and the Web Animations API (which GSAP and Motion One can use) all appear there. Libraries that animate with `requestAnimationFrame` and inline styles don't, so the audit also samples computed `transform`, `opacity` and box sizes per element at 10 points in each window and infers motion from changes. Findings from inference say so.
2. **Limits from the craft doc.** 500 ms for UI transitions and the crowding count come from `animation-discipline.md` and upstream's motion craft ranges. They live in one table in the overlay so they can be tuned.
3. **Films are judged differently.** A film's 1.2 s arrival is fine. The UI rules apply only to pages and mini-apps; films get the vocabulary and crowding rules.
4. **Motion verbs reuse the guard.** Motion measurements inside the scope are: animation count, total moving distance, mean duration, overshoot in easing, and distinct easing curves. Outside the scope, the guard compares the animation inventory as well as pixels, so a shared transition rule that changes the footer's hover counts as out of scope.

## Risks / Trade-offs

- [False positives on deliberate slow motion] → warnings, not errors; a design system can raise the UI limit in its overlay.
- [Inference misses canvas motion] → stated as a non-goal; the filmstrip still shows it.
