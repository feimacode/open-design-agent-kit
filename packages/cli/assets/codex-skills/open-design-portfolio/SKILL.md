---
name: open-design-portfolio
description: Build a designer's portfolio from their real work — a work library of projects, facts and images (screenshots, Figma frames, live pages, kit designs) entered once, with privacy levels, redaction and alt text, for every portfolio output — use whenever the user wants to build, update or tidy a design portfolio, case studies or a body of work to show (job hunting, client pitches, Dribbble or Behance, a portfolio review, a promotion packet), or wants to add a project, screenshots, Figma frames or a live product to their portfolio, even if they don't mention Open Design
---

<!-- generated:open-design-agent-kit -->

Build the designer's work library: their projects, the facts about each and their images, entered once for every portfolio output.

Request: the rest of the user's message (if there is none, ask the user: "What do you design, and which projects should go in?")

**How to talk to the user.** Many people using Open Design don't write code, so:
- Use the user's own words. If they say "artifact", "design tokens" or give a file path, use those terms back; otherwise use the plain words below.
- Keep the machinery out of replies: no tool names, no ids like `od:prototype:poster-hero`, no internal files (`.artifact.json`, `.comments.json`, `config.json`), and not the words "register", "manifest", "sidecar", "entry" or "surface", unless the user used them first.
- Explain a print term the first time it comes up, in one short clause, and not again.
- Say where a file is the way the user would find it ("in your Open Design folder, under seed-swap-flyer"). Give a raw path only where the user can click it (Claude Code, Claude Desktop's Code tab, VS Code) or asks for it.
- End each reply that finishes a step with one line on what they can do next, with at most two options ("Want it in Instagram sizes too, or is it ready to print?").

| Instead of | Say |
|---|---|
| artifact, entry, registered | your design, saved |
| design system, active design system | your style (the first time: "a saved style: colours, fonts and spacing") |
| surface, skill, template, recipe | kind of design, starting layout, or nothing |
| workspace, output directory | your folder, your Open Design folder |
| bleed | print edge ("a few millimetres extra that the printer trims off") |
| trim size | final size |
| preflight findings, errors | "I checked it and fixed…", "one thing to look at:" |
| export | save as PDF, save as an image |
| inline preview, MCP App | the preview above |

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
