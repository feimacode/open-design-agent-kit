## ADDED Requirements

### Requirement: Manual Fallback and Purpose Group
Every registry entry SHALL declare a non-empty `manualFallback` describing how to finish the step without the integration. The content guard SHALL reject an entry without one. Each entry SHALL belong to one purpose group derived from its first capability: Design, Docs & storage, Team or Social posting.

Filtered lookups SHALL show each provider's manual fallback. The catalog result, with no filters, SHALL list each entry with its group, the current agent's tool-name hints, whether it can be installed on this agent, and its manual fallback.

#### Scenario: Missing fallback rejected
- **WHEN** an entry has no `manualFallback`
- **THEN** the content check SHALL fail and name the entry

#### Scenario: Notion fallback named
- **WHEN** integrations are looked up for `docs.write`
- **THEN** the Notion provider SHALL show the paste export (`format: "paste"`, `target: "notion"`) as its manual path
