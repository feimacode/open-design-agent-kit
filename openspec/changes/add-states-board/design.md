## Context

`checkArtifact.ts` renders pages at 1440x900 and 390x844, runs a states pass (hover and focus contrast, focus-visible, tap targets, 320 px reflow, reduced motion) and returns screenshots within an image budget. Cards and emails are detected by `data-od-card` and `data-od-email`. The critic reads the latest check screenshots and findings.

## Goals / Non-Goals

**Goals:** every app screen is designed and reviewed in the states its data can be in; content that breaks layouts is found before a developer finds it.

**Non-Goals:** real data loading or timers (loading is a drawn skeleton); states for marketing pages (only app-screen and mobile entries ask for them); generating states automatically from the default (the agent designs them; the check only finds them missing).

## Decisions

### Sibling frames, one file

One file keeps tokens and shell shared and lets the board show states together. Only one frame is visible at a time on the page (`hidden` on the others); the check and preview toggle them. A collection screen and its states stay one artifact.

### Image budget

States add captures. The check takes the first screen of each state at the first viewport, and other viewports only for states with findings, within the existing `maxImages`; omitted captures are listed as today.

### Stress is a copy, not an edit

The stress pass runs in a fresh page with a script that rewrites text nodes and numbers in place, never touching the file. It skips text inside `[data-od-stress="off"]` for fixed copy such as a logo.

### Dead control means no change at all

A click counts as live if any attribute changes anywhere, the DOM mutates, focus moves or the URL hash changes. That keeps false positives low; a control that changes the wrong thing is the critic's job.

## Risks / Trade-offs

- Agents may fake states with near-identical frames. Mitigation: the critic judges them, and `state-missing` only checks presence.
- Stress findings on intentionally truncated text. Mitigation: truncation with a `title` or a visible "more" control is not reported.
