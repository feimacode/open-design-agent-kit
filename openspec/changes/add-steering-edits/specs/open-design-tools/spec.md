## ADDED Requirements

### Requirement: Comments That Carry a Verb

A preview comment SHALL be able to carry an optional `verb` (one of the steering verbs), stored in `<entry>.comments.json` with the comment. When such a comment is sent to chat, the gathered instruction SHALL ask for a scoped edit with that verb, anchored to the comment's element, rather than a free-text change. Comments without a verb SHALL be sent as before.

#### Scenario: Sending a verb comment
- **WHEN** a comment with `verb: "distill"` on the footer is sent to chat
- **THEN** the message SHALL ask for a `distill` edit through `prepare_open_design_edit`, with the comment as its scope

#### Scenario: Plain comment unchanged
- **WHEN** a comment without a verb is sent
- **THEN** the message SHALL be the same as before this change
