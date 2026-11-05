## ADDED Requirements

### Requirement: Tokens Elected By Coverage

With more than one page measured, the extraction SHALL draft each role from the value used on the most pages. Colours within ΔE 2000 of 3 SHALL count as one value, drafted as the most-used exact value. Ties SHALL go to the earlier page. Each drafted token's source SHALL record its coverage and its scope: `site-wide` at 80% of pages or more, `section` at 40% or more, otherwise `page-local`.

#### Scenario: Dark home page
- **WHEN** the home page's background is `#0b0b0f` and the other three pages' backgrounds are `#ffffff`
- **THEN** `--bg` is `#ffffff` with coverage 3 of 4, `conflicts` lists `#0b0b0f` with coverage 1 of 4, and a note says the home page differs

#### Scenario: Even split
- **WHEN** two pages are measured and their accents differ
- **THEN** the home page's accent is drafted and the other is listed in `conflicts`

### Requirement: Page Discovery

When `extraUrls` is not given and `discover` is not `false`, the extraction SHALL add up to three same-site pages linked from the home page's header or footer navigation, preferring pricing, product or features, about, and docs or blog pages in that order. It SHALL skip log-in, sign-up, legal and careers pages and pages `robots.txt` disallows, and SHALL list the pages it added in the result.

#### Scenario: Pages found
- **WHEN** the nav links to `/pricing`, `/login`, `/about` and `/privacy`
- **THEN** `/pricing` and `/about` are measured and `/login` and `/privacy` are not

### Requirement: Consistency Summary

The result SHALL include, for colours, radii, fonts and spacing, the share of measured values that fall on drafted tokens, and the page-local outliers with their page and crop.

#### Scenario: One-off radius
- **WHEN** one page's cards use a 20 px radius and every other card uses 12 px
- **THEN** the consistency summary lists the 20 px radius as page-local, with its page and crop
