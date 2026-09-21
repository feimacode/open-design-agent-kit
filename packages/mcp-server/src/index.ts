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
import { getAssetsRoot, getOutputDirectory, getWorkspaceRoot } from './env';
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
        "Lists available OpenDesign skills, design templates, and remixable examples — reusable design-task recipes, rendering styles, and (for 'example' entries) actual starting artifacts bundled with this server. Each result's id is namespaced as 'od:<mode>:<name>' (e.g. 'od:deck:guizang-ppt') — pass this full id as skillId to prepare_open_design_brief or remix_open_design_example. Each result's 'source' field is 'skill', 'design-template', or 'example'. Some results include an 'examplePrompt' — prefer it (or lightly adapt it) over inventing your own brief when it closely fits. A result with a non-empty 'exampleArtifactPath' has an actual rendered starting artifact — prefer remix_open_design_example over prepare_open_design_brief for those. Optionally filter by a free-text query, an exact mode, an exact source, and/or remixableOnly to see only entries with a rendered starting artifact.",
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
        "Lists available OpenDesign design systems — brand-inspired visual token sets (palette, typography, spacing, component rules), each with a 'category' and an 'active' flag marking the current active design system, if any. Optionally filter by a free-text query and/or an exact category.",
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
        "Composes generation instructions for an OpenDesign artifact by combining the chosen skill's workflow, an optional design system's visual tokens, universal craft rules, and the user's brief. Returns an 'instructions' string you must follow, plus a 'suggestedEntryPath'. Does NOT write any files — after calling it, author the entry file (and any supporting files) yourself with your normal file-editing tools, then call register_open_design_artifact.",
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
        },
        required: ['skillId', 'brief'],
      },
    },
    handler: (ctx, args) => tools.prepareBrief(ctx, args as { skillId: string; designSystemId?: string; brief: string }),
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
        },
        required: ['entryPath', 'kind', 'title'],
      },
    },
    handler: (ctx, args) =>
      tools.registerArtifact(
        ctx,
        args as { entryPath: string; kind: string; title: string; supportingFiles?: string[]; sourceSkillId?: string; designSystemId?: string },
      ),
  },
  {
    tool: {
      name: 'get_open_design_artifact',
      description:
        "Reads back a registered OpenDesign artifact: its manifest, entry file content, supporting file list, and any open comments. This host has no comment-authoring UI, so 'openComments' will normally be empty.",
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
        'Sets (or clears, if designSystemId is omitted/empty) the active OpenDesign design system, persisted for this workspace. Used automatically by prepare_open_design_brief whenever called without an explicit designSystemId.',
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
        'Composes instructions for authoring a brand-new, custom design system as a DESIGN.md file in the workspace. Does NOT write any files. If sourceUrl is given, performs a best-effort extraction of candidate colors/fonts from that page. After writing the file, call set_active_design_system with the returned id.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'A short name for the design system.' },
          brief: { type: 'string', description: "A description of the brand, in the user's own words." },
          sourceUrl: { type: 'string', description: 'Optional: a website URL to extract a starting palette/fonts from.' },
        },
        required: ['name', 'brief'],
      },
    },
    handler: (ctx, args) => tools.createCustomDesignSystem(ctx, args as { name: string; brief: string; sourceUrl?: string }),
  },
  {
    tool: {
      name: 'port_open_design_artifact_to_app',
      description:
        "Composes instructions for porting a finished OpenDesign artifact's design into this workspace's actual, existing application as real, idiomatic production code. Does NOT write any files. Directs the model to ground the port in a real existing component and explicitly excludes routing/navigation wiring.",
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
      name: 'remix_open_design_example',
      description:
        "Copies a curated OpenDesign example artifact (identified by its skillId, which must have a non-empty 'exampleArtifactPath') into the workspace as a starting point, registers it, and returns instructions to MODIFY the copied file rather than regenerate it from scratch.",
      inputSchema: {
        type: 'object',
        properties: { skillId: { type: 'string', description: "A skillId whose 'exampleArtifactPath' is non-empty." } },
        required: ['skillId'],
      },
    },
    handler: (ctx, args) => tools.remixExample(ctx, args as { skillId: string }),
  },
];

function buildContext(): ToolContext {
  const workspaceRoot = getWorkspaceRoot();
  const outputDir = getOutputDirectory();
  const assetsRoot = getAssetsRoot();
  const contentIndex = new ContentIndex(assetsRoot, () => `${workspaceRoot}/${outputDir}/design-systems`);
  const store = createFileActiveDesignSystemStore(workspaceRoot);
  return { contentIndex, store, workspaceRoot, outputDir, assetsRoot };
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
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const prompts = await tools.listRemixablePrompts(ctx);
    return { prompts: prompts.map((p) => ({ name: p.name, description: `${p.displayName} (OpenDesign remixable example)` })) };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const prompts = await tools.listRemixablePrompts(ctx);
    const prompt = prompts.find((p) => p.name === request.params.name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${request.params.name}`);
    }
    return {
      description: `${prompt.displayName} (OpenDesign remixable example)`,
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
