## ADDED Requirements

### Requirement: Figma File to Design System

The Figma integration SHALL offer a third flow next to frame pull and push: a Figma file link given to `extract_open_design_design_system` drafts a design system from the file's variables. All three flows SHALL share one link parser for design, branch, board and make links.

#### Scenario: Branch link
- **WHEN** the link is `https://www.figma.com/design/AbC123/branch/BrX9/Brand`
- **THEN** the extract instructions use file key `BrX9`, as frame pull does
