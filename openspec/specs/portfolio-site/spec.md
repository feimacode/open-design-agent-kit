# portfolio-site Specification

## Purpose
Build a multi-page portfolio site (home, case studies, about) from the work library, published with the home page as the site index.
## Requirements
### Requirement: Portfolio Surface

The surface picker SHALL list a ready "Portfolio" surface, and the "Get hired" goal SHALL list it first. The surface SHALL ask for the discipline, who the portfolio is for, and how many projects to show.

#### Scenario: Get hired
- **WHEN** a person picks the "Get hired" goal
- **THEN** "Portfolio" is the first surface offered

### Requirement: Portfolio Site

The `portfolio-site` recipe SHALL build a linked collection with a home page, one page per chosen case study, and an about/contact page, with content from the work library. The home page SHALL be the published site's `index.html`. Images SHALL use the library's variants and confirmed alt text, with redaction applied.

#### Scenario: Three projects
- **WHEN** the designer chooses three library projects
- **THEN** the collection has five pages and publishes as one site with home as the index

### Requirement: Case Study Outline

Each case study SHALL start with a summary of role, team, dates and outcome, then cover the problem, constraints, key decisions with the options rejected, the outcome and next steps, using only facts in the library.

#### Scenario: Decision with rejected option
- **WHEN** a project records a decision with two rejected options
- **THEN** the case study shows the choice, the rejected options and the reason

### Requirement: Process Story From Records

A case study MAY include a "How I worked" block. The block SHALL list only exploration directions, comparisons, steering edits, revisions and before/after pages that exist for designs linked to the project, plus the designer's own note. When no records exist, the block SHALL be left out.

#### Scenario: No records
- **WHEN** a project has no linked kit designs
- **THEN** its case study has no "How I worked" block
