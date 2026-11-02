<!-- Kit craft doc (openspec add-app-screens). Ideas from OpenPencil's web-app, form-ui and dashboard domain skills (ZSeven-W/openpencil, MIT) and ux-ui-agent-skills' app templates (plugin87/ux-ui-agent-skills, MIT); no text copied. See docs/contributing/upstream-ports.md. -->
# Product UI craft rules

Rules for screens people use to get a task done: forms, tables, lists,
detail pages, settings, search and the app shell around them. A product
screen is judged by whether someone can finish the task, not by whether it
catches the eye. The active `DESIGN.md` decides how it looks; this file
decides how it is built. `state-coverage` decides which states exist and
`ux-writing` writes their words.

## Not a marketing page

- No hero, no tagline, no feature grid, no testimonials, no "Get started" banner. The first thing on the screen is the work: the table, the form, the record.
- The page title says where the user is ("Invoices", "Edit customer"), not a slogan.
- Real labels and real-looking data from the brief's domain. No lorem ipsum, no "Item 1, Item 2".

## One main work area

- Each screen has one dominant region (the table, the form, the record) that takes the free width, and at most one secondary zone (a filter panel, a detail pane, a summary).
- Pick one skeleton and commit:
  - **Sidebar + work:** sidebar 240 to 280 px, main fills the rest.
  - **Top bar + work:** bar 56 to 64 px high, main fills below.
  - **List + detail:** list 320 to 400 px, detail fills the rest.
  - **Single column:** content up to 960 px wide, centred on a tinted page.
- One scroll region per axis. Never a scrolling panel inside a scrolling page.
- Separate zones with space and at most one hairline border, not stacked dividers or nested cards. Structural wrappers (page, section, toolbar) stay transparent; a card groups related content for a reason.

## Records

Any row, card or header that stands for a record (a customer, an order, a file, a ticket) shows, in this order:

1. its **name**, in the strongest weight on the row;
2. its **status**, as a badge with a word, not colour alone (green active, amber pending, red failed, muted neutral);
3. **one to three key fields**, muted and smaller (owner, date, amount);
4. **one primary action**; rarer actions go in an overflow menu.

A record with no visible status and no action reads as a picture of a row.

## Density

Use one density per screen. When the brief gives one, use its numbers exactly.

| Density | For | Controls | Body text | Cell or field padding | Gaps |
|---|---|---|---|---|---|
| Compact | Tables, dashboards, monitoring, power users | 32 to 36 px high | 13 to 14 px | 8 px by 12 px | 8 px |
| Medium | Most product screens | 40 to 44 px high | 14 to 15 px | 12 px by 16 px | 12 to 16 px |
| Airy | Settings, onboarding, wizards, touch | 48 px high | 16 px | 20 px by 24 px or more | 20 to 24 px, sections 32 to 48 px |

Compact controls are too small to tap: on a phone layout, give them at least 44 px of hit area (padding or a larger row), or use medium.

## Tables and lists

- Column headers say what the column holds; numbers are right-aligned with tabular figures, text is left-aligned.
- Search, filters and sort sit directly above the table they act on, and act on the rows actually on the page. A filter with no rows to filter is decoration.
- Pagination counts the rows the design actually shows. Don't claim "1–20 of 4,382" over five rows.
- Long values truncate with an ellipsis and keep the full value in a `title` or a detail view; never let them push columns off the screen.
- Selection, bulk actions and row actions appear in a consistent place: a bulk bar above the table, row actions at the row's end.

## Forms

- One column. Labels above fields, always visible; placeholders are examples, never labels.
- Group related fields under short headings; long forms get steps with a progress indicator.
- Required and optional are marked one way: mark the minority.
- The primary button is at the end of the form, named for the result ("Create invoice"); the secondary is "Cancel".
- Destructive actions (delete, remove, close account) are separated from the rest, coloured as danger, and ask for confirmation that names the thing being deleted.

## Navigation and shell

- The same navigation, in the same place, with the same labels, on every screen of the app. The current place is marked.
- Navigation items have a text label; an icon alone is not enough on primary navigation.
- Phone: a bottom tab bar of three to five items, or a top bar with a back button. Desktop web app: a sidebar or a top bar. Don't mix both on one screen.
- Settings and account live where users look for them: the sidebar footer or the avatar menu.

## Data surfaces have states

Every list, table or panel that loads data is designed populated and in at
least one other state: empty (what will be here, why it's empty, the first
action) or loading (a skeleton the shape of the real content). Errors reuse
the empty frame with their own icon, message and recovery action. A blank
panel is never a state.

## Width changes

- Narrow: one column. The secondary zone becomes a section below or a sheet, never a squeezed second column. Tables become a list of records or scroll sideways inside their own box, never the page.
- Wide: the multi-zone skeleton and higher density are allowed. The primary action stays in the same place across widths.
