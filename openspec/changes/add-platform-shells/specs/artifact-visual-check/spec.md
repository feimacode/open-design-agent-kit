## ADDED Requirements

### Requirement: Device and Tablet Viewports

A page that declares a device SHALL be checked at that device's size only (a tablet in both orientations). An app screen with no device SHALL also be checked at 1024 and 768 px wide; captures at those widths SHALL be attached only when they have findings, within the image budget.

#### Scenario: Tablet in both orientations
- **WHEN** a screen declares `data-od-device="tablet"`
- **THEN** the check renders it at 1024 by 768 and 768 by 1024, and not at 1440 or 390

#### Scenario: Web app at tablet width
- **WHEN** an app screen with no device overflows at 768 px
- **THEN** the check reports the overflow with the 768 px viewport named and attaches that capture

### Requirement: Large-Text Pass

App screens SHALL be rendered once more at the first viewport with a 20 px root font size, and text that escapes its box or overlaps another element SHALL be reported as `large-text-overflow`.

#### Scenario: Label that fits only at 16 px
- **WHEN** a button label fits at the default size and overflows at 20 px
- **THEN** the check reports `large-text-overflow` on that button
