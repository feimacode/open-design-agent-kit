## ADDED Requirements

### Requirement: Overlays Quieted Before Measuring

Before taking screenshots and measuring, the tool SHALL hide, without clicking, fixed or sticky elements that match known consent-manager, cookie, chat-launcher or promo markers, and any fixed element covering more than 30% of the viewport whose text asks for consent; it SHALL record each hidden element's selector in the evidence and SHALL exclude elements inside a matched overlay from role scoring.

#### Scenario: Consent button is not the accent
- **WHEN** a page shows a OneTrust banner whose "Accept all" button is a large saturated green and the site's own primary button is blue
- **THEN** the draft `--accent` is the blue, the banner is not in the screenshot, and the evidence lists the banner as hidden

#### Scenario: No cookie set
- **WHEN** a consent banner is hidden
- **THEN** no element on the page is clicked and no form is submitted

### Requirement: Scrolled Measurement

The tool SHALL scroll each page from top to bottom in viewport-height steps, at most 12 steps or 8 seconds, before measuring, SHALL measure with animations and transitions disabled so reveal effects show their final state, and SHALL save a full-page screenshot capped at 6,000 px tall beside the viewport screenshot.

#### Scenario: Lazy section counted
- **WHEN** a page's card grid only renders after it scrolls into view
- **THEN** the cards contribute to `--surface`, `--radius-md` and spacing

### Requirement: Structure Tokens From Two Widths

The tool SHALL measure each page at both the desktop and the mobile viewport and SHALL draft `--container-gutter-desktop`, `--container-gutter-phone`, `--section-y-desktop` and `--section-y-phone` from the main container's inline padding and the most common vertical padding of top-level sections at each width; tablet values SHALL be left unmeasured unless measured at a tablet width.

#### Scenario: Gutters measured
- **WHEN** the main container has 32 px inline padding at 1440 px and 20 px at 390 px
- **THEN** the draft has `--container-gutter-desktop: 32px` and `--container-gutter-phone: 20px`

### Requirement: Radius Mapping Follows The Contract

The draft SHALL map the button radius (else the input radius) to `--radius-sm`, the card or modal radius to `--radius-md`, and the largest featured container or hero media radius to `--radius-lg`, and SHALL note the input radius when it differs from the button radius.

#### Scenario: Button and card radii
- **WHEN** buttons measure 6 px and cards 12 px
- **THEN** the draft has `--radius-sm: 6px` and `--radius-md: 12px`

### Requirement: Additional Contract Roles

The tool SHALL attempt `--focus-ring` (from the primary control with `:focus-visible` forced), `--success`, `--warn` and `--danger` (from elements whose role, ARIA state or class names that status, or from declared properties named for it), `--fg-2` and `--meta` (the next readable text colours by weight), `--border-soft` (row and list separators) and `--elev-ring` (a 1 px shadow ring on cards); a role with no such evidence SHALL stay unmeasured.

#### Scenario: Error colour from a form
- **WHEN** the page has an input with `aria-invalid="true"` and red error text
- **THEN** the draft `--danger` is that red and its source names the error element

#### Scenario: No status evidence
- **WHEN** nothing on the page shows or declares a success state
- **THEN** `--success` is listed as unmeasured

### Requirement: Declared Property Matching

For each drafted colour, the tool SHALL record the site's own custom property whose computed value is identical, if any, and SHALL fill unmeasured status and focus roles from declared properties whose names map unambiguously onto them, naming the property as the source.

#### Scenario: Brand variable named
- **WHEN** the site declares `--color-brand-500: #635bff` on `:root` and the primary button measures `#635bff`
- **THEN** the source of `--accent` names `--color-brand-500`

### Requirement: Gradient Backgrounds Recorded

When the primary control, the hero or the main surface paints a gradient `background-image`, the evidence SHALL record the gradient, the draft SHALL use its dominant colour stop for the role, and the result SHALL include a note with the full gradient.

#### Scenario: Gradient button
- **WHEN** the primary button's background is `linear-gradient(90deg, #ff512f, #dd2476)`
- **THEN** `--accent` is drafted from one of its stops and a note gives the full gradient for DESIGN.md

### Requirement: Page Conflicts Reported

The tool SHALL measure every requested page fully, including the dark theme when asked, and when pages give different values for a role, SHALL keep the first page's value and list every other value with its page and crop under `conflicts`.

#### Scenario: Two accents
- **WHEN** the home page's primary button is blue and the pricing page's is orange
- **THEN** the draft `--accent` is blue and `conflicts` lists orange from the pricing page
