## ADDED Requirements

### Requirement: Measurement In The Agent's Browser

When the hosted server refuses a `url` for `extract_open_design_design_system`, its refusal SHALL include a `browserMeasure` block. The block SHALL hold a versioned loader for the kit's page measurement script, the script inline (at most 60 KB), and the call to make with the result. The block SHALL say to use it only when the agent has a browser tool that can run JavaScript in a page. The script SHALL be one self-contained function that returns JSON stamped with its `scriptVersion`.

#### Scenario: Agent with Claude in Chrome on the hosted server
- **WHEN** the agent calls the hosted tool with `url: "https://example.com"` and has a browser tool
- **THEN** the refusal includes `browserMeasure`, and the agent opens the page, runs the script, and calls again with a `measured` source

#### Scenario: Agent without a browser tool
- **WHEN** the agent has no browser tool
- **THEN** the refusal's text tells it to pass `html` and `css` sources, or ask the user for a screenshot, and not to estimate values

### Requirement: Measured Source

`extract_open_design_design_system` SHALL accept up to 4 `{ kind: "measured", url, data, screenshot? }` sources, and SHALL refuse `data` whose `scriptVersion` it doesn't serve. Accepted data SHALL go through the same draft path as a local URL extraction, with confidence `measured`.

#### Scenario: Pseudo-states from stylesheets
- **WHEN** the button's hover colour comes from a same-origin `:hover` rule rather than a forced state
- **THEN** its source is marked `declared`

#### Scenario: Crops from the screenshot
- **WHEN** the source includes a viewport screenshot
- **THEN** role and component crops are cut from it using the element boxes in `data`

#### Scenario: Same draft as a local extraction
- **WHEN** a fixture page is measured by the local extraction, and separately by the bundled script under `page.evaluate`
- **THEN** the drafted tokens agree within ΔE 2000 of 2 for colours and 1 px for sizes

#### Scenario: Stale script
- **WHEN** a `measured` source carries a `scriptVersion` the server no longer serves
- **THEN** the call is refused with the current loader, and nothing is drafted
