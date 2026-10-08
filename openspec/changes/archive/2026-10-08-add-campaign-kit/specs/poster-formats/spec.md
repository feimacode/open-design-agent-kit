## ADDED Requirements

### Requirement: Campaign Channel Formats
The canvas format catalog SHALL include the screen formats `linkedin-image` (1200×627), `og-image` (1200×630), `x-header` (1500×500), `linkedin-banner` (1584×396), `email-header` (600×200, captured at scale 2), `banner-mrec` (300×250), `banner-leaderboard` (728×90), `banner-skyscraper` (160×600) and `banner-mobile` (320×50). The four `banner-*` formats SHALL carry a 150,000-byte budget.

#### Scenario: Leaderboard export over budget
- **WHEN** a fluid master is exported with `preset: "banner-leaderboard"` and the PNG is 210 KB
- **THEN** it SHALL be re-encoded as JPEG to fit 150,000 bytes, as for other budgeted formats

#### Scenario: Formats are listed
- **WHEN** the agent asks for the available formats
- **THEN** the new ids SHALL appear with their sizes
