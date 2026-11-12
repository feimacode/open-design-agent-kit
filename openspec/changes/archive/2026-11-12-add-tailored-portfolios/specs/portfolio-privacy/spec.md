## ADDED Requirements

### Requirement: Privacy Ceiling

Every target SHALL have a privacy ceiling of `public`, `unlisted` or `internal`. Export and publish SHALL refuse an output that contains a library project or asset with a stricter level than the ceiling, and SHALL name each such item.

#### Scenario: NDA screen in a public version
- **WHEN** a public target's site includes an asset marked `unlisted`
- **THEN** publish is refused and names the asset and its case study

### Requirement: Providers By Ceiling

An `internal` target SHALL allow file export only. An `unlisted` target SHALL be offered a Claude artifact, or a host where the designer adds a password, and the kit SHALL NOT say a password was set when it didn't set one. Promotion targets SHALL default to `internal`.

#### Scenario: Promotion packet
- **WHEN** the designer asks to publish a promotion target
- **THEN** the agent offers a PDF export instead and says why
