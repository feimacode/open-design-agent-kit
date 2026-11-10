## ADDED Requirements

### Requirement: Share Formats

The kit SHALL offer `dribbble-shot`, `behance-module`, `behance-cover`, `linkedin-document` and `marketplace-cover` formats. A `linkedin-document` design SHALL export as one PDF with one page per card.

#### Scenario: Document post
- **WHEN** a six-card `linkedin-document` design is exported
- **THEN** the result is one PDF of six 1080 x 1350 pages

### Requirement: Platform Limits

The kit SHALL keep each platform's sizes, ratios, byte limits and video limits in one data file with the source page and the date checked. Export SHALL use those limits as byte budgets, and the check SHALL report a file over a confirmed limit. Values marked `unverified` SHALL only produce warnings.

#### Scenario: Large Dribbble video
- **WHEN** a Dribbble MP4 export is 26 MB
- **THEN** the check reports that it is over the 20 MB limit

### Requirement: Share Pack

The `portfolio-share-pack` recipe SHALL make, from one library project, a cover, three to five shots, a LinkedIn document post and an Instagram carousel, with post text drafted from the project's facts. It SHALL use only `public` projects and assets.

#### Scenario: Unlisted project
- **WHEN** the designer asks for a share pack of an `unlisted` project
- **THEN** the agent says the project isn't public and asks whether to change its level

### Requirement: Frames On Imported Screens

An imported screen asset with a device SHALL be shown inside the kit's device frame in shots and image exports, the same way kit-made device screens are framed.

#### Scenario: Phone screenshot
- **WHEN** a shot uses an imported iPhone screenshot
- **THEN** the exported shot shows it inside the iPhone frame
