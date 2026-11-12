# portfolio-review-round Specification

## Purpose
Get community feedback on an anonymised, unlisted portfolio version, track the feedback as comments and show what changed.
## Requirements
### Requirement: Review Version

The `portfolio-review-round` recipe SHALL make a review version that replaces the owner's name, contact details, profile links, and employer, client and school names from the library with neutral labels, and SHALL publish it unlisted.

#### Scenario: Employer name
- **WHEN** a case study names the designer's employer
- **THEN** the review version shows a neutral label such as "Fintech company, 2024"

### Requirement: Anonymity Check

The kit SHALL check a review version for any owner name, email, profile link, employer, client or school from the library in its text, alt text, file names, page title, Open Graph tags and link targets, and SHALL report each match as an error.

#### Scenario: Name in the page title
- **WHEN** the review version's title still contains the designer's name
- **THEN** the check reports an error naming the page and the title

### Requirement: Review Post

The recipe SHALL write `review-post.md` with the context, up to three questions the designer wants answered, the feedback not wanted, and the link.

#### Scenario: Four questions
- **WHEN** the designer lists four questions
- **THEN** the agent asks which three to keep

### Requirement: Feedback And Follow-Up

Pasted feedback SHALL be recorded as comments with `source: "community"` on the page it is about, or on the home page when it fits no page. After revisions, the recipe SHALL compare the posted version with the revised one on a before/after page and draft a follow-up post listing what changed for each comment.

#### Scenario: Mobile feedback
- **WHEN** a reviewer says the case study is hard to read on a phone
- **THEN** the point becomes an open comment on that case study, and the follow-up post lists the fix once it is resolved
