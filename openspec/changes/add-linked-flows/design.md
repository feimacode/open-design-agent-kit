## Context

Collections have no registry: `collectionScan.ts` finds artifacts whose manifests share a `collectionId`. Each screen is built and registered separately. Export can inline one artifact into a single HTML file (`inlineExport.ts`) or bundle a site (`siteBundle.ts`). The MCP App preview renders one artifact.

## Goals / Non-Goals

**Goals:** a collection behaves like a prototype: links work, the nav is one object, the flow is visible as a map, and broken or missing pieces are found.

**Non-Goals:** state machines or data passing between screens; transitions and animation between screens; a visual flow editor (the map is generated and read-only); flows across collections.

## Decisions

### The plan lives on every screen

No central file, matching how collections already work: each screen's manifest holds the same `metadata.flow` plus its `screenId`. The latest registered plan wins; a screen with an older plan gets a note. This keeps every screen self-describing when copied or published alone.

### Shared nav as an include, not a convention

OpenPencil fixes drift after generation; we can prevent it, because we write files. The first screen writes `_shared/nav.html`; later screens include it with `<template data-od-include="_shared/nav.html">`, resolved at preview, check and export time, and only set which item is active. Drift is still checked for screens that inline their own nav.

### Links are plain hrefs

`href` to the sibling entry path works when files are opened directly and on any static host; `data-od-goto` lets preview and single-file export rewrite links when screens are bundled. A trigger without a target screen uses `href="#"` and is reported only if the plan says it links.

### One-file prototype

The single-file export puts each screen in a `<section data-od-screen>` with its styles scoped by a screen class, shows one at a time and maps `data-od-goto` to section switches, with the flow map as an optional first section. The existing 16 MB artifact limit applies.

### Collection check

`check_open_design_artifact` gains `collectionId`; it checks each screen as today (within an image budget split across screens) and runs the flow findings over the set. Without it, a single-screen check runs only `flow-broken-link` for that screen.

## Risks / Trade-offs

- Agents may not keep the include. Mitigation: `flow-nav-drift` catches inlined navs that differ.
- Plans go stale as screens are added. Mitigation: registering a screen not in the plan adds it and returns a note to update the links.
