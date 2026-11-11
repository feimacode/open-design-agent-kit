---
name: portfolio-interview-deck
zh_name: "作品集面试演示"
en_name: "Portfolio Interview Deck"
emoji: "🎤"
description: "The deck a designer presents in a portfolio interview: one or two projects from their work library, timed for a 30, 45 or 60 minute slot, with presenter notes, minute budgets and backup slides for the questions that come."
en_description: "The deck a designer presents in a portfolio interview: one or two projects from their work library, timed for a 30, 45 or 60 minute slot, with presenter notes, minute budgets and backup slides for the questions that come."
category: slides
scenario: personal
tags: ["portfolio presentation", "portfolio review", "design interview", "case study presentation", "panel interview", "作品集面试"]
triggers:
  - "portfolio presentation"
  - "portfolio interview"
  - "portfolio review deck"
  - "case study presentation"
  - "design interview deck"
od:
  mode: deck
  craft:
    requires:
      - typography
      - accessibility-baseline
      - anti-ai-slop
  scenario: personal
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
  speaker_notes: true
  example_prompt: "My 45-minute portfolio presentation for a senior product designer panel, on the checkout redesign and the bank onboarding from my work library."
---

<!-- Kit skill (openspec add-portfolio-site-and-deck). -->
# Portfolio Interview Deck

The deck a designer presents to a hiring panel, built from their work library. It tells one or two projects well inside the slot, leaves time for questions, and holds backup slides for the questions that usually come.

## Before the first slide

1. **Read the library** with `get_open_design_library`. Use the open-design-portfolio skill first if the projects lack problem, decisions (with rejected options) or outcomes.
2. **Ask once, together:** the slot length (30, 45 or 60 minutes; default 45), which one or two projects (suggest the ones closest to the role), and the role and company if known. Accept "you pick".
3. **Brief** with `prepare_open_design_brief`, `portfolio: { projects: [...], length: <minutes> }` (or `target: "<slug>"` for a saved job target, whose first two projects are used). The library's style is used unless the designer names another. Register with the same `portfolio`.
4. **Check** with `check_open_design_artifact`: it adds up the minute budgets and reports a talk more than 10% off the length, slides without notes or minutes, and no backup slides. Export as editable PowerPoint (`pptx`) and PDF when asked; the notes go with the PowerPoint.

## Structure

| Part | Slides | Time in a 45-minute slot |
|---|---|---|
| Intro: who I am, what I'll show, how long | 1 | 1–2 min |
| Current role: team, scope, what I own | 1 | 2 min |
| For each project: context, problem, artifacts (with the rejected options), collaboration, impact | 4–7 per project | 13–15 min per project |
| Close: what I'd bring to this role, questions | 1 | 1–2 min |
| Backup (not counted): process detail, a metric's source, a rejected option, a hard stakeholder moment | 2–4 | — |

Scale it: 30 minutes is one project or two short ones; 60 minutes is two projects told fully. The minute budgets of the non-backup slides add up to the slot, within 10% either way; count the panel's questions inside each project's time, and answer the deeper ones from the backup slides.

## Every slide

- `data-od-minutes="<minutes>"` on each slide that isn't a backup (decimals allowed, e.g. `1.5`).
- Presenter notes in `<aside class="notes">`: what to say, in the designer's words and from library facts only, never visible on the slide.
- Backup slides go after the close, each marked `data-od-backup`, with a heading naming the question it answers.
- One idea per slide; the picture is the slide. Outcome numbers exactly as the brief writes them.
- The decisions slides show the chosen option beside the rejected ones and say why.

## Seed

Start from this file. Keep the runtime: arrow keys and space move between slides, P opens presenter mode with the notes, the slide's minute budget, the running total against the slot and a timer.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><!-- Designer name: portfolio presentation --></title>
<style>
  :root { /* the design system's tokens */ }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg); font-family: var(--font-body); }
  .deck { height: 100%; overflow: hidden; }
  .slide { width: 100vw; height: 100vh; box-sizing: border-box; padding: 6vh 7vw; display: none; flex-direction: column; justify-content: center; }
  .slide.is-active { display: flex; }
  .slide img { max-width: 100%; max-height: 70vh; object-fit: contain; }
  aside.notes { display: none; }
  .presenter { position: fixed; inset: auto 0 0 0; max-height: 40vh; overflow: auto; padding: 16px 24px; background: var(--surface); color: var(--fg); border-top: 1px solid var(--border); font: 16px/1.5 var(--font-body); display: none; }
  .presenter.is-open { display: block; }
  .presenter .meta { display: flex; gap: 24px; font-weight: 600; margin-bottom: 8px; }
  @media print { .slide { display: flex !important; page-break-after: always; } .presenter { display: none !important; } }
</style>
</head>
<body>
<main class="deck" data-od-slot="content">
  <section class="slide" data-screen-label="01 Intro" data-od-minutes="1.5">
    <!-- name, role, what this talk covers -->
    <aside class="notes"><!-- what to say --></aside>
  </section>
  <!-- … one <section class="slide" data-od-minutes="…"> per slide … -->
  <section class="slide" data-screen-label="B1 Backup: how we measured it" data-od-backup>
    <!-- the answer to a likely question -->
    <aside class="notes"><!-- what to say if asked --></aside>
  </section>
</main>
<div class="presenter" aria-live="polite"><div class="meta"><span data-p="slide"></span><span data-p="budget"></span><span data-p="total"></span><span data-p="timer"></span></div><div data-p="notes"></div></div>
<script>
(() => {
  const slides = [...document.querySelectorAll('.deck > .slide')];
  const panel = document.querySelector('.presenter');
  const slot = Number(document.body.dataset.odLength || 45);
  let i = 0, started = 0;
  const mins = (s) => s.hasAttribute('data-od-backup') ? 0 : Number(s.dataset.odMinutes || 0);
  const show = (n) => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
    const s = slides[i];
    const before = slides.slice(0, i + 1).reduce((t, x) => t + mins(x), 0);
    panel.querySelector('[data-p="slide"]').textContent = `${i + 1} / ${slides.length}${s.hasAttribute('data-od-backup') ? ' (backup)' : ''}`;
    panel.querySelector('[data-p="budget"]').textContent = s.hasAttribute('data-od-backup') ? 'backup' : `${mins(s)} min`;
    panel.querySelector('[data-p="total"]').textContent = `by now ${before} of ${slot} min`;
    panel.querySelector('[data-p="notes"]').innerHTML = s.querySelector('aside.notes')?.innerHTML ?? '';
  };
  const tick = () => { if (started) { const m = Math.floor((Date.now() - started) / 60000); panel.querySelector('[data-p="timer"]').textContent = `${m} min in`; } };
  addEventListener('keydown', (e) => {
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); show(i + 1); }
    if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); show(i - 1); }
    if (e.key === 'p' || e.key === 'P') { panel.classList.toggle('is-open'); if (!started) started = Date.now(); }
  });
  setInterval(tick, 15000);
  show(0);
})();
</script>
</body>
</html>
```

Set `data-od-length="<minutes>"` on `<body>` to the slot length.

## Rules

- Only library facts; ask for what's missing, or leave it out.
- No internal pictures: the brief has left them out. Unlisted projects can be presented, since the panel is a private audience.
- Tokens only, from the design system's `:root`.
