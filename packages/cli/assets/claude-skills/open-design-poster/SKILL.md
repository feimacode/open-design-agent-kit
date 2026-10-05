---
name: "open-design-poster"
description: Design a poster or flyer for print or screen, check it, and export print-ready PDFs or upload-ready images, including other sizes and one version per row of a spreadsheet — use whenever the user wants a poster, flyer, event or gig poster, print piece, handout, certificate or name card set, or wants an existing design in other sizes or as a print-ready PDF, even if they don't mention Open Design
argument-hint: what the poster is for, and optionally the size (e.g. "A3 poster for our hackathon, with a QR code to the signup page")
---

<!-- generated:curated-entry -->

Design a poster with Open Design, check it, and export files that are ready to print or post.

Brief: "$ARGUMENTS" — or, if that is empty, the user's request in this conversation (if it isn't clear, ask the user: "What is the poster for, and is it for print (which size) or screens?")

## 1. Pick the medium and format

Decide whether this is for **print** or **screens**, and which size. If the brief doesn't say, ask the user before doing anything else. Don't guess between print and screen: the units, bleed and type sizes are different.

| Use | Format id | Size |
|---|---|---|
| Print, small: flyer, handout | `a4` · `letter` | 210×297 mm · 8.5×11 in |
| Print, medium: notice-board poster | `a3` · `tabloid` | 297×420 mm · 11×17 in |
| Print, large: wall poster | `a2` · `a1` · `poster-18x24` · `poster-24x36` | 420×594 mm · 594×841 mm · 18×24 in · 24×36 in |
| Print, conference or research poster | `a0` | 841×1189 mm |
| Instagram portrait | `ig-portrait` | 1080×1350 px |
| Story / Reels / TikTok cover | `story` | 1080×1920 px |
| X single image | `x-image` | 1600×900 px |
| Square (Instagram / LinkedIn) | `ig-square` | 1080×1080 px |

If the user wants several sizes, pick the one they care most about (usually the print size) as the **master**, design it first, and adapt it in step 6.

## 2. Generate

If the user asked for options ("show me a few directions"), run a design exploration first and build out the direction they pick, with the same `format`.

Otherwise call `prepare_open_design_brief` with:

- a `skillId`: `od:prototype:poster-hero` for a bold marketing poster, `od:prototype:magazine-poster` for an editorial or type-led one, or another skill whose style fits better (`list_open_design_skills` with query "poster");
- the brief, in the user's words;
- `format`: the id from step 1.

Call `list_open_design_design_systems` first only if the user names a brand or visual direction.

Author the file yourself, following the returned instructions. Their **Canvas** section is authoritative for size, units, bleed, safe area and minimum type size. Also:

- Use real copy from the brief, with no lorem ipsum. A poster is read from a distance: one dominant headline, then the what / when / where, then the call to action.
- If the user gives a list of names, sessions or locations to make one poster each, mark the changing text with `data-od-field="<column name>"` (and a per-person QR slot with `data-od-qr-field="<column>"`), and fill the design with the first row's values.
- No external image URLs unless the user supplied them. No emoji as key visuals; draw them as inline SVG.

## 3. Add a QR code, if it needs one

Register the artifact first (step 4), then call `create_open_design_qr_code` with the entry path and the URL, and paste the returned inline SVG where the code goes. Never draw a fake or placeholder QR code.

## 4. Register

Call `register_open_design_artifact` with the entry path, kind `html`, a title, `sourceSkillId`, and `format` set to the format id.

## 5. Check and fix

Call `export_open_design_artifact` with the entry path and `checkOnly: true`. Fix every **error** in its preflight findings (text cut off or overflowing, content in the bleed, a card that isn't the format's size, a QR code that doesn't decode), and fix warnings where you reasonably can (small type, low contrast, low-resolution images). Check again until there are no errors.

## 6. Other sizes

If the user wants the design in other formats, call `adapt_open_design_artifact` with the master's entry path and the format ids. For each returned adaptation, follow its instructions, write the file at its `suggestedEntryPath`, register it with its `registerArgs`, and check it as in step 5.

## 7. Export

- **One file per design:** call `export_open_design_artifact` with the entry path and `preset` set to its format id. A print format gives a PDF the size of the bleed box, with trim and bleed boxes set; add `cropMarks: true` if the user's printer wants crop marks. A screen format gives a PNG within the platform's size limit.
- **One per row of a list:** add `data` with the workspace path of the user's CSV, XLSX or JSON file, and `nameField` with the column to name files by. Images come out one per row; print PDFs come out as one multi-page PDF (add `split: true` for one file per row).

## 8. Report

List each exported file's path, size and any remaining warnings. For print files, also give the trim size and bleed, and tell the user the PDF is RGB: most print shops convert it, but they should ask if theirs needs CMYK. Don't print, post, upload or order anything yourself.
