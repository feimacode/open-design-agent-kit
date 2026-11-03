## ADDED Requirements

### Requirement: Before/After Page

`compare_open_design_before_after` SHALL write `before-after.html` for a design, or for every page of a collection, that has a base screen. The page SHALL show the base screen and a fresh capture of the design at desktop and phone sizes, with a drag slider and a side-by-side view, and SHALL print the capture time of both sides.

#### Scenario: Multi-page redesign
- **WHEN** the tool runs on a 3-page redesign collection whose pages each have a base screen
- **THEN** the page has one section per page, each with a desktop and a phone comparison

#### Scenario: No base screen
- **WHEN** the design has no base screen
- **THEN** the tool returns an error that says how to store one

### Requirement: Re-Checked Fixes

For each audit finding on a compared page, the tool SHALL run the same check on the design at the same size and mark the finding as fixed only if it passes. It SHALL show the before and after values where the check has one. Findings that still fail SHALL be listed as open.

#### Scenario: Contrast fixed
- **WHEN** the audit reported a 2.4:1 heading and the design's heading measures 7.1:1
- **THEN** the page shows the finding as fixed, "2.4:1 → 7.1:1"

#### Scenario: Still open
- **WHEN** a tap target was 32 px before and is 40 px in the design
- **THEN** the finding is listed as open, not fixed

### Requirement: Copy Edits Listed

The page SHALL list every `data-od-copy-edit` element of the design with its original and new text.

#### Scenario: Edited tagline
- **WHEN** the design shortened the intro paragraph
- **THEN** the page lists the original and the new paragraph side by side

### Requirement: Cited Summary

The page MAY start with up to three summary lines. Each line SHALL cite at least one fixed finding. The tool SHALL reject a line that cites nothing or cites a finding that is still open.

#### Scenario: Unsupported claim
- **WHEN** the agent passes "Loads twice as fast" with no citation
- **THEN** the tool rejects that line and says why

### Requirement: Share and Export

The page SHALL work as one offline HTML file, SHALL publish together with its design or flow through the existing publish providers, and SHALL export to PDF with one page per compared screen.

#### Scenario: Sent after the call
- **WHEN** the designer publishes the redesign to a share link
- **THEN** the before/after page is reachable from the published site's index
