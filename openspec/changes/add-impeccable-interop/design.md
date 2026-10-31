## Context

Impeccable's `init` writes `PRODUCT.md` (sections such as Users, Product Purpose, Accessibility & Inclusion). Its `document` writes `DESIGN.md` (Color, Type, Shape and more). Its commands read both, along with tokens and Tailwind config, before working. Its site doesn't state the files' exact location or whether `DESIGN.md` follows Google's DESIGN.md spec. Our design systems are `DESIGN.md` plus `tokens.css`, numbered sections (Visual Theme, Color, Typography, …), reconciled by `reconcile-design-system-sources`. User systems live in `<designs>/design-systems/<slug>/`.

## Goals / Non-Goals

**Goals**
- A project with Impeccable files gets better briefs from us with no extra steps.
- A project designed with us gives Impeccable a `DESIGN.md` to enforce.
- Never overwrite a file the user or Impeccable owns.

**Non-Goals**
- One shared format for both tools.
- Detecting Impeccable by reading other tools' install folders.

## Decisions

**1. Impeccable's places, read-only by default.** We look where Impeccable does: the project root, then `.agents/context/`, then `docs/`, using the first file found (confirmed 2026-10-31 from impeccable.style/docs/context). A missing file is not an error. A new `DESIGN.md` is only ever written at the root, and only when none of the three places has one.

**1a. Front matter, not a heading map.** Impeccable's `DESIGN.md` starts with YAML front matter (`name`, `description`, `colors`, `typography`, `rounded`, `spacing`, `components`) that its detector checks. Ours have none, so the writer prepends front matter generated from the resolved tokens (plain colour values only), then the design system's text unchanged.

**2. Product context is capped.** At most about 1,500 characters go into the brief. Headings are kept and the rest is trimmed, so a long `PRODUCT.md` doesn't crowd out the skill and design system.

**3. Write only when absent.** `writeProjectDesignMd` checks for the file first and writes with an exclusive create, so a race can't overwrite it either. There's no "update" mode. A design system that changes later doesn't touch the root file. The user can delete it and ask again.

**4. Handoff by skill list, not by files.** The agent knows which skills it has. Checking for `impeccable` in that list works on every agent, and the server never inspects other tools' folders.

## Risks / Trade-offs

- Impeccable may parse `DESIGN.md` sections by name. If our numbered headings don't match what it expects, its commands may ignore some values. Task 1.2 checks this, and the writer adds a heading map if needed.
- Recommending another tool's commands could be wrong if Impeccable renames them. The skill names only `polish` and `audit`, its long-standing commands.
