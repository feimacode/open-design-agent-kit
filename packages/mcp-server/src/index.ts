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
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ContentIndex } from '@feimacode/open-design-agent-kit-core';
import { getAssetsRoot, getFigmaToken, getOutputDirectory, getWorkspaceRoot } from './env';
import { createFileActiveDesignSystemStore } from './store';
import * as tools from './tools';
import type { ToolContext } from './tools';

interface ToolDef {
  tool: Tool;
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<string>;
}

const TOOL_DEFS: ToolDef[] = [
  {
    tool: {
      name: 'list_open_design_skills',
      description:
        "Lists available Open Design skills, design templates, and remixable examples — reusable design-task recipes, rendering styles, and (for 'example' entries) actual starting artifacts bundled with this server. Each result's id is namespaced as 'od:<mode>:<name>' (e.g. 'od:deck:guizang-ppt') — pass this full id as skillId to prepare_open_design_brief or remix_open_design_example. Each result's 'source' field is 'skill', 'design-template', or 'example'. Some results include an 'examplePrompt' — prefer it (or lightly adapt it) over inventing your own brief when it closely fits. A result with a non-empty 'exampleArtifactPath' has an actual rendered starting artifact — prefer remix_open_design_example over prepare_open_design_brief for those. Optionally filter by a free-text query, an exact mode, an exact source, and/or remixableOnly to see only entries with a rendered starting artifact. If a query returns few or no results, call this tool again with a broader query or no arguments at all to browse the full catalog — do NOT search the filesystem, grep, or read any file (this catalog is not stored anywhere as a single readable file such as a content.json, index, or schema file; it exists only inside this server's own runtime and is reachable exclusively through this tool).",
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
          remixableOnly: {
            type: 'boolean',
            description: 'Optional: when true, only return entries with a non-empty exampleArtifactPath (i.e. an actual rendered starting artifact to remix).',
          },
        },
      },
    },
    handler: (ctx, args) =>
      tools.listSkills(ctx, args as { query?: string; mode?: string; source?: string; remixableOnly?: boolean }).then((r) => JSON.stringify(r, null, 2)),
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
        },
        required: ['skillId', 'brief'],
      },
    },
    handler: (ctx, args) =>
      tools.prepareBrief(
        ctx,
        args as { skillId: string; designSystemId?: string; brief: string; collectionId?: string; collectionName?: string; screenRole?: string; screenTotal?: number },
      ),
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
        "Renders a registered Open Design artifact in a headless browser (an installed Chrome, Edge, or Chromium) and writes upload-ready file(s) under the artifact's own exports/ folder. Does not modify the artifact's source files. IMAGES (png/jpeg): use after register_open_design_artifact whenever the user wants an image to post (X, Instagram, Xiaohongshu, a YouTube thumbnail, a poster). Size comes from explicit width/height, else the source skill's aspect hint, else each selected element's box, else 1080×1080. For multi-card designs mark each card with data-od-card and pass selector \"[data-od-card]\" for one numbered image per card. Pass maxBytes with the platform's upload limit (X 5000000, YouTube thumbnail 2000000, Instagram 8000000) and images are re-encoded as JPEG until they fit. DECKS: format \"pptx\" gives a PowerPoint file with one full-bleed slide image per slide (pixel-perfect, not editable text); format \"pdf\" gives one page per slide. Slides are captured at the deck's own measured slide size, at scale 2 by default. Artifacts registered with kind \"deck\" (or made from an od:deck:* skill) are detected automatically; pass deck: true if a deck was registered as \"html\". Pass slides (1-based numbers) with format png/jpeg to export just those slides as images. PAGES: format \"pdf\" on an ordinary page prints it with the browser's print engine (vector, selectable text, A4 unless the page's CSS sets a size). Not for video — HyperFrames videos are rendered with the HyperFrames CLI per the brief's instructions.",
      inputSchema: {
        type: 'object',
        properties: {
          entryPath: {
            type: 'string',
            description: "Workspace-relative path to the registered artifact's entry file.",
          },
          format: {
            type: 'string',
            enum: ['png', 'jpeg', 'pdf', 'pptx'],
            description: 'Output format. png/jpeg: images; pdf: deck slides or a printed page; pptx: decks only. Default png.',
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
        },
        required: ['entryPath'],
      },
    },
    handler: (ctx, args) =>
      tools.exportArtifact(
        ctx,
        args as {
          entryPath: string;
          format?: 'png' | 'jpeg' | 'pdf' | 'pptx';
          quality?: number;
          width?: number;
          height?: number;
          scale?: number;
          selector?: string;
          maxBytes?: number;
          deck?: boolean;
          slides?: number[];
        },
      ),
  },
];

function buildContext(): ToolContext {
  const workspaceRoot = getWorkspaceRoot();
  const outputDir = getOutputDirectory();
  const assetsRoot = getAssetsRoot();
  const contentIndex = new ContentIndex(assetsRoot, () => `${workspaceRoot}/${outputDir}/design-systems`);
  const store = createFileActiveDesignSystemStore(workspaceRoot);
  return { contentIndex, store, workspaceRoot, outputDir, assetsRoot, figmaToken: getFigmaToken() };
}

async function main(): Promise<void> {
  const ctx = buildContext();
  const server = new Server({ name: 'open-design', version: '0.1.0' }, { capabilities: { tools: {}, prompts: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS.map((d) => d.tool) }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const def = TOOL_DEFS.find((d) => d.tool.name === request.params.name);
    if (!def) {
      return { content: [{ type: 'text' as const, text: `Unknown tool: ${request.params.name}` }], isError: true };
    }
    try {
      const text = await def.handler(ctx, (request.params.arguments as Record<string, unknown>) ?? {});
      return { content: [{ type: 'text' as const, text }] };
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
