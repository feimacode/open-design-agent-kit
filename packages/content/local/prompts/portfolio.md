---
name: open-design-portfolio
description: Build a designer's portfolio from their real work — a work library of projects, facts and images (screenshots, Figma frames, live pages, kit designs) entered once, with privacy levels, redaction and alt text, then a portfolio site or interview deck from it
argument_hint: what you design and the work to include (e.g. "product designer, my checkout redesign and the bank app, screenshots in ./shots")
placeholder: What do you design, and which projects should go in?
model_trigger: use whenever the user wants to build, update or tidy a design portfolio, case studies or a body of work to show (job hunting, client pitches, Dribbble or Behance, a portfolio review, a promotion packet), or wants to add a project, screenshots, Figma frames or a live product to their portfolio, even if they don't mention Open Design
---

Build the designer's work library: their projects, the facts about each and their images, entered once for every portfolio output.

Request: {{brief}}

{{voice}}

## 1. Read the library first

Call `get_open_design_library`. If it is empty, start it; if it has projects, work on what the request names and keep everything else as it is.

## 2. The designer and their projects

- **Owner.** Save the designer's name and role with `save_open_design_project` (`owner`). Add location, a short bio, email and links only if they gave them.
- **One project at a time.** A new project needs a title, their role on it, and a privacy level. Ask which level fits in plain words: "Can this be shown publicly, only to people you send it to, or is it under NDA or internal?" (public, unlisted, internal).
- **Facts come from the designer.** Ask for what the reply says is missing: the problem, constraints, team, dates, two or three key decisions with the options they rejected and why, and the outcomes. Ask a few questions at a time, not a form.
- **Never invent facts.** No made-up metrics, percentages, team members, clients, dates or quotes. If they don't know a number, record the outcome as `qualitative` (no number) or `estimated` if they give a rough one. A missing fact stays missing: say so.

## 3. Bring the work in

Call `import_open_design_work` with the project slug and its sources:

- files they put in the workspace or attached (`file`, or `data` for an attachment);
- Figma frames (`figma` with the frame link; if the reply says so, read the frame with the Figma connector's `get_screenshot` and pass the image as `data`);
- live products (`url`), captured at desktop and phone size;
- kit designs (`design`).

Look at each image the reply shows and save a short, specific alt text draft (`assets: [{ id, alt }]`): what the screen shows and why it matters, not "screenshot". Then show the drafts to the designer and save `confirmAlt: true` for the ones they accept.

If an image shows something private (a customer name, real account numbers, an internal tool), ask whether to blur that part and save `redactions` boxes for it, or make the image `internal`.

## 4. Your own style

If the library has no `style`, offer once to build one from the designer's current portfolio site, their Figma or Canva files, or screenshots of their work (the `open-design-design-system-from-url` skill and `extract_open_design_design_system`), then save it with `save_open_design_project` (`style`). A portfolio in the designer's own style reads as theirs; the kit's defaults read as everyone's.

## 5. Report

Tell the designer, in plain words, which projects are in, what each still lacks (from the reply), and which images are private or blurred. Offer one next step that fits what they're doing: a portfolio site, an interview deck, or a version for one job or client.

## 6. Build from the library

- **A portfolio site** (home, one case study per project, about): the `portfolio-site` skill. Plan the pages as one collection with `flow.kind: "site"` (home is the `index` screen), and pass `portfolio: { projects }` to every page's `prepare_open_design_brief` and registration.
- **An interview deck** for a 30, 45 or 60 minute slot: the `portfolio-interview-deck` skill, with `portfolio: { projects, length }`.

The brief lists each project's facts, the pictures it may show with their markup, and the process records the kit has; build only from those. The check then reports what a reviewer would notice first: the first screen on a phone, case-study length and summary, unconfirmed alt text, page weight, broken live links, anything internal, and a talk that runs long.
