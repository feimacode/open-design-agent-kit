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
import * as path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  RootsListChangedNotificationSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  appOnlyToolMeta,
  clientSupportsMcpApps,
  ContentIndex,
  CRITIQUE_AREAS,
  CRITIQUE_VERDICTS,
  DESIGN_INDUSTRIES,
  DESIGN_MOODS,
  DESIGN_SURFACES,
  DESIGN_THEMES,
  FORMAT_IDS,
  MCP_APP_MIME_TYPE,
  PREVIEW_APP_URI,
  previewAppToolMeta,
  type DesignProfile,
  type ListSkillsInput,
} from '@feimacode/open-design-agent-kit-core';
import { getAssetsRoot, getDefaultWorkspace, getFigmaToken, getOutputDirectory, getWorkspaceRootOverride, isDesktopExtension, isFolderlessAppHost, isPluginLaunched, workspaceRootFromArg, workspaceRootFromClientRoots } from './env';
import { DEFERRED_TO_EXTENSION_MESSAGE, extensionLockPath, holdExtensionLock, readLiveExtensionLock, shouldDeferToExtension, watchExtensionLock } from './extensionLock';
import { desktopLayout, type WorkspaceLayout } from './layout';
import { getManagedRoot, openManagedWorkspace } from './managedWorkspace';
import { createFileActiveDesignSystemStore } from './store';
import { TOOL_ANNOTATIONS } from './toolAnnotations';
import * as tools from './tools';
import type { ToolContext } from './tools';
import {
  hasNoFolderOfItsOwn,
  initialWorkspace,
  MANAGED_WORKSPACE_TOOL,
  needsFolderFromAgent,
  rootsMayReplace,
  SET_WORKSPACE_TOOL,
  workspaceGuardMessage,
  WRITE_FILE_TOOL,
  type WorkspaceSource,
} from './workspace';

interface ToolDef {
  tool: Tool;
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<string | tools.ToolOutput>;
  /** Called only by the preview MCP App's page: listed only to clients that render MCP Apps, which keep it from the model. */
  appOnly?: boolean;
  /** Writes on the agent's behalf: refused outside a managed workspace (openspec add-folderless-chat-support). */
  managedOnly?: boolean;
  /** Reads only the bundled catalog, so it runs before the agent names a folder. A function decides from the call's arguments. */
  catalogOnly?: boolean | ((args: Record<string, unknown>) => boolean);
  /** A model-visible picker (openspec add-mcp-app-pickers): listed only to clients that render MCP Apps, since elsewhere a list_* tool says the same. */
  appsHostOnly?: boolean;
}

const SKILL_MODES = ['prototype', 'deck', 'design-system', 'image', 'video', 'template', 'utility', 'audio', 'other'];

// register_open_design_artifact's `critique` (openspec add-design-critic); validated again on write.
const CRITIQUE_INPUT_SCHEMA = {
  type: 'object',
  description:
    "The design critic's latest opinion (from the open-design-critique skill), stored as metadata.critique; only the latest is kept and it must be at most 4 KB. checkRunId defaults to the latest saved check run and at to now.",
  properties: {
    verdict: { type: 'string', enum: [...CRITIQUE_VERDICTS], description: 'ship (nothing worth a round), polish (one round of the listed fixes) or rework (the direction is wrong).' },
    findings: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          area: { type: 'string', enum: [...CRITIQUE_AREAS], description: 'The rubric area.' },
          where: { type: 'string', description: 'Where on the design (section, element, slide, viewport).' },
          problem: { type: 'string', description: 'What is wrong.' },
          fix: { type: 'string', description: 'The change to make.' },
        },
        required: ['area', 'fix'],
      },
      description: 'At most five, ordered by impact.',
    },
    checkRunId: { type: 'string', description: 'The check run the critic judged.' },
    at: { type: 'string', description: 'ISO time of the critique.' },
  },
  required: ['verdict', 'findings'],
};

const TOOL_DEFS: ToolDef[] = [
  {
    tool: {
      name: 'list_open_design_skills',
      description:
        "Lists available Open Design skills, design templates, and remixable examples — reusable design-task recipes, rendering styles, and (for 'example' entries) actual starting artifacts bundled with this server. Each result's id is namespaced as 'od:<mode>:<name>' (e.g. 'od:deck:guizang-ppt') — pass this full id as skillId to prepare_open_design_brief or remix_open_design_example. Each result's 'source' field is 'skill', 'design-template', or 'example'. Some results include an 'examplePrompt' — prefer it (or lightly adapt it) over inventing your own brief when it closely fits. A result with remixable: true has an actual rendered starting artifact, bundled inside this server and never a file you can find on disk — prefer remix_open_design_example (which copies it into the workspace for you) over prepare_open_design_brief for those. Optionally filter by a free-text query, an exact mode, an exact source, and/or remixableOnly to see only entries with a rendered starting artifact. SURFACES: when the user names a kind of thing to make — a prototype or landing page, mobile app, slides, document, wireframe, animation, résumé, research synthesis, data report, poster or flier, social post, diagram — call this tool with surface set to that surface's id first (call with surface \"list\" to see the ids) and pick from its entries; if the surface names a prompt, follow that flow. STUBS: an entry with stub: true only advertises an upstream skill and has no instructions here — never pick one; choose a non-stub entry instead. PAGING: with more than 40 matches the result is { total, offset, nextOffset, modes, note, entries }, 100 compact entries (id, name, one-line summary, mode, source) per page; narrow with mode, source, query or surface for the full entries, or pass nextOffset as offset for the next page. If a query returns few or no results, call this tool again with a broader query or no arguments at all to browse the full catalog — do NOT search the filesystem, grep, or read any file (this catalog is not stored anywhere as a single readable file such as a content.json, index, or schema file; it exists only inside this server's own runtime and is reachable exclusively through this tool).",
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
              "A kind of thing to make — returns that surface's entries in curated order (the recipe first, then its remixable example; never catalog stubs), plus the surface's own prompt and clarifying questions. Pass \"list\" to get the surfaces themselves (id, label, description, entryCount) and the goals (plain-language aims such as \"Promote an event\", each with the surfaces it leads to). Ignores the other filters.",
          },
          goal: {
            type: 'string',
            description:
              'A goal id from the "list" result (e.g. "promote-event", "get-hired"): returns the surfaces that goal leads to, in order, the first marked default. Use it when the user said what the design is for but not what kind of thing to make.',
          },
          remixableOnly: {
            type: 'boolean',
            description: 'Optional: when true, only return entries with remixable: true (an actual rendered starting artifact to remix).',
          },
          offset: {
            type: 'integer',
            minimum: 0,
            description: "Optional: where a paged listing starts. Pass the previous result's nextOffset for the next page.",
          },
        },
      },
    },
    handler: (ctx, args) =>
      tools.listSkills(ctx, args as ListSkillsInput).then((r) => JSON.stringify(r, null, 2)),
    catalogOnly: true,
  },
  {
    tool: {
      name: 'list_open_design_design_systems',
      description:
        "Lists available Open Design design systems — brand-inspired visual token sets (palette, typography, spacing, component rules), each with a 'category' and an 'active' flag marking the current active design system, if any. Optionally filter by a free-text query and/or an exact category. MOBILE: category 'Mobile Apps' holds systems adapted from real iOS apps (ids ending in '-ios', e.g. 'spotify-ios'). For phone screens prefer them, even over a same-brand web system ('spotify'), which stays the one for web pages. If a query returns few or no results, call this tool again with a broader query or no arguments at all to browse the full catalog — do NOT search the filesystem, grep, or read any file (this catalog is not stored anywhere as a single readable file such as a content.json, index, or schema file; it exists only inside this server's own runtime and is reachable exclusively through this tool).",
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
    catalogOnly: true,
  },
  {
    tool: {
      name: 'recommend_open_design_design_systems',
      description:
        "Recommends 3 to 5 Open Design design systems for a design, ranked the same way every time, each with a one-line reason and its look (light or dark, accent, display type, corner shape). Use it before prepare_open_design_brief when the user hasn't named a design system or a look, no design system is active, and they want a new design (not an edit, remix or export). Fill the profile from the request, the conversation and the workspace; leave out what you don't know. If the result includes `questions`, ask them once, in one message, and accept \"you pick\" (then use the first recommendation). Otherwise use the first recommendation, say which one you used and that they can switch. Does NOT change the active design system: pass the chosen id to prepare_open_design_brief. Product-named looks (Stripe, Linear…) are recommended only when the user names that product, via likeBrands or the brief.",
      inputSchema: {
        type: 'object',
        properties: {
          industries: { type: 'array', items: { type: 'string', enum: [...DESIGN_INDUSTRIES] }, description: 'What the design is for.' },
          moods: { type: 'array', items: { type: 'string', enum: [...DESIGN_MOODS] }, description: 'How it should feel, most important first.' },
          theme: { type: 'string', enum: [...DESIGN_THEMES], description: 'Light or dark, only if the user said or the context makes it clear.' },
          surface: { type: 'string', enum: [...DESIGN_SURFACES], description: 'Where it will be seen.' },
          likeBrands: { type: 'array', items: { type: 'string' }, description: "Products or sites the user wants it to feel like, e.g. ['Notion']." },
          avoid: { type: 'array', items: { type: 'string' }, description: 'Design system ids or moods to leave out.' },
          brief: { type: 'string', description: "The request in the user's words." },
          limit: { type: 'number', description: 'How many to return, 3 to 5 (default 5).' },
        },
      },
    },
    handler: (ctx, args) =>
      tools.recommendDesignSystems(ctx, args as DesignProfile & { limit?: number }).then((r) => JSON.stringify(r, null, 2)),
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
            description: 'Optional canvas format. Adds a Canvas section with the exact size, units, safe area and, for print, bleed and minimum type size, so any skill can produce a post or poster at that size. Screen: x-image (1600×900), ig-square (1080×1080 per card), ig-portrait (1080×1350), pinterest-pin (1000×1500, 20 MB), story (1080×1920), xhs-card (1080×1440 per card), yt-thumbnail (1280×720), linkedin-image (1200×627), og-image (1200×630), x-header (1500×500), linkedin-banner (1584×396), email-header (600×200, captured at 2×), and display ads banner-mrec (300×250), banner-leaderboard (728×90), banner-skyscraper (160×600), banner-mobile (320×50), and shop images shop-product (2048×2048), shop-banner (1920×800), shop-collection (1920×600). Print (trim sizes, authored in mm with bleed): a4, a3, a2, a1, a0, a5, a6, a7, letter, tabloid, poster-18x24, poster-24x36, postcard-4x6, business-card, business-card-us, and cards with rounded corners trading-card, tarot-card, mini-card. Pass the same id as format to register_open_design_artifact.',
          },
          fluid: {
            type: 'boolean',
            description:
              "With format (or alone): build a fluid design that reflows to any canvas shape, sized in container units with layout rules for wide and tall shapes; the shape is then picked at export (preset/presets) or in the preview, without regenerating. Default: true for print formats, false for screen formats (social recipes need exact pixels). fluid: true without format uses A3 as the default shape. Use it for posters.",
          },
          answers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description:
              'Optional: the user\'s answers to the surface\'s (and the design-system recommender\'s) questions, by question id, e.g. { "where": "Printed" }. Written into the instructions as decisions to build to.',
          },
          assumptions: {
            type: 'array',
            items: { type: 'string', maxLength: 160 },
            maxItems: 6,
            description:
              'Optional: what you decided without asking, up to six short lines, e.g. ["dark theme", "one sign-up button"]. Written into the instructions; list them to the user in one sentence when the design is ready.',
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
          answers?: Record<string, string>;
          assumptions?: string[];
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
          resolvedCommentIds: {
            type: 'array',
            items: { type: 'string' },
            description: "Ids of the user's comments (from get_open_design_artifact's openComments) that this edit addressed. They're marked resolved and their pins leave the preview.",
          },
          brief: {
            type: 'object',
            properties: {
              text: { type: 'string', maxLength: 500, description: 'The request in one line.' },
              answers: { type: 'object', additionalProperties: { type: 'string' }, description: 'The same answers passed to prepare_open_design_brief.' },
              assumptions: { type: 'array', items: { type: 'string', maxLength: 160 }, maxItems: 6, description: 'The same assumptions passed to prepare_open_design_brief.' },
            },
            description: "What was asked and assumed for this design, stored as the manifest's metadata.brief (the latest replaces the earlier one) so later edits and checks can see it. Leave it out on an edit that changed none of it.",
          },
          critique: CRITIQUE_INPUT_SCHEMA,
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
          resolvedCommentIds?: string[];
          brief?: unknown;
          critique?: unknown;
        },
      ),
  },
  {
    tool: {
      name: 'get_open_design_artifact',
      description:
        "Reads back a registered Open Design artifact: its manifest, entry file content, supporting file list, and the user's unaddressed comments from the browser preview or VS Code ('openComments', status open or sent). Each comment names its element (selector, text excerpt, htmlHint, rect) and its note; up to 4 comment screenshots are attached as images, newest first, and every comment's screenshot path is listed. Call it when the user says they left comments; address each one, then pass their ids as resolvedCommentIds to register_open_design_artifact. With critique: true it instead returns what the design critic judges (the open-design-critique skill): the recorded brief, title and skill id, the design system's DESIGN.md, the latest saved check run's findings and screenshot paths, and the last critique, with that run's screenshots attached.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: { type: 'string', description: "Workspace-relative path to the artifact's entry file." },
          critique: { type: 'boolean', description: 'Return the critique input instead of the entry content and comments. Default false.' },
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) => tools.getArtifact(ctx, args as { entryPath: string; critique?: boolean }),
  },
  {
    tool: {
      name: 'open_open_design_preview',
      description:
        "Shows a registered Open Design artifact to the user in a live browser preview: an app window of their installed Chrome, Edge or Chromium (else their default browser; else it returns the URL to open). The preview reloads whenever the design's files change. In its Comment mode the user clicks an element to leave a comment with a screenshot; its Send to agent button copies an instruction for them to paste here, and get_open_design_artifact returns the comments. Its Checks panel shows the screenshots of each check_open_design_artifact run, before and after. Call it once per session after the first register_open_design_artifact, unless the user declined; later calls switch the same window to another artifact. Omit entryPath for a list of the workspace's designs. Pass open: false to only get the URL.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: { type: 'string', description: "Workspace-relative path to the registered artifact's entry file. Omit for the list of designs." },
          open: { type: 'boolean', description: 'Open a window (default true). false only starts the preview and returns its URL.' },
        },
      },
    },
    handler: (ctx, args) => tools.openPreview(ctx, args as { entryPath?: string; open?: boolean }),
  },
  {
    tool: {
      name: 'set_up_open_design_browser_pane',
      description:
        "For Claude Desktop's Code tab only (where its preview tool, named like preview_start, is in your tools): adds the open-design-preview configuration to this workspace's .claude/launch.json (created if missing; other configurations are kept; only its own entry is replaced), so the Code tab can run the live browser preview in its Browser pane. Returns the configuration name and port. Then start that configuration with the Code tab's preview tool; the pane opens on the newest registered design. Call it once per project, before the first time you show a design in the Code tab, and tell the user once that you added a preview entry to .claude/launch.json. Elsewhere use open_open_design_preview.",
      inputSchema: { type: 'object', properties: {} },
    },
    handler: (ctx) => tools.setUpBrowserPane(ctx, SERVER_VERSION),
  },
  {
    tool: {
      name: 'show_open_design_artifact',
      description:
        "Shows a registered Open Design artifact, or an exploration's directions side by side, or a fluid master's campaign sheet, to the user inline in the conversation, in hosts that render MCP Apps (Claude Desktop Chat). There the user can switch to Comment mode, click an element and leave a comment, then click \"Ask Claude to apply\", which posts a message here naming the comment ids; export buttons post a request for export_open_design_artifact (the page never downloads). For an exploration, \"Take this one\" posts the user's pick; confirm the next step with them before calling choose_open_design_direction. A style-tile exploration also offers \"Use as design system\", which asks directly for next: \"save-design-system\". With campaign: true (after export_open_design_artifact with campaignSheet: true) it shows every tile of the master's campaign sheet with its errors; \"Fix this piece\" posts the tile and its errors here. Every host also gets a text result (title, path, open comments, or the campaign tiles); hosts without MCP Apps are told to use open_open_design_preview. In Claude Desktop Chat call it after the first register_open_design_artifact of a design: the copy shown then follows later edits and comments by itself, so call it again only for another design or when the user asks to see it again. Pass entryPath, or explorationId for an exploration.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: { type: 'string', description: "Workspace-relative path to the registered artifact's entry file." },
          explorationId: { type: 'string', description: 'An exploration id from prepare_open_design_exploration, to show its directions instead.' },
          campaign: { type: 'boolean', description: "With a fluid master's entryPath: show its last campaign sheet, tile by tile, instead of the design." },
        },
      },
      _meta: previewAppToolMeta(),
    },
    handler: (ctx, args) => tools.showArtifact(ctx, args as { entryPath?: string; explorationId?: string; campaign?: boolean }),
  },
  {
    tool: {
      name: 'show_open_design_examples',
      description:
        "Shows the remixable Open Design examples to the user inline as a gallery of live previews, in hosts that render MCP Apps (Claude Desktop Chat), so they can pick a starting point by eye. \"Remix this\" posts a message here naming the example's skillId; then call remix_open_design_example with it (ask what to make first if the user hasn't said). The page copies nothing itself. Filter with query, mode or surface (a surface id, as list_open_design_skills takes). Only listed to hosts that render MCP Apps; elsewhere use list_open_design_skills with remixableOnly: true.",
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text filter, matched against name, description and triggers.' },
          mode: { type: 'string', enum: SKILL_MODES, description: 'Exact mode filter.' },
          surface: { type: 'string', description: 'A surface id (prototype, slides, poster, …): only that surface\'s examples.' },
        },
      },
      _meta: previewAppToolMeta(),
    },
    handler: (ctx, args) => tools.showExamples(ctx, args as tools.ShowExamplesInput),
    appsHostOnly: true,
    catalogOnly: true,
  },
  {
    tool: {
      name: 'show_open_design_design_systems',
      description:
        "Shows Open Design design systems to the user inline as tiles (palette swatches, fonts, active mark), in hosts that render MCP Apps (Claude Desktop Chat); opening a tile shows its Visualize page. \"Use this design system\" posts a message here naming the id; then call set_active_design_system with it. Pass ids for a shortlist (shown in that order), or query and category to filter. Only listed to hosts that render MCP Apps; elsewhere use list_open_design_design_systems.",
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text filter on id, name, summary and category.' },
          category: { type: 'string', description: 'Exact category filter.' },
          ids: { type: 'array', items: { type: 'string' }, description: 'A shortlist of design system ids; query and category are ignored.' },
        },
      },
      _meta: previewAppToolMeta(),
    },
    handler: (ctx, args) => tools.showDesignSystems(ctx, args as tools.ShowDesignSystemsInput),
    appsHostOnly: true,
    catalogOnly: true,
  },
  {
    tool: {
      name: 'show_open_design_questions',
      description:
        "Asks the user up to four short questions inline as tappable choices, in hosts that render MCP Apps (Claude Desktop Chat), instead of a wall of chat text: surface and design-system questions before a build, a direction pick after an exploration, a \"fix these?\" question after a review. Each question has an id, text and kind (single, multi or text); single and multi take up to eight options (id, label, and optionally imageRef: designSystem:<id>, example:<skillId>, artifact:<entryPath> or checkRun:<entryPath>[#<runId>], never a URL). The view adds a \"You pick\" choice. Send posts one message here starting \"Answers:\" with a line <!-- od-answers {...} -->: read that JSON (question id to option id, option ids, typed text, or \"you-pick\", meaning choose for them). Don't repeat the questions in chat; accept typed answers too. Only listed to hosts that render MCP Apps; if called elsewhere it returns the questions as a numbered list to ask in one message.",
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A short heading, e.g. "A few quick questions".' },
          questions: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'A short key for the answer, e.g. "where".' },
                text: { type: 'string', description: 'The question, in plain words.' },
                kind: { type: 'string', enum: ['single', 'multi', 'text'], description: 'single (default): one choice; multi: any number; text: a short typed answer.' },
                options: {
                  type: 'array',
                  maxItems: 8,
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      label: { type: 'string', description: 'At most 120 characters.' },
                      imageRef: { type: 'string', description: 'designSystem:<id>, example:<skillId>, artifact:<entryPath> or checkRun:<entryPath>[#<runId>].' },
                    },
                    required: ['id', 'label'],
                  },
                },
                default: { description: 'A preselected option id (single), option ids (multi) or text.' },
              },
              required: ['id', 'text'],
            },
          },
        },
        required: ['questions'],
      },
      _meta: previewAppToolMeta(),
    },
    handler: (ctx, args) => tools.showQuestions(ctx, args as { questions?: unknown; title?: unknown }),
    appsHostOnly: true,
    catalogOnly: true,
  },
  {
    tool: {
      name: 'get_open_design_preview_state',
      description:
        'Used by the Open Design preview page only: a view\'s data (the design with its comments and check screenshots, an exploration, a page of examples, design-system tiles, a campaign sheet), one example\'s or design system\'s preview, or a question option\'s picture (imageRef).',
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: { type: 'string' },
          explorationId: { type: 'string' },
          view: { type: 'string', enum: ['examples', 'design-systems', 'campaign'] },
          query: { type: 'string' },
          mode: { type: 'string' },
          surface: { type: 'string' },
          category: { type: 'string' },
          ids: { type: 'array', items: { type: 'string' } },
          cursor: { type: 'string' },
          exampleId: { type: 'string' },
          designSystemId: { type: 'string' },
          imageRef: { type: 'string' },
          revisionOnly: { type: 'boolean', description: "Only the shown design's revision, to tell whether it changed." },
        },
      },
      _meta: appOnlyToolMeta(),
    },
    handler: (ctx, args) => tools.previewAppState(ctx, args as tools.PreviewStateInput),
    appOnly: true,
    // The gallery and the design-system tiles, not a design in the workspace.
    catalogOnly: (args) =>
      args.view === 'examples' ||
      args.view === 'design-systems' ||
      typeof args.exampleId === 'string' ||
      typeof args.designSystemId === 'string' ||
      (typeof args.imageRef === 'string' && /^(designSystem|example):/.test(args.imageRef)),
  },
  {
    tool: {
      name: 'save_open_design_comment',
      description: "Used by the Open Design preview page only: creates or edits one comment (merged by id) or deletes one, in the artifact's comments sidecar.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: { type: 'string' },
          comment: { type: 'object', description: 'The whole comment record to create or edit.' },
          deleteId: { type: 'string', description: 'The id of a comment to delete.' },
        },
        required: ['entryPath'],
      },
      _meta: appOnlyToolMeta(),
    },
    handler: (ctx, args) => tools.saveComment(ctx, args as { entryPath: string; comment?: unknown; deleteId?: string }),
    appOnly: true,
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
          writeProjectDesignMd: {
            type: 'boolean',
            description:
              "Also write the design system as DESIGN.md at the project root, for tools such as Impeccable that read one. Only when the user agrees. Never overwrites: if the project already has a DESIGN.md (root, .agents/context/ or docs/), it is kept unchanged.",
          },
        },
      },
    },
    handler: (ctx, args) => tools.setActiveDesignSystemTool(ctx, args as { designSystemId?: string; writeProjectDesignMd?: boolean }),
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
          sourceUrl: {
            type: 'string',
            description:
              'Optional: a website URL to take a rough starting palette and fonts from, by reading its source. For a design system that matches a site, call extract_open_design_design_system first instead: it renders the page and measures it.',
          },
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
      name: 'extract_open_design_design_system',
      description:
        "Renders a website in an installed Chrome, Edge or Chromium and measures its design system: colour roles from the elements that carry them (page background, cards, text, borders, the primary button and its forced :hover/:active states), declared CSS custom properties, the fonts it loaded, text sizes, radii, spacing, container width and motion. Writes an evidence bundle (evidence.json, screenshots, one crop per role, the logo) under <output folder>/.extract/<site>/ and returns a draft token set on the Open Design token contract, with where each value came from and which tokens nothing measured. Does NOT write DESIGN.md or tokens.css: write both from the draft, keeping measured values as measured (the open-design-design-system-from-url skill has the steps), then save it as a custom design system. Only public http(s) pages; at most 4 pages, 20 seconds each; no logins, cookies or form submissions. A bot check, login wall or empty page comes back as blocked with its screenshot. With no browser installed, falls back to reading the page source and marks the result partial.",
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The page to measure, e.g. the home page.' },
          extraUrls: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
            description: 'Optional: up to 3 more pages on the same site (a product or pricing page) to fill in roles the first page lacks.',
          },
          theme: {
            type: 'string',
            enum: ['light', 'dark', 'both'],
            description: 'Which theme to measure (default light). dark and both measure a dark theme only if the site has one (prefers-color-scheme or a theme attribute on the root element).',
          },
        },
        required: ['url'],
      },
    },
    handler: (ctx, args) => tools.extractDesignSystemFromSite(ctx, args as { url?: string; extraUrls?: string[]; theme?: string }),
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
      name: 'prepare_open_design_component_library',
      description:
        "Composes staged instructions for turning reviewed Open Design artifacts into a reusable component set on a named React library: Material UI themed to Material 3 (`mui`) or shadcn/ui (`shadcn`). Use it when the user asks for components, a component library or a component set from a design (\"make Material 3 components for my React app from this\"); for putting one page into the app, use port_open_design_artifact_to_app instead. Returns a repeated-element inventory to turn into components.md (then stop for the user's approval), a ready theme generated from the design system's tokens, component and gallery rules, and how to record the set. Does NOT write app code. Call it again with `record` after the set builds: that writes metadata.componentLibrary on the artifacts' manifests so a later run updates the same set.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPaths: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 10,
            description: 'Workspace-relative entry paths of 1 to 10 registered artifacts the set is built from.',
          },
          collectionId: { type: 'string', description: 'Instead of entryPaths: every screen of this collection.' },
          library: {
            type: 'string',
            enum: ['auto', 'mui', 'shadcn'],
            description: '"mui" (Material UI, themed to Material 3), "shadcn" (shadcn/ui), or "auto" (default) to pick from the app\'s package.json.',
          },
          outputDir: {
            type: 'string',
            description: "Optional: workspace-relative folder for the components, inside the app. Default: <app>/src/components/<DesignName>, or the folder an earlier record names.",
          },
          record: {
            type: 'object',
            description: 'Stage 5 only: the finished set, written to the artifacts\' manifests instead of returning instructions.',
            properties: {
              library: { type: 'string', enum: ['mui', 'shadcn'] },
              outputDir: { type: 'string' },
              themePath: { type: 'string' },
              components: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    path: { type: 'string' },
                    sourceSelectors: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['name', 'path'],
                },
              },
            },
            required: ['library', 'outputDir', 'themePath', 'components'],
          },
        },
      },
    },
    handler: (ctx, args) =>
      tools.prepareComponentLibrary(ctx, args as { entryPaths?: string[]; collectionId?: string; library?: string; outputDir?: string; record?: unknown }),
  },
  {
    tool: {
      name: 'pull_open_design_figma_frame',
      description:
        "Composes instructions for translating a Figma frame into a real code artifact with 1:1 visual fidelity. When the user's Figma MCP server is connected (checked via list_open_design_integrations), the instructions use Figma's own get_design_context, get_variable_defs and get_screenshot; no token needed. A Figma personal access token is optional: when one is configured, the frame's structural summary and a rendered image are fetched too and included as ground truth, and it's the fallback when Figma isn't connected. Does NOT write any files \u2014 author the entry file yourself with your normal file-editing tools, then call register_open_design_artifact. figmaUrl must be a frame-scoped link (Figma's \"Copy link to selection\", with node-id), not a bare file link.",
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
        "Copies a curated Open Design example artifact (identified by its skillId, which must have remixable: true) into the workspace as a starting point, registers it, and returns instructions to MODIFY the copied file rather than regenerate it from scratch.",
      inputSchema: {
        type: 'object',
        properties: { skillId: { type: 'string', description: "A skillId with remixable: true." } },
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
          embedAssets: {
            type: 'boolean',
            description: "standalone only: download the remote assets the page declares (a 3d-scene spec's assets, or an application/od-assets+json block: HDRIs, textures, glTF models with their files) and embed them in the page, so it works where other sites are blocked (a Claude artifact) or offline. The result lists each embedded asset and the page size; above 16 MB the export fails, naming the largest. An asset that can't be downloaded is reported and left as its URL.",
          },
          maxResolution: {
            type: 'string',
            enum: ['1k', '2k', '4k'],
            description: 'With embedAssets: the highest Poly Haven resolution to fetch for textures and HDRIs (1k, 2k or 4k; default 1k). Models keep the resolution the page uses.',
          },
          preset: {
            type: 'string',
            enum: [...FORMAT_IDS],
            description: "A canvas format id instead of hand-copied sizes. Screen formats (x-image (1600×900), ig-square (1080×1080 per card), ig-portrait (1080×1350), pinterest-pin (1000×1500, 20 MB), story (1080×1920), xhs-card (1080×1440 per card), yt-thumbnail (1280×720), linkedin-image (1200×627), og-image (1200×630), x-header (1500×500), linkedin-banner (1584×396), email-header (600×200, captured at 2×), and display ads banner-mrec (300×250), banner-leaderboard (728×90), banner-skyscraper (160×600), banner-mobile (320×50), and shop images shop-product (2048×2048), shop-banner (1920×800), shop-collection (1920×600)) fill in width/height, selector \"[data-od-card]\" and the platform's byte budget. Print formats (a4, a3, a2, a1, a0, a5, a6, a7, letter, tabloid, poster-18x24, poster-24x36, postcard-4x6, business-card, business-card-us, and cards with rounded corners trading-card, tarot-card, mini-card) produce a print-ready PDF the size of the bleed box, with TrimBox and BleedBox set. Explicit arguments still win. Without preset, the format the artifact was registered with is used.",
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
          dpi: {
            type: 'integer',
            minimum: 150,
            maximum: 600,
            description: "Print images only (PNG or JPEG of a print format): the resolution, 150–600 (default 300). The image is the bleed box at this dpi, and the dpi is written into the file. Can't be combined with scale; over 8192 px a side is refused, naming the largest dpi that fits.",
          },
          printHouse: {
            type: 'string',
            description: "A print-house profile id from list_open_design_print_houses, e.g. \"boardgamesmaker\". Writes each card face at that printer's exact upload size and file type (bleed included, only bleed removed), with -front/-back names and one back per card when the printer asks for it. The design's format must be one the printer takes. Can't be combined with dpi, scale, width/height, presets or selector.",
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
          embedAssets?: boolean;
          maxResolution?: '1k' | '2k' | '4k';
          preset?: string;
          bleed?: number;
          cropMarks?: boolean;
          dpi?: number;
          printHouse?: string;
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
      name: 'find_open_design_3d_assets',
      description:
        "Searches Poly Haven (polyhaven.com) for free CC0 3D assets and returns the direct CDN file URLs a three.js page needs: an HDRI (.hdr, for real environment light and reflections), a PBR texture set (diffuse, normal, roughness, AO/roughness/metal JPGs) or a model (.gltf plus its included files). Use it in 3D designs when procedural shapes and RoomEnvironment aren't enough: a stone floor, a wood table, a sky, a lantern, a chair. Each result has its id, name, categories, size in meters for models, a thumbnail, the file URLs at 1k (default) or 2k, the license (CC0: no attribution needed) and a 'Powered by Poly Haven' credit. Load the files straight from their URLs (the CDN allows it) or download them into the design's assets/ for offline use; for a model, map its includes with a LoadingManager URL modifier. Writes nothing. If Poly Haven can't be reached, it says so: fall back to procedural materials.",
      inputSchema: {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "What to find, in a few words: a material (\"cobblestone\", \"oak floor\"), an object (\"lantern\", \"armchair\") or a sky (\"sunset field\", \"overcast\")."
          },
          "type": {
            "type": "string",
            "enum": [
              "hdri",
              "texture",
              "model"
            ],
            "description": "hdri for environment light and sky, texture for a PBR surface, model for an object."
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10,
            "description": "How many results (default 5)."
          },
          "resolution": {
            "type": "string",
            "enum": [
              "1k",
              "2k"
            ],
            "description": "File resolution (default 1k; 2k only for the hero object)."
          }
        },
        "required": [
          "query",
          "type"
        ]
      },
    },
    handler: (ctx, args) => tools.find3dAssets(ctx, args as unknown as Parameters<typeof tools.find3dAssets>[1]),
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
            enum: ['claude-code', 'claude-desktop', 'codex', 'vscode', 'cursor', 'generic'],
            description: 'Which agent the setup steps are for. Defaults to the agent this server is connected to.',
          },
        },
      },
    },
    handler: (ctx, args) => tools.listIntegrations(ctx, args as tools.ListIntegrationsArgs),
  },
  {
    tool: {
      name: 'list_open_design_print_houses',
      description:
        "Lists the card and sticker printers whose upload sizes the kit knows: each one's id, the formats it takes with the exact pixel size, file type and dpi, how it wants card backs, and the page those sizes came from with the date they were checked. Call it when the user names a printer or says the cards are going to a print house; pass the id as printHouse to export_open_design_artifact. When their printer isn't listed, export print images at 300 dpi and tell them to check the size against the printer's upload page. Read-only.",
      inputSchema: { type: 'object', properties: {} },
    },
    handler: (ctx) => tools.listPrintHouses(ctx),
  },
  {
    tool: {
      name: 'check_open_design_artifact',
      description:
        "Renders a registered Open Design artifact in a headless browser (an installed Chrome, Edge, or Chromium) and returns what it looks like: screenshots attached as images, plus preflight findings (overflow and clipped text, contrast, text overlap, safe area, broken images/fonts, emoji, QR codes, and horizontal-scroll for pages that scroll sideways), taste warnings (slop-glow, card-row, uniform-surface, type-scale, intent: fix them unless the brief or design system asks for that look) and, for pages, accessibility in hover and focus states, tap targets, reflow at 320 px and reduced motion. Leaves the artifact and its manifest alone; saves the run's screenshots under .open-design/.checks/ so the user can see them, before and after, in the browser preview's Checks panel or at the listed paths. Call it after creating or substantially editing an artifact and registering it, before telling the user it's done: fix every ERROR, look at the screenshots for what the checks can't measure (balance, hierarchy, crowded or empty areas, text over busy imagery), then re-check — at most two fix rounds; tell the user about anything left. For a 3D design with a review sheet, a clean check isn't the end: get the critique the result asks for, for up to three critique rounds. What it renders: a page without a [data-od-card] at each viewport (default desktop 1440×900 and mobile 390×844, findings tagged by viewport); a card design (poster, social post) at its registered format size; a deck slide by slide (findings tagged by slide, one contact sheet of up to 12 slides — pass slides to see others). Screenshots are JPEG with a long edge of at most 1568 px; maxImages (default 3, max 6) bounds how many are attached, and 0 returns findings only. Returns a 'no-browser' error when no browser is installed: then skip the check and tell the user once that visual checking needs Chrome, Edge or Chromium. For bulk data rows or shape sheets, use export_open_design_artifact with checkOnly instead. A 3D scene that exposes window.odScene.scene, camera and renderer (the 3d-object ready contract) also gets a review sheet, one image showing the overview, close-up, low-angle and wireframe views (placed second), plus 3D evidence (pixel metrics, renderer statistics) and a webgl-budget warning for scenes too heavy for software rendering; views picks which views go on the sheet, or false for none.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: "Workspace-relative path to the registered artifact's entry file.",
          },
          views: {
            anyOf: [
              { type: 'array', items: { type: 'string', enum: ['overview', 'closeup', 'low', 'wireframe'] }, minItems: 1, maxItems: 4, uniqueItems: true },
              { type: 'boolean', const: false },
            ],
            description: '3D scenes exposing window.odScene.scene/camera/renderer: which review views to put on the sheet (default all four: overview, closeup, low, wireframe), or false for no sheet.',
          },
          states: {
            type: 'boolean',
            description: 'Pages: also force hover and keyboard focus on up to 60 interactive elements (state-contrast, focus-visible), measure tap targets at phone widths (tap-target), render at 320 px wide (reflow) and with reduced motion (reduced-motion). Default true; false for a faster check.',
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
            description: '1–6 target canvas formats. Screen: x-image (1600×900), ig-square (1080×1080 per card), ig-portrait (1080×1350), pinterest-pin (1000×1500, 20 MB), story (1080×1920), xhs-card (1080×1440 per card), yt-thumbnail (1280×720), linkedin-image (1200×627), og-image (1200×630), x-header (1500×500), linkedin-banner (1584×396), email-header (600×200, captured at 2×), and display ads banner-mrec (300×250), banner-leaderboard (728×90), banner-skyscraper (160×600), banner-mobile (320×50), and shop images shop-product (2048×2048), shop-banner (1920×800), shop-collection (1920×600). Print: a4, a3, a2, a1, a0, a5, a6, a7, letter, tabloid, poster-18x24, poster-24x36, postcard-4x6, business-card, business-card-us, and cards with rounded corners trading-card, tarot-card, mini-card.',
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
        "Publishes a registered Open Design artifact as a live web page, so the user can share a link with teammates or stakeholders. Use when the user asks to share, publish, deploy, host or \"get a link\" for a design. (For a single file to attach or send, use export_open_design_artifact with format \"standalone\" instead.) It builds a deploy-ready folder (exports/site/) locally, then returns step-by-step instructions for publishing it with the host's own CLI from your terminal, under the user's own login or a temporary no-account link: netlify-temporary or cloudflare-temporary (no account, about 60 minutes unless claimed), or netlify, vercel, cloudflare-pages or github-pages (the user's own account). It never deploys anything itself and never handles tokens. Without provider, the instructions ask the user to choose. The instructions require the user's explicit yes before anything goes online. With provider claude-artifact (only if you have an Artifact tool: Claude Code or Claude Desktop), it writes the standalone file instead, checks it against the artifact viewer's limits, and returns instructions to publish that file by path with your Artifact tool; the artifact stays private until the user shares it, so there is no confirmation step. After a successful deploy or publish, call this tool again with published: { provider, url, claimUrl?, expiresAt?, siteRef? } to record the link, so the next publish updates the same site or artifact. With claude-artifact, sync: true also carries the design's working files in the page, so it can be restored elsewhere with restore_open_design_artifact; turn it on only after the user agrees.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: "Workspace-relative path to the registered artifact's entry file.",
          },
          provider: {
            type: 'string',
            enum: ['netlify-temporary', 'cloudflare-temporary', 'netlify', 'vercel', 'cloudflare-pages', 'github-pages', 'claude-artifact'],
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
          sync: {
            type: 'boolean',
            description: "claude-artifact only: carry the design's working files (entry, manifest, comments, supporting files, a custom design system's DESIGN.md) in the page, so restore_open_design_artifact can pick the design up on another device or session. Anyone the artifact is shared with can read them. Stored in the manifest: omit it to keep the stored setting, false turns it off. Only with the user's agreement.",
          },
          published: {
            type: 'object',
            description: 'Record mode: what the deploy reported. Doesn\'t rebuild anything.',
            properties: {
              provider: { type: 'string', enum: ['netlify-temporary', 'cloudflare-temporary', 'netlify', 'vercel', 'cloudflare-pages', 'github-pages', 'claude-artifact'] },
              url: { type: 'string', description: 'The public https link, or the https://claude.ai/... artifact link.' },
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
          sync?: boolean;
        },
      ),
  },
  {
    tool: {
      name: 'restore_open_design_artifact',
      description:
        "Restores an Open Design design from a synced Claude artifact (one published with publish_open_design_artifact, provider claude-artifact and sync: true) into this workspace, so it can be edited and republished here. Use when the user gives a Claude artifact link to pick a design back up on another device or in a new session. First read the artifact with your Artifact tool, which saves the page to a file; pass that file's path (in Claude Desktop with a folder, a path in the connected folder) and the artifact link. It writes the design's files under the output directory, all or nothing, refuses paths that leave it, and doesn't overwrite local files that differ unless overwrite is true. It records the link, so the next preview publish updates the same artifact. Never makes a network request.",
      inputSchema: {
        type: 'object',
        properties: {
          pagePath: {
            type: 'string',
            description: 'Path of the page your Artifact tool saved when reading the artifact: absolute, or relative to the workspace.',
          },
          artifactUrl: {
            type: 'string',
            description: "The artifact's https://claude.ai/... link.",
          },
          overwrite: {
            type: 'boolean',
            description: "Replace local files whose content differs from the artifact's. Default false: the restore then writes nothing and lists them. Only after the user chooses the artifact's version.",
          },
        },
        required: ['pagePath', 'artifactUrl'],
      },
    },
    handler: (ctx, args) => tools.restoreArtifact(ctx, args as { pagePath: string; artifactUrl: string; overwrite?: boolean }),
  },
  {
    tool: {
      name: 'publish_open_design_artifact_to_canva',
      description: "Gets a finished Open Design artifact into Canva. Called with entryPath alone, it composes instructions and writes nothing. The instructions have you export the artifact (PDF, or PPTX for a deck), check whether the user's Canva MCP server is connected (via list_open_design_integrations), and then: when Canva is connected, let the user choose between an editable import (the export is hosted briefly on a public link with publish_open_design_artifact, then Canva's import-design-from-url converts it into a design, optionally published as a Brand Template after their yes) and a private upload into their Canva Uploads; when it isn't, offer setup once and otherwise give them Canva's manual Import a file steps. For the private upload, call it again with filePath (the export) and uploadUrl (from Canva's create-upload-url): the server then POSTs the file's bytes to that canva.com URL from the machine the file is on, so no terminal is needed, and returns the fileId. Use when the user wants an artifact in Canva, as a Canva design or a Canva template.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: 'The workspace-relative path of the artifact to get into Canva (as passed to register_open_design_artifact).',
          },
          filePath: {
            type: 'string',
            description: "The exported file to upload (route B), workspace-relative as export_open_design_artifact returned it; must be in the artifact's exports/ folder. Pass with uploadUrl.",
          },
          uploadUrl: {
            type: 'string',
            description: "The single-use upload URL from Canva's create-upload-url (https, canva.com). With filePath, the server uploads the file there instead of returning instructions.",
          },
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) => tools.publishToCanva(ctx, args as { entryPath: string; filePath?: string; uploadUrl?: string }),
  },
  {
    tool: {
      name: 'publish_open_design_artifact_to_shop',
      description:
        "Gets finished shop designs into the user's online shop: the product images (and any other design filled per product) from the product list. For shop \"shopify\" it composes instructions and writes nothing: check whether Shopify's connector is connected (via list_open_design_integrations and your own tools), and if it is, show the product matches first, make the first three updates one at a time with the user's go-ahead, create new products only as drafts, leave price, stock and visibility alone unless asked, attach images only if a connector tool can, and report what changed per product. Otherwise, and for bigcartel, etsy and other shops, it exports each design once per product and writes <design folder>/for-<shop>/: images named <product>-1.png, <product>-2.png…, copy.md with each product's title, price and description, and for Shopify a products.csv in Shopify's import format (unpublished, image links empty), plus the shop's own upload steps to pass on. Cost, margin, supplier, stock and note columns are never used. This tool never contacts the shop.",
      inputSchema: {
        "type": "object",
        "properties": {
          "entryPaths": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 1,
            "description": "Workspace-relative entry files of the registered designs to put in the shop, each with [data-od-field] fields filled per product (e.g. the product image, then a second angle). Their images become <product>-1, <product>-2… in that order."
          },
          "shop": {
            "type": "string",
            "enum": [
              "shopify",
              "bigcartel",
              "etsy",
              "other"
            ],
            "description": "Where the user sells."
          },
          "data": {
            "type": "string",
            "description": "Workspace-relative product list (CSV, XLSX or JSON array), one row per product: the same list the designs were exported with. Needed for the folder."
          },
          "nameField": {
            "type": "string",
            "description": "The column holding each product's title. Default: a title, name or product column."
          },
          "folder": {
            "type": "boolean",
            "description": "Shopify only: write the hand-off folder now instead of the connector instructions (when the connector isn't connected, the user declined it, or it can't attach images). Other shops always get the folder."
          }
        },
        "required": [
          "entryPaths",
          "shop"
        ]
      },
    },
    handler: (ctx, args) => tools.publishToShop(ctx, args as unknown as Parameters<typeof tools.publishToShop>[1]),
  },
  {
    tool: {
      name: 'push_open_design_artifact_to_figma',
      description: "Pushes a finished Open Design artifact into Figma as editable layers through the user's Figma MCP server. Renders the artifact in a headless browser and captures its layers (or reuses a capture newer than the file), then writes ready-to-run code parts and image files under the artifact's exports/figma/ and returns instructions: check Figma is connected (list_open_design_integrations), ask the user whether to add to an existing Figma file (a link) or create a new one, load Figma's figma-use guidance, run each part with Figma's use_figma exactly as written, upload the images with upload_assets, then verify with get_screenshot and share the link. Never contacts Figma itself. When Figma isn't connected, the instructions offer setup and otherwise give the OD Figma Import plugin steps. Use when the user wants a design in Figma (\"push this to Figma\", \"get this into Figma\", \"hand this off to design\").",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: "The workspace-relative path of the artifact's entry file (as passed to register_open_design_artifact).",
          },
          refresh: { type: 'boolean', description: "Re-capture the artifact even when a capture newer than the file exists (for example after changing assets the capture can't see)." },
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) => tools.pushToFigma(ctx, args as { entryPath: string; refresh?: boolean }),
  },
  {
    tool: {
      name: 'start_open_design_job_run',
      description:
        "Starts one run of a recurring Open Design job: a job file at .open-design/jobs/<id>.job.md (YAML frontmatter naming the recipe, period, timezone, mode, target and outputs, then the brief). Call it first whenever a prompt says \"Run the Open Design job <path>\" (usually a scheduled task), or for the supervised first run after writing a job. It validates the job (listing every problem by field), works out the period key in the job's timezone (2026-10-21, 2026-W43 or 2026-10), and returns skip with a reason when this period already has a completed run and the sources haven't changed: then report that in one line and change nothing. Otherwise it records a started run and returns its runId, the target entry's state (exists, staleSources, the preview link), the run's capabilities (browser, cloud) and the ordered steps to follow, ending with finish_open_design_job_run. In a cloud session it first asks you to check out the job's state branch. Runs stay private: never publish publicly or post to social networks from a job run.",
      inputSchema: {
        type: 'object',
        properties: {
          jobPath: { type: 'string', description: 'Workspace-relative path of the job file, e.g. ".open-design/jobs/weekly-kpis.job.md".' },
          runNow: { type: 'boolean', description: "Rebuild even though this period already has a completed run (the person asked for a fresh run). Don't set it from a scheduled prompt." },
        },
        required: ['jobPath'],
      },
    },
    handler: (ctx, args) => tools.startJobRun(ctx, args as { jobPath: string; runNow?: boolean }),
  },
  {
    tool: {
      name: 'finish_open_design_job_run',
      description:
        "Finishes a recurring-job run started with start_open_design_job_run. It runs checks that need no browser on the target entry (missing local files, empty data-od-field elements, leftover placeholder text such as {{, TODO or Lorem ipsum, numbers found in no source, and the artifact viewer's size limits for the preview), settles the status (completed only without check errors; needs-review when the job has checks: required and the run had no browser), records outputs not made with their reasons (captures without a browser as skipped: no-browser), writes the run record to the job's run log, and returns a one-paragraph summary plus the remaining steps (commit or push the state branch, a PR, connector deliveries only for a completed run). Refuses, writing nothing, when runId isn't a started run of this job.",
      inputSchema: {
        type: 'object',
        properties: {
          jobPath: { type: 'string', description: 'The same job path passed to start_open_design_job_run.' },
          runId: { type: 'string', description: 'The runId start_open_design_job_run returned.' },
          status: { type: 'string', enum: ['completed', 'needs-review', 'failed'], description: 'completed when the design is done, needs-review when a person should look first, failed when it could not be made (e.g. a data pull failed).' },
          outputs: {
            type: 'object',
            properties: {
              written: { type: 'array', items: { type: 'string' }, description: 'Workspace paths this run wrote: the entry, exports, snapshots.' },
              notMade: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    output: { type: 'string', description: 'The output, e.g. "pdf" or "preview".' },
                    reason: { type: 'string', description: 'Why, e.g. "no-browser", "no-artifact-tool", or a short sentence.' },
                  },
                  required: ['output', 'reason'],
                },
                description: 'Outputs the job asks for that this run did not make.',
              },
            },
          },
          notes: { type: 'string', description: 'A sentence or two for the run record and summary: choices made without the person, anything odd.' },
        },
        required: ['jobPath', 'runId', 'status'],
      },
    },
    handler: (ctx, args) => tools.finishJobRun(ctx, args as unknown as Parameters<typeof tools.finishJobRun>[1]),
  },
  {
    // main() handles this one itself: it replaces the server's context
    // instead of acting within it.
    tool: {
      name: 'set_open_design_workspace',
      description:
        "Sets the folder Open Design works in for the rest of this session: where designs, manifests and .open-design/config.json are written, and what every workspace-relative path in other tools' results is relative to. Call it once, before any other Open Design tool, when this server can't know the user's folder on its own — in Claude Desktop chats with a connected folder it starts in the user's home folder. Pass the folder's absolute path on the machine this server runs on (in Claude Desktop, the path get_device_info lists under connectedFolders), not the path your own file tools see it under. Afterwards, join the workspace-relative paths other tools return onto your own path for that folder when you read or write files. Not needed in Claude Code, Codex or VS Code, which start the server in the project.",
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: "Absolute path of the user's folder on the machine this server runs on." },
        },
        required: ['path'],
      },
    },
    handler: async () => {
      throw new Error('handled by the server itself');
    },
  },
  {
    // main() handles this one too, and lists it only in a chat with no folder.
    tool: {
      name: 'use_open_design_managed_workspace',
      description:
        "For a Claude Desktop chat with NO connected folder only, where your own file tools (if any) can't reach this server's files: creates, or reopens, a folder this server keeps for the design (under ~/Open Design/ unless configured otherwise) and makes it the workspace for the rest of the session. Call it once, before other Open Design tools, then save every design file with write_open_design_file instead of your own file tools. Tell the user the folder's absolute path from the result, so they can open it. Pass the same name in a later chat to continue the same design. If the chat has a connected folder, call set_open_design_workspace instead.",
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'A short name for the design or project, e.g. "Coffee poster". The folder is named after it.' },
        },
        required: ['name'],
      },
    },
    handler: async () => {
      throw new Error('handled by the server itself');
    },
  },
  {
    tool: {
      name: 'write_open_design_file',
      description:
        "Saves one design file you wrote into the folder use_open_design_managed_workspace opened, exactly as given, and returns its path, size and SHA-256. Only works in that folder: anywhere else, write files with your own file-editing tools. Pass the whole file each time (to edit, send the full new version). path is workspace-relative and must be under the output directory, e.g. \".open-design/coffee-poster/coffee-poster.html\". Allowed: .html .htm .css .js .mjs .json .svg .md .txt .csv as text, and .png .jpg .jpeg .webp .gif .woff .woff2 as base64 with encoding \"base64\"; at most 5 MiB. Manifests, comments, config.json, exports/ and check screenshots belong to other tools and are refused. Never deletes or moves anything. After writing an entry file, call register_open_design_artifact as usual.",
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative path under the output directory, e.g. ".open-design/coffee-poster/coffee-poster.html".' },
          content: { type: 'string', description: 'The whole file: text, or base64 for images and fonts.' },
          encoding: { type: 'string', enum: ['base64'], description: 'Set to "base64" for images and fonts. Leave out for text.' },
        },
        required: ['path', 'content'],
      },
    },
    handler: (ctx, args) => tools.writeDesignFile(ctx, args),
    managedOnly: true,
  },
];

// Read at build time: esbuild inlines the JSON, so serverInfo carries the release version.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SERVER_VERSION: string = require('../package.json').version;

const FOLDERLESS_TOOLS = new Set([MANAGED_WORKSPACE_TOOL, WRITE_FILE_TOOL]);

function buildContext(workspaceRoot: string, options: { managed?: boolean; layout?: WorkspaceLayout; managedDesignSlug?: string } = {}): ToolContext {
  const { layout, designsDir: outputDir } = options.layout ?? { layout: 'classic' as const, designsDir: getOutputDirectory() };
  const assetsRoot = getAssetsRoot();
  const contentIndex = new ContentIndex(assetsRoot, () => path.join(workspaceRoot, outputDir, 'design-systems'));
  const store = createFileActiveDesignSystemStore(workspaceRoot);
  return { contentIndex, store, workspaceRoot, outputDir, layout, assetsRoot, figmaToken: getFigmaToken(), managedWorkspace: options.managed === true, managedDesignSlug: options.managedDesignSlug };
}

/** Where a design lives, for a reply the agent can pass on: the folder's absolute path. */
function designsFolderText(ctx: ToolContext): string {
  return path.resolve(ctx.workspaceRoot, ctx.outputDir);
}

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) };
}

async function main(): Promise<void> {
  const desktopExtension = isDesktopExtension();
  // Folder rules follow the Claude Desktop extension for the ChatGPT desktop plugin too; the lock below stays the extension's own.
  const folderlessAppHost = isFolderlessAppHost();
  const pluginLaunched = isPluginLaunched();
  const lockPath = extensionLockPath();
  if (desktopExtension) holdExtensionLock(lockPath, SERVER_VERSION);

  const initial = initialWorkspace({ override: getWorkspaceRootOverride(), defaultWorkspace: getDefaultWorkspace(), cwd: process.cwd() });
  let ctx = buildContext(initial.root);
  let source: WorkspaceSource = initial.source;
  let hadRoots = false;

  const server = new Server(
    { name: 'open-design', version: SERVER_VERSION },
    { capabilities: { tools: { listChanged: true }, prompts: {}, resources: {} } },
  );
  const rendersMcpApps = (): boolean => clientSupportsMcpApps(server.getClientCapabilities());
  const deferred = (): boolean =>
    shouldDeferToExtension({ pluginLaunched, clientName: server.getClientVersion()?.name, lockIsLive: pluginLaunched && readLiveExtensionLock(lockPath) !== undefined });
  // The managed-workspace tools are for a Claude Desktop chat with no folder (openspec add-folderless-chat-support).
  const folderless = (): boolean => hasNoFolderOfItsOwn({ override: getWorkspaceRootOverride(), hadRoots, cwd: process.cwd(), desktopExtension: folderlessAppHost });

  // Workspace root precedence (workspace.ts): an agent-set folder, then
  // OPEN_DESIGN_WORKSPACE_ROOT, then the client's MCP roots, then
  // OPEN_DESIGN_DEFAULT_WORKSPACE, then the cwd. Requests wait for the first
  // roots lookup so nothing is written before it's known.
  const syncRootsFromClient = async (): Promise<void> => {
    if (!rootsMayReplace(source) || !server.getClientCapabilities()?.roots) return;
    try {
      const root = workspaceRootFromClientRoots((await server.listRoots()).roots);
      if (!root) return;
      hadRoots = true;
      if (root !== ctx.workspaceRoot || source !== 'roots') {
        ctx = buildContext(root);
        source = 'roots';
      }
    } catch {
      // A client that advertises roots but fails the request keeps the current root.
    }
  };
  let rootsReady: Promise<void> = Promise.resolve();
  server.oninitialized = () => {
    rootsReady = syncRootsFromClient();
    // Hand the tools to the desktop extension while it runs, and take them back when it stops.
    if (pluginLaunched) {
      watchExtensionLock(lockPath, () => {
        if (server.getClientVersion()?.name === 'claude-code') return;
        server.sendToolListChanged().catch(() => undefined);
      });
    }
  };
  server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    rootsReady = syncRootsFromClient();
  });

  // App-only tools go only to hosts that render MCP Apps: those keep them out of
  // the model's list by their `visibility`; any other host would show them to it.
  // The picker tools likewise: elsewhere list_open_design_skills and list_open_design_design_systems cover them.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    await rootsReady;
    if (deferred()) return { tools: [] };
    const showFolderless = folderless();
    return {
      tools: TOOL_DEFS.filter((d) => (!(d.appOnly || d.appsHostOnly) || rendersMcpApps()) && (showFolderless || !FOLDERLESS_TOOLS.has(d.tool.name))).map((d) => ({ ...d.tool, annotations: TOOL_ANNOTATIONS[d.tool.name] })),
    };
  });

  // The preview MCP App's page (openspec add-mcp-app-preview).
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [{ uri: PREVIEW_APP_URI, name: 'Open Design preview', description: 'Shows an Open Design artifact inline, with comments, the example, design-system and campaign pickers, and questions as tappable choices.', mimeType: MCP_APP_MIME_TYPE }],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== PREVIEW_APP_URI) throw new Error(`Unknown resource: ${request.params.uri}`);
    const { html, resourceDomains } = await tools.previewAppResource(ctx);
    return {
      contents: [{ uri: PREVIEW_APP_URI, mimeType: MCP_APP_MIME_TYPE, text: html, _meta: { ui: { csp: { resourceDomains, connectDomains: [] }, prefersBorder: true } } }],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    await rootsReady;
    const name = request.params.name;
    if (deferred()) return textResult(DEFERRED_TO_EXTENSION_MESSAGE, true);
    if (name === SET_WORKSPACE_TOOL) {
      try {
        const root = workspaceRootFromArg(request.params.arguments?.path);
        ctx = buildContext(root, { layout: await desktopLayout(root, false) });
        source = 'agent';
        const where =
          ctx.layout === 'visible'
            ? `Designs go in the visible folder ${designsFolderText(ctx)} (${ctx.outputDir}/<design>/ in workspace paths), one folder per design, with saved PDFs and images beside each design. Tell the user once, in one sentence, that their designs will be saved in the "${ctx.outputDir}" folder inside the folder they connected.`
            : `Designs go under ${ctx.outputDir}/ there, as they already do in this folder.`;
        return textResult(`Open Design now works in ${root}. ${where} The paths other tools return are relative to ${root}.`);
      } catch (err) {
        return textResult(`Tool "${SET_WORKSPACE_TOOL}" failed: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
    if (name === MANAGED_WORKSPACE_TOOL) {
      if (!folderless()) {
        return textResult(`Tool "${MANAGED_WORKSPACE_TOOL}" is only for a chat with no folder. This server already has one (${ctx.workspaceRoot}); write design files with your own file tools there, or call ${SET_WORKSPACE_TOOL} for another folder.`, true);
      }
      try {
        const opened = await openManagedWorkspace(request.params.arguments?.name);
        const layout = opened.legacy ? { layout: 'classic' as const, designsDir: '.open-design' } : await desktopLayout(opened.root, true);
        ctx = buildContext(opened.root, { managed: true, layout, managedDesignSlug: opened.legacy ? undefined : opened.slug });
        source = 'managed';
        const state = opened.created ? 'a new folder' : 'reopened, with its existing files';
        if (opened.legacy) {
          return textResult(
            `Open Design now works in ${opened.root} (${state}, made by an earlier version, so it keeps its layout). Tell the user this path once so they can open it. Save every design file with ${WRITE_FILE_TOOL}, using paths under ${ctx.outputDir}/ (for example ${ctx.outputDir}/${opened.slug}/${opened.slug}.html), then register, check, show and export it as usual. Show it with show_open_design_artifact; exports land in this folder too, so give the user their absolute paths.`,
          );
        }
        return textResult(
          `This design's folder is ${opened.designFolder} (${state}). Tell the user this path once, in one sentence, so they can open it. Save every file of this design with ${WRITE_FILE_TOOL} under ${opened.slug}/ (for example ${opened.slug}/${opened.slug}.html; workspace paths are relative to ${opened.root}, where every design gets its own folder), then register, check, show and export it as usual. Show it with show_open_design_artifact. Saved PDFs and images land beside the design, named like ${opened.slug}-A4.pdf.`,
        );
      } catch (err) {
        return textResult(`Tool "${MANAGED_WORKSPACE_TOOL}" failed: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
    const def = TOOL_DEFS.find((d) => d.tool.name === name);
    if (!def) return textResult(`Unknown tool: ${name}`, true);
    if (def.managedOnly && source !== 'managed') {
      return textResult(
        `Tool "${name}" only writes into a folder opened with ${MANAGED_WORKSPACE_TOOL}, for chats with no folder. This workspace (${ctx.workspaceRoot}) is one your own file tools can reach: write the file with them, then call register_open_design_artifact. Nothing was written.`,
        true,
      );
    }
    const args = (request.params.arguments as Record<string, unknown>) ?? {};
    const catalogOnly = typeof def.catalogOnly === 'function' ? def.catalogOnly(args) : def.catalogOnly === true;
    if (!catalogOnly && needsFolderFromAgent({ root: ctx.workspaceRoot, source, desktopExtension: folderlessAppHost })) {
      return textResult(workspaceGuardMessage({ root: ctx.workspaceRoot, source, toolName: name, managedToolListed: folderless(), managedRoot: getManagedRoot() }), true);
    }
    try {
      const callCtx = { ...ctx, figmaToken: getFigmaToken(), clientName: server.getClientVersion()?.name, rendersMcpApps: rendersMcpApps() };
      const out = await def.handler(callCtx, args);
      const structuredContent = typeof out === 'string' ? undefined : out.structuredContent;
      return { content: tools.toCallToolContent(out), ...(structuredContent ? { structuredContent } : {}) };
    } catch (err) {
      return textResult(`Tool "${name}" failed: ${err instanceof Error ? err.message : String(err)}`, true);
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
