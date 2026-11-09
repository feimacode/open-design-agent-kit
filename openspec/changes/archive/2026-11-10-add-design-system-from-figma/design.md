## Context

Figma's MCP server (remote, OAuth, catalog clients only) gives agents `get_metadata` (layer tree as XML), `get_variable_defs` (resolved variables used under a node, as a flat name-to-value map), `search_design_system` (library items with names, collections, scopes and descriptions) and `get_design_context` (reference code, screenshot, asset URLs). Our server can't call it; the host agent can. Figma's REST variables API is Enterprise-only; styles are on every plan.

## Goals / Non-Goals

**Goals:** a Figma link becomes a reviewed Open Design system with roles, confidence and contrast checks, on any host with the Figma connector, and can then be exported to Claude Design.

**Non-Goals:** multiple modes and alias chains; rebuilding Figma components as code; keeping the system in sync with the file.

## Decisions

### Agent reads, server maps

The same split as the Canva change and `pull_open_design_figma_frame`. The agent passes the connector's raw replies as a `figma` source; all mapping (names, scopes, roles, type scale) runs in the server, so it is deterministic and tested with fixtures of real `get_variable_defs` replies.

### Token frames first, then the button

Variables are returned only for what is used under a node, so the agent reads frames that use every token: foundations pages first. The primary button is read too, because it carries the accent even when nothing is named "primary". If no token frames are found, the instructions ask for one link to the foundations page instead of reading every page.

### Scopes beat guessing

Figma scopes say where a variable may be used. Mapping scopes to roles is as safe as mapping selector names in CSS, so it fits the existing "roles from names only" rule.

### Two formats from one read

Claude Design's import writes values with no review. Saving our system first and then running `export_open_design_design_system` gives the person a reviewed system in both places, which is the main thing we add over Claude Design.

## Risks / Trade-offs

- Very large files: `get_metadata` can pass 100k tokens. The instructions tell the agent to search the reply (or the saved file) for frame names rather than read it all.
- Different connector versions name the tools differently. The instructions name Figma's current tools and tell the agent to check its own tool list, as `pull_open_design_figma_frame` already does.
