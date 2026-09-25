# Artifact manifest

An **artifact** is a design written into your workspace: an entry file (usually HTML), any supporting files beside it, and a small JSON **manifest** that marks it as an Open Design artifact. Everything is a plain file you can diff, review and commit. There's no database.

## Files on disk

```
.open-design/                               ← openDesign.outputDirectory / OPEN_DESIGN_OUTPUT_DIR
├── config.json                             ← active design system (MCP hosts only)
├── design-systems/<slug>/DESIGN.md         ← custom design systems (ids "user:<slug>")
└── pitch/
    ├── pitch.html                          ← entry file, written by the agent
    ├── pitch.html.artifact.json            ← manifest, written by register_open_design_artifact
    ├── pitch.html.comments.json            ← preview comments (VS Code)
    ├── pitch.html.od-figma.json            ← Figma layer capture (VS Code "Push to Figma")
    ├── assets/…                            ← supporting files
    └── exports/                            ← export_open_design_artifact output
        ├── pitch.pptx
        ├── pitch.pdf
        └── pitch-01.png …
```

Sidecars are named after the entry file (`<entry>.artifact.json`, and so on), so one folder can hold several artifacts.

## Manifest fields

`<entry>.artifact.json` is written by [`register_open_design_artifact`](tools.md#register_open_design_artifact) and [`remix_open_design_example`](tools.md#remix_open_design_example), and updated by [`export_open_design_artifact`](tools.md#export_open_design_artifact).

| Field | Type | Meaning |
|---|---|---|
| `version` | number | Manifest format version (`1`). |
| `kind` | string | `html`, `deck`, `react-component`, `markdown-document`, `svg`, `diagram`, `code-snippet`, `mini-app` or `design-system`. |
| `title` | string | Human-readable title. |
| `entry` | string | Workspace-relative entry path. |
| `renderer` | string | Derived from `kind`: `html`, `deck-html`, `react-component`, `markdown`, `svg`, `diagram`, `code`, `mini-app` or `design-system`. |
| `status` | string | `complete` (default), `streaming` or `error`. |
| `exports` | string[] | The formats this artifact can be exported to. See [Exports by kind](#exports-by-kind). |
| `supportingFiles` | string[] | Sibling files, relative to the entry's folder. |
| `createdAt`, `updatedAt` | ISO date | Timestamps. |
| `sourceSkillId` | string | The skill used, e.g. `od:prototype:card-twitter`. Export uses it for sizing and deck detection. |
| `designSystemId` | string | The design system used. |
| `collectionId`, `collectionName`, `screenRole`, `screenIndex` | string / number | Collection membership. See [Collections](../guides/generate-a-design.md#collections). |
| `metadata` | object | Free-form, at most 16 KB. Uses so far: `metadata.exports` (below) and `metadata.remixedFrom` (the example a remix came from). |

### metadata.exports

Every export records what it wrote, one entry per file. Re-exporting the same path replaces its entry.

```json
"metadata": {
  "exports": [
    { "path": ".open-design/pitch/exports/pitch.pptx", "width": 3840, "height": 2160, "scale": 2, "format": "pptx", "exportedAt": "2026-09-25T10:12:03.000Z" }
  ]
}
```

`width` and `height` are output pixels (the slide stage times the scale, for decks).

## Exports by kind

What each kind can be exported to. `html`, `md`, `jsx`, `svg` and `txt` mean the source file itself.

| Kind | `exports` |
|---|---|
| `html`, `mini-app` | `html`, `png`, `jpeg`, `pdf` |
| `deck` | `html`, `png`, `jpeg`, `pdf`, `pptx` |
| `svg`, `diagram` | `svg`, `png`, `jpeg` |
| `markdown-document`, `design-system` | `md` |
| `react-component` | `jsx` |
| `code-snippet` | `txt` |

Asking for a format outside the list fails with `unsupported-format`. The exception is an explicit `deck: true`, which applies the `deck` list. Manifests written by older versions may list `zip`; that's harmless, but zip export doesn't exist.
