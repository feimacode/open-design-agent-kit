## ADDED Requirements

### Requirement: Generated Integration Docs
The supported-integrations tables in `docs/guides/integrations.md` and `README.md` SHALL be generated from the registry between `<!-- integrations:start -->` and `<!-- integrations:end -->` markers. The docs check SHALL fail when either table differs from what the registry renders.

#### Scenario: Registry changed, docs not regenerated
- **WHEN** an integration is added to the registry and the docs generator isn't re-run
- **THEN** the docs check SHALL fail and name the stale file
