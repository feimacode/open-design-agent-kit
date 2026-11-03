## ADDED Requirements

### Requirement: Optional Content Pass

`extract_open_design_design_system` SHALL accept `content: true`. With it, the same browser session SHALL also write the content inventory (see `site-redesign`), loading no extra pages beyond the extraction's own.

#### Scenario: Brand and content in one visit
- **WHEN** the agent extracts a site with `content: true` and 2 extra pages
- **THEN** 3 pages are loaded once each, and both the evidence bundle and `content.json` are written
