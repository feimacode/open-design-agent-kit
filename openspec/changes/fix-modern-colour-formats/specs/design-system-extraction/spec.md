## ADDED Requirements

### Requirement: All CSS Colour Formats Measured

The extraction SHALL read colours in every format Chrome reports from `getComputedStyle`, including `oklch()`, `oklab()`, `lab()`, `lch()`, `color(srgb …)` and `color(display-p3 …)`. It SHALL draft each as sRGB hex, clipped to the sRGB gamut, and SHALL record the original value in the token's source whenever it was outside sRGB.

#### Scenario: Tailwind v4 site
- **WHEN** a page's background, text, card surface and primary button are all declared in `oklch()`
- **THEN** the draft has `--bg`, `--fg`, `--surface` and `--accent` as hex values matching the rendered colours within ΔE 1

#### Scenario: Wide-gamut accent
- **WHEN** the primary button is `color(display-p3 1 0.2 0.1)`
- **THEN** `--accent` is its sRGB clip and `sources['--accent']` records `color(display-p3 1 0.2 0.1)`

### Requirement: Unread Colours Reported

When a role element's colour can't be read, the extraction SHALL add a note naming the value, and SHALL NOT report the role as simply unmeasured without that note.

#### Scenario: Unknown colour function
- **WHEN** a future colour syntax can't be converted
- **THEN** the result's notes name the value and the element it came from
