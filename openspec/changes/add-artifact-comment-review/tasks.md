## 0. Spike

- [ ] 0.1 On a Team or Enterprise account, share a published design inside the org, leave anchored comments, and record exactly what Claude's artifact comment tool returns (anchor shape, author, thread URL); note it in design.md
- [ ] 0.2 Confirm a comparison page can declare and write the artifact database from a kit-generated page

## 1. Comment import (core + MCP)

- [x] 1.1 Add `source`, `externalId`, `threadUrl` to the comment record; merge by `externalId`
- [x] 1.2 `import_open_design_comments` tool: validate entry, map anchors (selector, text excerpt, `data-od-id`) to the record, write open comments, return counts (built with add-portfolio-share-and-review, PR #138)
- [ ] 1.3 Keep `data-od-id` in the `claude-artifact` standalone export
- [ ] 1.4 Unit tests: re-import is idempotent, resolved comments stay resolved, unknown anchor kept as text only

## 2. Direction picks

- [ ] 2.1 Comparison page pick control (artifact flag only) writing to the artifact database
- [ ] 2.2 Publish instructions for an exploration declare the database capability
- [ ] 2.3 `open-design-explore` skill: read picks, show tally, ask, then `choose_open_design_direction`

## 3. Content and docs

- [ ] 3.1 Claude skills: read, import, apply, republish, reply and resolve; drift check
- [ ] 3.2 Guides and tools reference

## 4. Verification

- [ ] 4.1 End to end on Team/Enterprise: comment on the artifact, Claude applies it, the artifact updates, the thread gets a reply
