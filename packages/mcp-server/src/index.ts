#!/usr/bin/env node
// Uses the SDK's low-level Server API (manual tools/list + tools/call
// handlers with plain JSON Schema objects) rather than McpServer.registerTool.
// Deliberate: registerTool's generic, zod-raw-shape-based overload caused a
// real, reproducible `tsc` out-of-memory crash (multi-GB heap growth, even
// with --max-old-space-size=4096) once more than a couple of tools were
// registered with distinct input shapes in one file — a known-shape TS
// generic-inference blowup, not a bug in this file's own logic. This
// approach needs slightly more boilerplate (hand-written JSON Schemas,
// mirrored 1:1 from packages/vscode's languageModelTools contributions for
// parity) but compiles in well under a second.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  RootsListChangedNotificationSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ContentIndex, FORMAT_IDS, type ListSkillsInput } from '@feimacode/open-design-agent-kit-core';
import { getAssetsRoot, getFigmaToken, getOutputDirectory, getWorkspaceRoot, getWorkspaceRootOverride, workspaceRootFromClientRoots } from './env';
import { createFileActiveDesignSystemStore } from './store';
import * as tools from './tools';
import type { ToolContext } from './tools';

interface ToolDef {
  tool: Tool;
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<string | tools.ToolOutput>;
}

const TOOL_DEFS: ToolDef[] = [
  {
    tool: {
      name: 'list_open_design_skills',
      description:
        "Lists available Open Design skills, design templates, and remixable examples — reusable design-task recipes, rendering styles, and (for 'example' entries) actual starting artifacts bundled with this server. Each result's id is namespaced as 'od:<mode>:<name>' (e.g. 'od:deck:guizang-ppt') — pass this full id as skillId to prepare_open_design_brief or remix_open_design_example. Each result's 'source' field is 'skill', 'design-template', or 'example'. Some results include an 'examplePrompt' — prefer it (or lightly adapt it) over inventing your own brief when it closely fits. A result with a non-empty 'exampleArtifactPath' has an actual rendered starting artifact — prefer remix_open_design_example over prepare_open_design_brief for those. Optionally filter by a free-text query, an exact mode, an exact source, and/or remixableOnly to see only entries with a rendered starting artifact. SURFACES: when the user names a kind of thing to make — a prototype or landing page, mobile app, slides, document, wireframe, animation, résumé, research synthesis, data report, poster or flier, social post, diagram — call this tool with surface set to that surface's id first (call with surface \"list\" to see the ids) and pick from its entries; if the surface names a prompt, follow that flow. STUBS: an entry with stub: true only advertises an upstream skill and has no instructions here — never pick one; choose a non-stub entry instead. If a query returns few or no results, call this tool again with a broader query or no arguments at all to browse the full catalog — do NOT search the filesystem, grep, or read any file (this catalog is not stored anywhere as a single readable file such as a content.json, index, or schema file; it exists only inside this server's own runtime and is reachable exclusively through this tool).",
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional free-text filter, matched against skill name, description, and triggers.' },
          mode: {
            type: 'string',
            enum: ['prototype', 'deck', 'design-system', 'image', 'video', 'template', 'utility', 'audio', 'other'],
            description: 'Optional exact mode filter.',
          },
          source: {
            type: 'string',
            enum: ['skill', 'design-template', 'example'],
            description: 'Optional exact source filter.',
          },
          surface: {
            type: 'string',
            description:
              "A kind of thing to make — returns that surface's entries in curated order (the recipe first, then its remixable example; never catalog stubs), plus the surface's own prompt and clarifying questions. Pass \"list\" to get the surfaces themselves (id, label, description, entryCount). Ignores the other filters.",
          },
          remixableOnly: {
            type: 'boolean',
            description: 'Optional: when true, only return entries with a non-empty exampleArtifactPath (i.e. an actual rendered starting artifact to remix).',
          },
        },
      },
    },
    handler: (ctx, args) =>
      tools.listSkills(ctx, args as ListSkillsInput).then((r) => JSON.stringify(r, null, 2)),
  },
  {
    tool: {
      name: 'list_open_design_design_systems',
      description:
        "Lists available Open Design design systems — brand-inspired visual token sets (palette, typography, spacing, component rules), each with a 'category' and an 'active' flag marking the current active design system, if any. Optionally filter by a free-text query and/or an exact category. If a query returns few or no results, call this tool again with a broader query or no arguments at all to browse the full catalog — do NOT search the filesystem, grep, or read any file (this catalog is not stored anywhere as a single readable file such as a content.json, index, or schema file; it exists only inside this server's own runtime and is reachable exclusively through this tool).",
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional free-text filter, matched against design system name, summary, and category.' },
          category: { type: 'string', description: "Optional exact category filter, e.g. 'E-Commerce & Retail'." },
        },
      },
    },
    handler: (ctx, args) =>
      tools.listDesignSystems(ctx, args as { query?: string; category?: string }).then((r) => JSON.stringify(r, null, 2)),
  },
  {
    tool: {
      name: 'read_open_design_source',
      description:
        "Converts a workspace document (DOCX, PPTX, XLSX, PDF, Markdown, text or CSV) into Markdown under the output directory's sources/ folder, extracts its embedded images, and returns an outline (headings with line ranges and sizes), never the full text. Read the returned markdownPath yourself, by line range, for the sections you need. Cached by content hash. Use it to look into a source before deciding how to use it; prepare_open_design_brief with `sources` calls it for you. PDFs need `pdftotext` (poppler); without it the result says to read the PDF with your own tools.",
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative path of the document, e.g. "docs/q3-report.docx" or "CHANGELOG.md".' },
        },
        required: ['path'],
      },
    },
    handler: (ctx, args) => tools.readSource(ctx, args as { path: string }),
  },
  {
    tool: {
      name: 'prepare_open_design_brief',
      description:
        "Composes generation instructions for an Open Design artifact by combining the chosen skill's workflow, an optional design system's visual tokens, universal craft rules, and the user's brief. Returns an 'instructions' string you must follow, plus a 'suggestedEntryPath'. Does NOT write any files — after calling it, author the entry file (and any supporting files) yourself with your normal file-editing tools, then call register_open_design_artifact.",
      inputSchema: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: "A skill id from list_open_design_skills, in its full 'od:<mode>:<name>' form." },
          designSystemId: {
            type: 'string',
            description:
              'Optional design system id from list_open_design_design_systems. If omitted, falls back to the active design system. If given explicitly, it also becomes the new active one.',
          },
          brief: { type: 'string', description: "The user's design brief / request, in their own words." },
          collectionId: {
            type: 'string',
            description:
              'Set this (a slug you derive once from the collection name, reused verbatim on every call) when this artifact is one screen of a multi-screen design collection — see the "design collections" guidance for the full workflow.',
          },
          collectionName: {
            type: 'string',
            description: 'A short display name for the collection, e.g. "Fintech Onboarding Flow". Required together with collectionId.',
          },
          screenRole: {
            type: 'string',
            description: 'Required together with collectionId — this screen\'s short role label, e.g. "splash", "value-prop", "checkout".',
          },
          screenTotal: {
            type: 'number',
            description: 'Optional: the total number of screens you\'ve planned for this collection, for an accurate "screen N of M" framing.',
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10,
            description:
              "Workspace paths of documents to build the design from (1–10): reports, specs, spreadsheets, existing decks, or repository files such as CHANGELOG.md or docs/adr/*.md. When given, the instructions add the extracted material, a storyline-first workflow (write outline.md, get the user's approval, then build) and accuracy rules.",
          },
          format: {
            type: 'string',
            enum: [...FORMAT_IDS],
            description: 'Optional canvas format. Adds a Canvas section with the exact size, units, safe area and, for print, bleed and minimum type size, so any skill can produce a post or poster at that size. Screen: x-image (1600×900), ig-square (1080×1080 per card), ig-portrait (1080×1350), story (1080×1920), xhs-card (1080×1440 per card), yt-thumbnail (1280×720), linkedin-image (1200×627), og-image (1200×630), x-header (1500×500), linkedin-banner (1584×396), email-header (600×200, captured at 2×), and display ads banner-mrec (300×250), banner-leaderboard (728×90), banner-skyscraper (160×600), banner-mobile (320×50). Print (trim sizes, authored in mm with bleed): a4, a3, a2, a1, a0, letter, tabloid, poster-18x24, poster-24x36. Pass the same id as format to register_open_design_artifact.',
          },
          fluid: {
            type: 'boolean',
            description:
              "With format (or alone): build a fluid design that reflows to any canvas shape, sized in container units with layout rules for wide and tall shapes; the shape is then picked at export (preset/presets) or in the preview, without regenerating. Default: true for print formats, false for screen formats (social recipes need exact pixels). fluid: true without format uses A3 as the default shape. Use it for posters.",
          },
        },
        required: ['skillId', 'brief'],
      },
    },
    handler: (ctx, args) =>
      tools.prepareBrief(
        ctx,
        args as {
          skillId: string;
          designSystemId?: string;
          brief: string;
          collectionId?: string;
          collectionName?: string;
          screenRole?: string;
          screenTotal?: number;
          sources?: string[];
          format?: string;
          fluid?: boolean;
        },
      ),
  },
  {
    tool: {
      name: 'prepare_open_design_exploration',
      description:
        "Use INSTEAD of prepare_open_design_brief when the user explicitly asks for options, directions, alternatives or several versions of a design. Assigns 2–4 deliberately different directions (visual styles when no design system is active, layout/narrative structures when one is, or labels you pass for a named axis), writes the exploration's plan, and returns sharedInstructions plus one short instructions block, entry path and directionId per direction. Directions are quick sketches; only the one the user picks is built out. Writes no design files: write each direction yourself (follow sharedInstructions + that direction's instructions), register it with explorationId and directionId, then call compare_open_design_exploration. STYLE TILES: with skillId od:design-system:style-tile the directions are compact color + type tiles (default 4, visual axis even with an active design system; axis \"custom\" with an active system evolves it). Choosing one with next \"save-design-system\" copies the tile's tokens verbatim.",
      inputSchema: {
        type: 'object',
        properties: {
          skillId: { type: 'string', description: "A skill id from list_open_design_skills, in its full 'od:<mode>:<name>' form." },
          brief: { type: 'string', description: "The user's design brief / request, in their own words." },
          count: { type: 'integer', minimum: 2, maximum: 6, description: 'How many directions: 2–4, default 3; for the style-tile skill 2–6, default 4.' },
          axis: {
            type: 'string',
            enum: ['visual', 'structure', 'custom'],
            description:
              "What the directions differ in. Omit for the default: 'structure' when a design system is active (brand stays fixed), otherwise 'visual'. 'visual' with an active design system sets that system aside for this exploration. 'custom' needs customDirections.",
          },
          directionIds: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Optional: pick specific directions instead of the default order. Visual ids: modern-minimal, human-approachable, tech-utility, editorial-monocle (editorial/publishing briefs), brutalist-experimental (art, agency, manifesto). Structure ids for pages: classic-hero-grid, story-led-scroll, product-ui-first, dense-utility; for decks: problem-solution, narrative-journey, data-led, demo-first.",
          },
          customDirections: {
            type: 'array',
            items: {
              type: 'object',
              properties: { label: { type: 'string' }, brief: { type: 'string', description: 'What makes this direction different.' } },
              required: ['label', 'brief'],
            },
            description: 'For a user-named axis (e.g. "three hero concepts"): 2–4 directions (style tiles: up to 6), each a distinct label and a one-paragraph brief.',
          },
          designSystemId: {
            type: 'string',
            description: 'Optional design system id. If omitted, the active one is used. If given, it also becomes the active one.',
          },
        },
        required: ['skillId', 'brief'],
      },
    },
    handler: (ctx, args) => tools.prepareExploration(ctx, args as unknown as Parameters<typeof tools.prepareExploration>[1]),
  },
  {
    tool: {
      name: 'compare_open_design_exploration',
      description:
        "Call after registering an exploration's directions. Refreshes and returns the path of its comparison page (compare.html: every direction side by side, opens in any browser from the file system), lists registered and missing directions, and with contactSheet: true renders a PNG of the comparison with the installed browser. If you can view images, check the contact sheet that the directions really differ before showing the user.",
      inputSchema: {
        type: 'object',
        properties: {
          explorationId: { type: 'string', description: 'The explorationId returned by prepare_open_design_exploration.' },
          contactSheet: { type: 'boolean', description: 'Also render the comparison page to exports/contact-sheet.png. Default false.' },
        },
        required: ['explorationId'],
      },
    },
    handler: (ctx, args) => tools.compareExploration(ctx, args as { explorationId: string; contactSheet?: boolean }),
  },
  {
    tool: {
      name: 'choose_open_design_direction',
      description:
        "Call when the user picks a direction from an exploration. Records the choice (marked on the comparison page) and returns instructions for the next step: 'build-out' builds the chosen sketch out at full fidelity, 'merge' does the same while taking named aspects from other directions (needs mergeFrom), and 'save-design-system' turns the direction into a reusable custom design system. Writes no design files.",
      inputSchema: {
        type: 'object',
        properties: {
          explorationId: { type: 'string', description: 'The exploration id.' },
          directionId: { type: 'string', description: 'The chosen direction id. It must already be registered.' },
          next: { type: 'string', enum: ['build-out', 'merge', 'save-design-system'], description: 'What to do with the chosen direction.' },
          notes: { type: 'string', description: "Optional: the user's own adjustments, in their words." },
          mergeFrom: {
            type: 'array',
            items: {
              type: 'object',
              properties: { directionId: { type: 'string' }, aspect: { type: 'string', description: 'What to take, e.g. "hero", "colour palette", "pricing table".' } },
              required: ['directionId', 'aspect'],
            },
            description: "Required for 'merge': which aspects to take from which other directions.",
          },
        },
        required: ['explorationId', 'directionId', 'next'],
      },
    },
    handler: (ctx, args) => tools.chooseDirection(ctx, args as unknown as Parameters<typeof tools.chooseDirection>[1]),
  },
  {
    tool: {
      name: 'register_open_design_artifact',
      description:
        "Call this AFTER you have written an artifact's entry file (and any supporting files) into the workspace with your normal file-editing tools. Validates the artifact and writes its manifest sidecar (<entry>.artifact.json) next to the entry file. Fails clearly if entryPath does not exist yet.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: { type: 'string', description: "Workspace-relative path to the artifact's entry file." },
          kind: {
            type: 'string',
            enum: ['html', 'deck', 'react-component', 'markdown-document', 'svg', 'diagram', 'code-snippet', 'mini-app', 'design-system'],
            description: 'The kind of artifact.',
          },
          title: { type: 'string', description: 'A short human-readable title for the artifact.' },
          supportingFiles: {
            type: 'array',
            items: { type: 'string' },
            description: "Workspace-relative paths to sibling files the entry depends on, relative to the entry file's directory.",
          },
          sourceSkillId: { type: 'string', description: 'The skillId used to generate this artifact, if any.' },
          designSystemId: { type: 'string', description: 'The designSystemId used to generate this artifact, if any.' },
          collectionId: { type: 'string', description: 'The same collectionId passed to prepare_open_design_brief, if this screen is part of a design collection.' },
          collectionName: { type: 'string', description: 'The same collectionName passed to prepare_open_design_brief, if this screen is part of a design collection.' },
          screenIndex: { type: 'number', description: '0-based position of this screen within its collection (0 for the first screen, 1 for the second, ...).' },
          screenRole: { type: 'string', description: 'The same screenRole passed to prepare_open_design_brief, if this screen is part of a design collection.' },
          explorationId: { type: 'string', description: 'The explorationId from prepare_open_design_exploration, if this artifact belongs to a design exploration. Updates its comparison page.' },
          directionId: {
            type: 'string',
            description: "The direction's directionId, for an exploration sketch. Leave it out for a built-out or merged version registered against the exploration.",
          },
          sources: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10,
            description: "The same source document paths passed to prepare_open_design_brief. Records each source's hash in the manifest and, for HTML, reports numbers on the page that appear in none of the sources so you can check them.",
          },
          format: {
            type: 'string',
            enum: [...FORMAT_IDS],
            description: "The canvas format passed to prepare_open_design_brief (or the adaptation's registerArgs), if any. Recorded in the manifest's metadata.format so export, preflight and adaptation use it without repeating it.",
          },
        },
        required: ['entryPath', 'kind', 'title'],
      },
    },
    handler: (ctx, args) =>
      tools.registerArtifact(
        ctx,
        args as {
          entryPath: string;
          kind: string;
          title: string;
          supportingFiles?: string[];
          sourceSkillId?: string;
          designSystemId?: string;
          collectionId?: string;
          collectionName?: string;
          screenIndex?: number;
          screenRole?: string;
          explorationId?: string;
          directionId?: string;
          sources?: string[];
          format?: string;
        },
      ),
  },
  {
    tool: {
      name: 'get_open_design_artifact',
      description:
        "Reads back a registered Open Design artifact: its manifest, entry file content, supporting file list, and any open comments. This host has no comment-authoring UI, so 'openComments' will normally be empty.",
      inputSchema: {
        type: 'object',
        properties: { entryPath: { type: 'string', description: "Workspace-relative path to the artifact's entry file." } },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) => tools.getArtifact(ctx, args as { entryPath: string }),
  },
  {
    tool: {
      name: 'set_active_design_system',
      description:
        'Sets (or clears, if designSystemId is omitted/empty) the active Open Design design system, persisted for this workspace. Used automatically by prepare_open_design_brief whenever called without an explicit designSystemId.',
      inputSchema: {
        type: 'object',
        properties: {
          designSystemId: {
            type: 'string',
            description: 'A design system id from list_open_design_design_systems. Omit or pass an empty string to clear.',
          },
        },
      },
    },
    handler: (ctx, args) => tools.setActiveDesignSystemTool(ctx, args as { designSystemId?: string }),
  },
  {
    tool: {
      name: 'create_open_design_design_system',
      description:
        'Composes instructions for authoring a brand-new, custom design system as a DESIGN.md file plus a sibling tokens.css following the Open Design token contract. Does NOT write any files. If sourceUrl is given, performs a best-effort extraction of candidate colors/fonts from that page. After writing the files, call set_active_design_system with the returned id. To write ONLY a tokens.css for an existing custom design system (id starting with user:), pass existingDesignSystemId instead of name/brief.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'A short name for the design system. Required unless existingDesignSystemId is given.' },
          brief: { type: 'string', description: "A description of the brand, in the user's own words. Required unless existingDesignSystemId is given." },
          sourceUrl: { type: 'string', description: 'Optional: a website URL to extract a starting palette/fonts from.' },
          existingDesignSystemId: {
            type: 'string',
            description: 'Optional: the id of an existing custom design system (user:…). Returns instructions to write only its tokens.css, from its current DESIGN.md.',
          },
        },
      },
    },
    handler: (ctx, args) =>
      tools.createCustomDesignSystem(ctx, args as { name?: string; brief?: string; sourceUrl?: string; existingDesignSystemId?: string }),
  },
  {
    tool: {
      name: 'port_open_design_artifact_to_app',
      description:
        "Composes instructions for porting a finished Open Design artifact's design into this workspace's actual, existing application as real, idiomatic production code. Does NOT write any files. Directs the model to ground the port in a real existing component and explicitly excludes routing/navigation wiring.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: { type: 'string', description: 'The workspace-relative path of the artifact to promote.' },
          targetComponentPath: { type: 'string', description: 'Optional: where the new component/code file should be written.' },
          referenceComponentPath: { type: 'string', description: 'Optional: an existing component file to use as the pattern reference.' },
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) =>
      tools.portToAppCode(ctx, args as { entryPath: string; targetComponentPath?: string; referenceComponentPath?: string }),
  },
  {
    tool: {
      name: 'pull_open_design_figma_frame',
      description:
        "Composes instructions for translating a Figma frame into a real code artifact with 1:1 visual fidelity. Fetches the frame's structure via the Figma REST API (requires the OPEN_DESIGN_FIGMA_TOKEN environment variable — a Figma personal access token) and a best-effort rendered image export, then returns 'instructions' embedding a deterministic structural summary as ground truth. Does NOT write any files — after calling it, author the entry file yourself with your normal file-editing tools, then call register_open_design_artifact. figmaUrl must be a frame-scoped link (Figma's \"Copy link to selection\"), not a bare file link.",
      inputSchema: {
        type: 'object',
        properties: {
          figmaUrl: { type: 'string', description: 'A Figma frame URL, e.g. from "Copy link to selection" — must include a node-id.' },
          designSystemId: { type: 'string', description: 'Optional design system id from list_open_design_design_systems to align the translated code with.' },
        },
        required: ['figmaUrl'],
      },
    },
    handler: (ctx, args) => tools.pullFigmaFrame(ctx, args as { figmaUrl: string; designSystemId?: string }),
  },
  {
    tool: {
      name: 'remix_open_design_example',
      description:
        "Copies a curated Open Design example artifact (identified by its skillId, which must have a non-empty 'exampleArtifactPath') into the workspace as a starting point, registers it, and returns instructions to MODIFY the copied file rather than regenerate it from scratch.",
      inputSchema: {
        type: 'object',
        properties: { skillId: { type: 'string', description: "A skillId whose 'exampleArtifactPath' is non-empty." } },
        required: ['skillId'],
      },
    },
    handler: (ctx, args) => tools.remixExample(ctx, args as { skillId: string }),
  },
  {
    tool: {
      name: 'export_open_design_artifact',
      description:
        "Renders a registered Open Design artifact in a headless browser (an installed Chrome, Edge, or Chromium) and writes upload-ready file(s) under the artifact's own exports/ folder. Does not modify the artifact's source files. IMAGES (png/jpeg): use after register_open_design_artifact whenever the user wants an image to post (X, Instagram, Xiaohongshu, a YouTube thumbnail, a poster). Size comes from explicit width/height, else the source skill's aspect hint, else each selected element's box, else 1080×1080. For multi-card designs mark each card with data-od-card and pass selector \"[data-od-card]\" for one numbered image per card. Pass maxBytes with the platform's upload limit (X 5000000, YouTube thumbnail 2000000, Instagram 8000000) and images are re-encoded as JPEG until they fit. DECKS: format \"pptx\" gives a PowerPoint file with one full-bleed slide image per slide (pixel-perfect, not editable text); format \"pdf\" gives one page per slide. Slides are captured at the deck's own measured slide size, at scale 2 by default. Artifacts registered with kind \"deck\" (or made from an od:deck:* skill) are detected automatically; pass deck: true if a deck was registered as \"html\". Pass slides (1-based numbers) with format png/jpeg to export just those slides as images. PAGES: format \"pdf\" on an ordinary page prints it with the browser's print engine (vector, selectable text, A4 unless the page's CSS sets a size). Not for video — HyperFrames videos are rendered with the HyperFrames CLI per the brief's instructions. POSTERS AND PREFLIGHT: page exports run preflight checks (text overflow, safe area, print bleed size, minimum type size, contrast, emoji, image resolution for print, QR codes that don't decode, broken assets) and list findings, errors first; findings never block the export. Pass checkOnly: true to check without writing files, and fix every error before the real export. Pass preset with a format id (\"ig-portrait\", \"story\", \"a3\"…) rather than width/height/selector/maxBytes. Pass data with a spreadsheet to export one poster, card or certificate per row. FLUID POSTERS (cards with data-od-fluid): preset reflows the design to that shape in the rendered page (the file is unchanged); presets exports several shapes at once; shapeSheet shows them all in one image. EMAIL AND PASTE: format \"email\" writes an inbox-safe email (and checks for what breaks in Gmail and Outlook: flex/grid layout, SVG, transforms, local images, missing alt, width over 640px, size over 102 KB); format \"paste\" with target wechat|notion|newsletter|generic writes an inlined fragment. Both compute styles in the browser, so Tailwind or any runtime CSS is inlined. To use the result, the user opens the file in a browser, selects all, copies and pastes. VIDEO AND GIF: format \"mp4\", \"webm\" or \"gif\" renders animated HTML (CSS animations, requestAnimationFrame, timers, data-duration storyboards, WebGL) frame by frame and encodes it with an installed ffmpeg (never downloaded; a 'no-ffmpeg' or 'ffmpeg-missing-encoder' error says what to install). Up to 60 seconds. Use maxBytes for platform limits (re-encodes smaller). HyperFrames compositions still render with the HyperFrames CLI.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: "Workspace-relative path to the registered artifact's entry file.",
          },
          format: {
            type: 'string',
            enum: ['png', 'jpeg', 'pdf', 'pptx', 'standalone', 'site', 'email', 'paste', 'mp4', 'webm', 'gif'],
            description:
              'Output format. png/jpeg: images; pdf: deck slides or a printed page; pptx: decks only; standalone: one self-contained .html with local CSS, scripts, images and fonts inlined (to attach or send); site: a deploy-ready folder (exports/site/) with index.html and its files (to publish — prefer publish_open_design_artifact, which builds it for you). standalone/site need no browser. Default png. email: an inbox-ready HTML email (exports/<name>.email.html, styles inlined, 600px column, preheader, dark-mode meta) plus a plain-text exports/<name>.email.txt, with email preflight; pass baseUrl once the artifact\'s assets are hosted so image URLs become absolute. paste: an inlined HTML fragment to paste into another editor (exports/<name>.<target>.html); needs target. mp4, webm, gif: animate the page on a virtual clock (frame-exact, the same on every run) and encode it with an installed ffmpeg; size from width/height, preset or the skill, duration from the page unless you pass duration.',
          },
          quality: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            description: 'JPEG quality (jpeg only). Default 90.',
          },
          width: {
            type: 'integer',
            minimum: 16,
            maximum: 8192,
            description: "Width in CSS pixels, given with height. Overrides the skill's size for images, the measured slide size for decks, or the print page size for page PDFs.",
          },
          height: {
            type: 'integer',
            minimum: 16,
            maximum: 8192,
            description: 'Viewport height in CSS pixels. Give together with width.',
          },
          scale: {
            type: 'number',
            minimum: 1,
            maximum: 3,
            description: 'Device scale factor (1–3). Default 2 for deck pptx/pdf (crisp when projected), 1 otherwise.',
          },
          selector: {
            type: 'string',
            description: 'CSS selector; each matching element is exported as its own numbered image (e.g. "[data-od-card]").',
          },
          maxBytes: {
            type: 'integer',
            minimum: 1,
            description: 'Per-file byte budget; over-budget images are re-encoded as progressively lower-quality JPEG until they fit.',
          },
          deck: {
            type: 'boolean',
            description: "Force deck handling (true) or page handling (false). Omit to detect it from the artifact's kind and source skill.",
          },
          slides: {
            type: 'array',
            items: {
              type: 'integer',
              minimum: 1,
            },
            description: 'Decks only: 1-based slide numbers to export, e.g. [1, 3]. With png/jpeg, one image per slide; with pdf/pptx, only these slides in this order.',
          },
          badge: {
            type: 'boolean',
            description: 'standalone/site only: add a small, closeable "Made with Open Design" footer badge. Default: on for site, off for standalone (OPEN_DESIGN_SHARE_BADGE overrides the default).',
          },
          target: {
            type: 'string',
            enum: ['wechat', 'notion', 'newsletter', 'generic'],
            description:
              "format \"paste\" only: where it will be pasted. wechat: top-level blocks become <section>s for the WeChat Official Account editor. notion: layout wrappers flattened and code-block languages kept, as Notion turns pasted HTML into blocks. newsletter: email rules and checks applied to the fragment. generic: any rich-text editor.",
          },
          baseUrl: {
            type: 'string',
            description: "site: the https address the bundle will be served from, so the link-preview image (og:image) can be an absolute URL. email and paste: where the artifact's files are hosted; relative image and link URLs are rewritten against it.",
          },
          preset: {
            type: 'string',
            enum: [...FORMAT_IDS],
            description: "A canvas format id instead of hand-copied sizes. Screen formats (x-image (1600×900), ig-square (1080×1080 per card), ig-portrait (1080×1350), story (1080×1920), xhs-card (1080×1440 per card), yt-thumbnail (1280×720), linkedin-image (1200×627), og-image (1200×630), x-header (1500×500), linkedin-banner (1584×396), email-header (600×200, captured at 2×), and display ads banner-mrec (300×250), banner-leaderboard (728×90), banner-skyscraper (160×600), banner-mobile (320×50)) fill in width/height, selector \"[data-od-card]\" and the platform's byte budget. Print formats (a4, a3, a2, a1, a0, letter, tabloid, poster-18x24, poster-24x36) produce a print-ready PDF the size of the bleed box, with TrimBox and BleedBox set. Explicit arguments still win. Without preset, the format the artifact was registered with is used.",
          },
          bleed: {
            type: 'number',
            minimum: 0,
            maximum: 20,
            description: "Print PDFs only: bleed in mm on every side. Default: the format's (3 mm for ISO sizes, 3.175 mm for US sizes). The card must be authored at trim size plus this bleed.",
          },
          cropMarks: {
            type: 'boolean',
            description: 'Print PDFs only: add crop marks at the trim corners in a 10 mm slug around the page.',
          },
          checkOnly: {
            type: 'boolean',
            description: 'Run the page load and preflight checks only, writing no files and leaving the manifest alone. Use it to check and fix a design before exporting.',
          },
          data: {
            type: 'string',
            description: "Workspace-relative CSV, XLSX or JSON-array file. For each row, [data-od-field=\"<column>\"] elements are filled (text, or src on img, href on a) and [data-od-qr-field=\"<column>\"] gets a QR code, in the rendered page only (the file isn't changed). Images: one file per row; PDFs: one multi-page file (or split). At most 200 rows; every field must have a column.",
          },
          sheet: {
            type: 'string',
            description: 'XLSX data only: the sheet to read (default: the first).',
          },
          nameField: {
            type: 'string',
            description: "With data: the column whose value names each row's file (slugified, made unique), e.g. \"name\" gives poster-ada-lovelace.png. Default: row numbers.",
          },
          split: {
            type: 'boolean',
            description: 'With data and a PDF format: one PDF per row instead of one multi-page PDF.',
          },
          presets: {
            type: 'array',
            items: { type: 'string', enum: [...FORMAT_IDS] },
            minItems: 1,
            maxItems: 15,
            description:
              "Fluid designs only: export several canvas shapes in one call, each reflowed and preflighted at its own shape and written as <name>-<format>.<ext> (PDF for print shapes, PNG for screen shapes unless format is given). Can't be combined with preset, width or height. With data: one file per row per shape.",
          },
          shapeSheet: {
            type: 'boolean',
            description:
              "Fluid designs only: also write exports/<name>-shapes.png, one image showing the design at every shape in presets (default: all catalog formats), each labelled and marked when preflight found errors there. With checkOnly: true it is the only file written. Use it to show the user how a poster looks in every size.",
          },
          fps: {
            type: 'integer',
            minimum: 1,
            maximum: 60,
            description:
              "mp4/webm/gif only: frames per second. Default 30 (15 for GIF).",
          },
          duration: {
            type: 'number',
            minimum: 0.5,
            maximum: 60,
            description:
              "mp4/webm/gif only: length in seconds. Default: the sum of the frames' data-duration, else the longest CSS/Web animation, else 6.",
          },
          loop: {
            type: 'boolean',
            description:
              "gif only: loop forever. Default true.",
          },
          transparent: {
            type: 'boolean',
            description:
              "png only: capture without the page background, so everything the design doesn't paint is transparent — for cut-outs such as a 3D product shot to place on slides or pages. The page (and a 3D scene's renderer) must have a transparent background; a warning says so when every pixel came out opaque. PNGs aren't re-encoded to fit maxBytes when transparent.",
          },
          campaignSheet: {
            type: 'boolean',
            description:
              "Fluid designs: also write exports/campaign-sheet.png — the master at every shape in presets (default: the usual poster and social shapes), plus the first screen of every other piece registered in the master's collection (landing page, email…), each labelled and marked when it has preflight errors. Use it to show the user a whole campaign at a glance. With checkOnly: true it is the only file written.",
          },
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) =>
      tools.exportArtifact(
        ctx,
        args as {
          entryPath: string;
          format?: 'png' | 'jpeg' | 'pdf' | 'pptx' | 'standalone' | 'site' | 'email' | 'paste';
          target?: 'wechat' | 'notion' | 'newsletter' | 'generic';
          campaignSheet?: boolean;
          transparent?: boolean;
          fps?: number;
          duration?: number;
          loop?: boolean;
          quality?: number;
          width?: number;
          height?: number;
          scale?: number;
          selector?: string;
          maxBytes?: number;
          deck?: boolean;
          slides?: number[];
          badge?: boolean;
          baseUrl?: string;
          preset?: string;
          bleed?: number;
          cropMarks?: boolean;
          checkOnly?: boolean;
          data?: string;
          sheet?: string;
          nameField?: string;
          split?: boolean;
          presets?: string[];
          shapeSheet?: boolean;
        },
      ),
  },
  {
    tool: {
      name: 'add_open_design_diagram_runtime',
      description:
        "Adds the diagram runtime to a diagram's HTML entry file, or updates it in place: one inline <script data-od-runtime=\"diagram\"> block, placed before </body>, that lays the diagram out in the browser. It places nodes on a grid by rank and lane, draws right-angle connectors through the gaps between them with arrowheads and labels, boxes groups, and lays out sequence diagrams. The same file then renders identically in the preview, in export, in check_open_design_artifact and in any browser. Call it after writing the diagram markup (the diagram skill's workflow says when); it works before or after register_open_design_artifact and changes nothing else in the file. Never write, copy or edit the runtime yourself. The result restates the markup contract: a container with data-od-diagram (data-direction right|down, or =\"sequence\"); nodes with data-od-node, data-rank, data-lane, optional data-group and data-od-source; hidden <i data-od-link data-from data-to data-label> links; hidden <i data-od-group data-label> groups; for sequences, data-od-participant elements and hidden <i data-od-message data-from data-to data-label data-kind=\"return\"> messages.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: "Workspace-relative path to the diagram's HTML entry file.",
          },
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) => tools.addDiagramRuntime(ctx, args as { entryPath: string }),
  },
  {
    tool: {
      name: 'list_open_design_integrations',
      description:
        "Looks up trusted third-party MCP servers (Canva, Figma, Notion, Google Drive, Slack, posting services such as Buffer and Metricool, X's official server) that a workflow step can use instead of a manual handoff. Call it whenever a step would hand work to another service (import into Canva, read a Figma frame, save to Drive, share in Slack, post to a social network). With no arguments it returns the catalog of capabilities and integrations. With capability, integration and/or platform it returns the providers in priority order (official platform server, then official service, then posting services), the tool-name patterns that show each one is installed, the setup steps for this agent, and the consent rules. Check your own tools (including deferred ones) against those patterns: if one is installed, use it by its server-defined tool name. If none is, offer setup once and only proceed after the user says yes; never install silently, never ask for or write API keys. If the user declines, continue with the workflow's manual path. This tool only returns text: it installs nothing and contacts no service.",
      inputSchema: {
        type: 'object',
        properties: {
          capability: {
            type: 'string',
            description: 'What the step needs, e.g. "design.import", "design.read", "storage.upload", "team.share", "social.post". Call with no arguments to see every capability.',
          },
          integration: {
            type: 'string',
            description: 'A specific integration id, e.g. "canva", "figma", "notion", "google-drive", "slack", "buffer", "metricool", "x".',
          },
          platform: {
            type: 'string',
            description: 'Social network, for social.* capabilities: x, linkedin, instagram, facebook, threads, tiktok, youtube, pinterest, bluesky, mastodon.',
          },
          agent: {
            type: 'string',
            enum: ['claude-code', 'codex', 'vscode', 'cursor', 'generic'],
            description: 'Which agent the setup steps are for. Defaults to the agent this server is connected to.',
          },
        },
      },
    },
    handler: (ctx, args) => tools.listIntegrations(ctx, args as tools.ListIntegrationsArgs),
  },
  {
    tool: {
      name: 'check_open_design_artifact',
      description:
        "Renders a registered Open Design artifact in a headless browser (an installed Chrome, Edge, or Chromium) and returns what it looks like: screenshots attached as images, plus preflight findings (overflow and clipped text, contrast, text overlap, safe area, broken images/fonts, emoji, QR codes, and horizontal-scroll for pages that scroll sideways). Writes no files and leaves the manifest alone. Call it after creating or substantially editing an artifact and registering it, before telling the user it's done: fix every ERROR, look at the screenshots for what the checks can't measure (balance, hierarchy, crowded or empty areas, text over busy imagery), then re-check — at most two fix rounds; tell the user about anything left. What it renders: a page without a [data-od-card] at each viewport (default desktop 1440×900 and mobile 390×844, findings tagged by viewport); a card design (poster, social post) at its registered format size; a deck slide by slide (findings tagged by slide, one contact sheet of up to 12 slides — pass slides to see others). Screenshots are JPEG with a long edge of at most 1568 px; maxImages (default 3, max 6) bounds how many are attached, and 0 returns findings only. Returns a 'no-browser' error when no browser is installed: then skip the check and tell the user once that visual checking needs Chrome, Edge or Chromium. For bulk data rows or shape sheets, use export_open_design_artifact with checkOnly instead.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: "Workspace-relative path to the registered artifact's entry file.",
          },
          viewports: {
            type: 'array',
            description: 'Pages without a card only: 1–4 viewports to check instead of the default desktop 1440×900 and mobile 390×844.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Label used in findings and screenshots, e.g. "tablet".' },
                width: { type: 'integer', minimum: 16, maximum: 8192 },
                height: { type: 'integer', minimum: 16, maximum: 8192 },
              },
              required: ['name', 'width', 'height'],
            },
          },
          slides: {
            type: 'array',
            description: 'Decks only: 1-based slide numbers to check (default every slide; the contact sheet shows the first 12 of them).',
            items: { type: 'integer', minimum: 1 },
          },
          at: {
            type: 'array',
            maxItems: 6,
            items: { type: 'number', minimum: 0, maximum: 60 },
            description:
              "Animations: up to 6 times in seconds. Also captures the artifact at those moments on a virtual clock (labelled t=<seconds>s), so you can see the start, middle and end of an animation. They share maxImages with the regular screenshots.",
          },
          maxImages: {
            type: 'integer',
            minimum: 0,
            maximum: 6,
            description: 'How many screenshots to attach (default 3). 0 returns findings only.',
          },
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) => tools.checkArtifact(ctx, args as unknown as Parameters<typeof tools.checkArtifact>[1]),
  },
  {
    tool: {
      name: 'adapt_open_design_artifact',
      description:
        "Re-composes a finished, registered design for other canvas formats: the same message, copy hierarchy and design system, laid out again for each new size rather than scaled. Use when the user wants a poster or post \"in other sizes\", \"for Instagram and Stories too\", \"as an A3 print as well\", and so on. Returns, per format, instructions (with the master's HTML, that format's canvas rules and re-composition rules), a suggested entry path and the exact arguments to register it with. Writes no design file: write each adaptation yourself, register it with its registerArgs, then preflight and export it with its preset. The master and its adaptations are grouped as one collection (the master is added to a new one if it isn't in one). FLUID designs (data-od-fluid) already reflow to every shape, so for them it returns mode \"tune\" instead: per shape, instructions to check the master at that shape and fix it in place with @container rules; no new files and no collection.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: "Workspace-relative path to the registered master design's entry file.",
          },
          formats: {
            type: 'array',
            items: {
              type: 'string',
              enum: [...FORMAT_IDS],
            },
            minItems: 1,
            maxItems: 6,
            description: '1–6 target canvas formats. Screen: x-image (1600×900), ig-square (1080×1080 per card), ig-portrait (1080×1350), story (1080×1920), xhs-card (1080×1440 per card), yt-thumbnail (1280×720), linkedin-image (1200×627), og-image (1200×630), x-header (1500×500), linkedin-banner (1584×396), email-header (600×200, captured at 2×), and display ads banner-mrec (300×250), banner-leaderboard (728×90), banner-skyscraper (160×600), banner-mobile (320×50). Print: a4, a3, a2, a1, a0, letter, tabloid, poster-18x24, poster-24x36.',
          },
          notes: {
            type: 'string',
            description: 'Optional: what the user said about the adaptations (e.g. "keep the photo on the story").',
          },
        },
        required: ['entryPath', 'formats'],
      },
    },
    handler: (ctx, args) => tools.adaptArtifactTool(ctx, args as { entryPath: string; formats: string[]; notes?: string }),
  },
  {
    tool: {
      name: 'create_open_design_qr_code',
      description:
        "Generates a real, scannable QR code offline as SVG and saves it in a registered artifact's assets/ folder (listed in its manifest's supportingFiles), returning inline SVG markup to paste into the design. Use whenever a design needs a QR code (event sign-up, menu, ticket, download link); never draw a fake or placeholder one. The markup carries data-od-qr, so export preflight decodes the rendered code and checks it. For one code per row of a spreadsheet, mark the slot with data-od-qr-field=\"<column>\" and export with data instead.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: 'Workspace-relative path to the registered artifact the code belongs to.',
          },
          text: {
            type: 'string',
            description: 'What the code encodes, usually a full https URL.',
          },
          name: {
            type: 'string',
            description: 'File name for the SVG under assets/ (default "qr"), e.g. "signup-qr".',
          },
          errorCorrection: {
            type: 'string',
            enum: ['L', 'M', 'Q', 'H'],
            description: 'Error correction level. Default M; use H when a logo will be placed over the code.',
          },
          margin: {
            type: 'integer',
            minimum: 0,
            maximum: 16,
            description: "Quiet zone in modules (default 4, the standard; don't go below 2).",
          },
        },
        required: ['entryPath', 'text'],
      },
    },
    handler: (ctx, args) =>
      tools.createQrCode(ctx, args as { entryPath: string; text: string; name?: string; errorCorrection?: 'L' | 'M' | 'Q' | 'H'; margin?: number }),
  },
  {
    tool: {
      name: 'publish_open_design_artifact',
      description:
        "Publishes a registered Open Design artifact as a live web page, so the user can share a link with teammates or stakeholders. Use when the user asks to share, publish, deploy, host or \"get a link\" for a design. (For a single file to attach or send, use export_open_design_artifact with format \"standalone\" instead.) It builds a deploy-ready folder (exports/site/) locally, then returns step-by-step instructions for publishing it with the host's own CLI from your terminal, under the user's own login or a temporary no-account link: netlify-temporary or cloudflare-temporary (no account, about 60 minutes unless claimed), or netlify, vercel, cloudflare-pages or github-pages (the user's own account). It never deploys anything itself and never handles tokens. Without provider, the instructions ask the user to choose. The instructions require the user's explicit yes before anything goes online. After a successful deploy, call this tool again with published: { provider, url, claimUrl?, expiresAt?, siteRef? } to record the link, so the next publish updates the same site.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: "Workspace-relative path to the registered artifact's entry file.",
          },
          provider: {
            type: 'string',
            enum: ['netlify-temporary', 'cloudflare-temporary', 'netlify', 'vercel', 'cloudflare-pages', 'github-pages'],
            description: 'Where to publish. Omit to get the choices to show the user.',
          },
          badge: {
            type: 'boolean',
            description: 'Add the small, closeable "Made with Open Design" footer badge to the published page. Default true (OPEN_DESIGN_SHARE_BADGE=0 turns the default off).',
          },
          includeFiles: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 10,
            description: "Workspace paths of files in this artifact's own exports/ folder (e.g. an exported PDF) to host alongside the page, at files/<name> in the bundle, publicly downloadable at <site URL>/files/<name>. Used by the Canva flow to give Canva a URL to import. Export the files first.",
          },
          published: {
            type: 'object',
            description: 'Record mode: what the deploy reported. Doesn\'t rebuild anything.',
            properties: {
              provider: { type: 'string', enum: ['netlify-temporary', 'cloudflare-temporary', 'netlify', 'vercel', 'cloudflare-pages', 'github-pages'] },
              url: { type: 'string', description: 'The public https link.' },
              claimUrl: { type: 'string', description: "Temporary providers: the https link the user claims the site with. It's private to the user." },
              expiresAt: { type: 'string', description: 'Temporary providers: ISO date-time when the link stops working unless claimed.' },
              siteRef: { type: 'string', description: 'Site id, project name or owner/repo/folder to redeploy to next time.' },
            },
            required: ['provider', 'url'],
          },
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) =>
      tools.publishArtifact(
        ctx,
        args as {
          entryPath: string;
          provider?: string;
          badge?: boolean;
          includeFiles?: string[];
          published?: { provider: string; url: string; claimUrl?: string; expiresAt?: string; siteRef?: string };
        },
      ),
  },
  {
    tool: {
      name: 'publish_open_design_artifact_to_canva',
      description: "Gets a finished Open Design artifact into Canva. Composes instructions only: it writes nothing and never talks to Canva itself. The instructions have you export the artifact (PDF, or PPTX for a deck), check whether the user's Canva MCP server is connected (via list_open_design_integrations), and then: when Canva is connected, let the user choose between an editable import (the export is hosted briefly on a public link with publish_open_design_artifact, then Canva's import-design-from-url converts it into a design, optionally published as a Brand Template after their yes) and a private upload into their Canva Uploads; when it isn't, offer setup once and otherwise give them Canva's manual Import a file steps. Use when the user wants an artifact in Canva, as a Canva design or a Canva template.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: 'The workspace-relative path of the artifact to get into Canva (as passed to register_open_design_artifact).',
          },
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) => tools.publishToCanva(ctx, args as { entryPath: string }),
  },
];

function buildContext(workspaceRoot: string = getWorkspaceRoot()): ToolContext {
  const outputDir = getOutputDirectory();
  const assetsRoot = getAssetsRoot();
  const contentIndex = new ContentIndex(assetsRoot, () => `${workspaceRoot}/${outputDir}/design-systems`);
  const store = createFileActiveDesignSystemStore(workspaceRoot);
  return { contentIndex, store, workspaceRoot, outputDir, assetsRoot, figmaToken: getFigmaToken() };
}

async function main(): Promise<void> {
  let ctx = buildContext();
  const server = new Server({ name: 'open-design', version: '0.1.0' }, { capabilities: { tools: {}, prompts: {} } });

  // Workspace root precedence: OPEN_DESIGN_WORKSPACE_ROOT, then the client's
  // MCP roots, then the cwd (already in ctx). Requests wait for the first
  // roots lookup so nothing is written to the cwd before it's known.
  const syncRootsFromClient = async (): Promise<void> => {
    if (getWorkspaceRootOverride() || !server.getClientCapabilities()?.roots) return;
    try {
      const root = workspaceRootFromClientRoots((await server.listRoots()).roots);
      if (root && root !== ctx.workspaceRoot) ctx = buildContext(root);
    } catch {
      // A client that advertises roots but fails the request keeps the cwd.
    }
  };
  let rootsReady: Promise<void> = Promise.resolve();
  server.oninitialized = () => {
    rootsReady = syncRootsFromClient();
  };
  server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    rootsReady = syncRootsFromClient();
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS.map((d) => d.tool) }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await rootsReady;
    const def = TOOL_DEFS.find((d) => d.tool.name === request.params.name);
    if (!def) {
      return { content: [{ type: 'text' as const, text: `Unknown tool: ${request.params.name}` }], isError: true };
    }
    try {
      const callCtx = { ...ctx, clientName: server.getClientVersion()?.name };
      return { content: tools.toCallToolContent(await def.handler(callCtx, (request.params.arguments as Record<string, unknown>) ?? {})) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text' as const, text: `Tool "${request.params.name}" failed: ${message}` }], isError: true };
    }
  });

  // Remixable-example prompts: lets an MCP client (e.g. Claude Code's
  // /mcp__open-design__<name> picker) prefill a starting brief for the user
  // to review/edit, mirroring packages/vscode's chatWithExample.ts. Selecting
  // one writes nothing — same non-destructive "just browsing" guarantee.
  // Hand-written workflow prompts (e.g. open-design-social-post) are listed
  // first, each taking the user's brief as an optional argument.
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    await rootsReady;
    const localPrompts = await tools.listLocalPrompts(ctx);
    const prompts = await tools.listRemixablePrompts(ctx);
    return {
      prompts: [
        ...localPrompts.map((p) => ({
          name: p.name,
          description: p.description,
          arguments: [{ name: 'brief', description: p.argumentHint ?? p.placeholder, required: false }],
        })),
        ...prompts.map((p) => ({ name: p.name, description: `${p.displayName} (Open Design remixable example)` })),
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    await rootsReady;
    const localPrompt = (await tools.listLocalPrompts(ctx)).find((p) => p.name === request.params.name);
    if (localPrompt) {
      return {
        description: localPrompt.description,
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: tools.buildLocalPromptMessage(localPrompt, request.params.arguments?.brief) },
          },
        ],
      };
    }
    const prompts = await tools.listRemixablePrompts(ctx);
    const prompt = prompts.find((p) => p.name === request.params.name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${request.params.name}`);
    }
    return {
      description: `${prompt.displayName} (Open Design remixable example)`,
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: tools.buildRemixPromptMessage(prompt) } }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
