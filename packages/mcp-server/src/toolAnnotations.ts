import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

// MCP tool annotations for every tool (openspec inline-preview-in-place, "Tool
// Annotations"): hints a host uses to decide how much to ask before a call.
// Every listed tool must have an entry; a unit test checks it.

/** Only reads, or returns text such as instructions: changes nothing. */
const READS: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
/** Reads, and looks things up outside this machine. */
const READS_ONLINE: ToolAnnotations = { readOnlyHint: true, openWorldHint: true };
/** Writes in the workspace (or the session's settings), adding or updating its own files. */
const WRITES: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
/** Writes in the workspace and may replace a file's content. */
const OVERWRITES: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
/** Writes, and reaches a service outside this machine (a website, a host, Figma, Canva, a shop). */
const WRITES_ONLINE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  list_open_design_skills: READS,
  list_open_design_design_systems: READS,
  recommend_open_design_design_systems: READS,
  prepare_open_design_brief: READS,
  create_open_design_design_system: READS,
  port_open_design_artifact_to_app: READS,
  pull_open_design_figma_frame: READS,
  get_open_design_artifact: READS,
  show_open_design_artifact: READS,
  show_open_design_examples: READS,
  show_open_design_design_systems: READS,
  show_open_design_questions: READS,
  get_open_design_preview_state: READS,
  list_open_design_integrations: READS,
  list_open_design_print_houses: READS,
  find_open_design_3d_assets: READS_ONLINE,

  read_open_design_source: WRITES,
  prepare_open_design_exploration: WRITES,
  compare_open_design_exploration: WRITES,
  choose_open_design_direction: WRITES,
  register_open_design_artifact: WRITES,
  open_open_design_preview: WRITES,
  save_open_design_comment: WRITES,
  set_active_design_system: WRITES,
  prepare_open_design_component_library: WRITES,
  remix_open_design_example: WRITES,
  export_open_design_artifact: WRITES,
  add_open_design_diagram_runtime: WRITES,
  check_open_design_artifact: WRITES,
  adapt_open_design_artifact: WRITES,
  create_open_design_qr_code: WRITES,
  start_open_design_job_run: WRITES,
  finish_open_design_job_run: WRITES,
  set_open_design_workspace: WRITES,
  use_open_design_managed_workspace: WRITES,
  set_up_open_design_browser_pane: WRITES,

  write_open_design_file: OVERWRITES,

  extract_open_design_design_system: WRITES_ONLINE,
  publish_open_design_artifact: WRITES_ONLINE,
  publish_open_design_artifact_to_canva: WRITES_ONLINE,
  publish_open_design_artifact_to_shop: WRITES_ONLINE,
  push_open_design_artifact_to_figma: WRITES_ONLINE,
  restore_open_design_artifact: { ...WRITES_ONLINE, destructiveHint: true },
};

// Human-readable titles (openspec add-mcp-gateway, "Directory Tool Metadata"):
// the Claude connector directory requires one on every tool, and hosts show
// them in confirmation prompts. Every tool must have one; a unit test checks it.
export const TOOL_TITLES: Record<string, string> = {
  list_open_design_skills: 'List design recipes',
  list_open_design_design_systems: 'List design systems',
  recommend_open_design_design_systems: 'Recommend design systems',
  prepare_open_design_brief: 'Prepare a design brief',
  create_open_design_design_system: 'Create a design system',
  port_open_design_artifact_to_app: 'Port a design to an app',
  pull_open_design_figma_frame: 'Pull a Figma frame',
  get_open_design_artifact: 'Get a design',
  show_open_design_artifact: 'Show a design',
  show_open_design_examples: 'Show examples',
  show_open_design_design_systems: 'Show design systems',
  show_open_design_questions: 'Ask design questions',
  get_open_design_preview_state: 'Load the preview',
  list_open_design_integrations: 'List integrations',
  list_open_design_print_houses: 'List print services',
  find_open_design_3d_assets: 'Find 3D assets',
  read_open_design_source: 'Read a source document',
  prepare_open_design_exploration: 'Prepare design directions',
  compare_open_design_exploration: 'Compare design directions',
  choose_open_design_direction: 'Choose a design direction',
  register_open_design_artifact: 'Register a design',
  open_open_design_preview: 'Open the browser preview',
  save_open_design_comment: 'Save a comment',
  set_active_design_system: 'Set the design system',
  prepare_open_design_component_library: 'Prepare a component library',
  remix_open_design_example: 'Remix an example',
  export_open_design_artifact: 'Export a design',
  add_open_design_diagram_runtime: 'Add the diagram runtime',
  check_open_design_artifact: 'Check a design',
  adapt_open_design_artifact: 'Adapt a design to new sizes',
  create_open_design_qr_code: 'Create a QR code',
  start_open_design_job_run: 'Start a recurring job run',
  finish_open_design_job_run: 'Finish a recurring job run',
  set_open_design_workspace: 'Set the design folder',
  use_open_design_managed_workspace: 'Open a design folder',
  set_up_open_design_browser_pane: 'Set up the browser pane',
  write_open_design_file: 'Write a design file',
  extract_open_design_design_system: 'Extract a design system from a website',
  publish_open_design_artifact: 'Publish a design',
  publish_open_design_artifact_to_canva: 'Send a design to Canva',
  publish_open_design_artifact_to_shop: 'Send designs to a shop',
  push_open_design_artifact_to_figma: 'Push a design to Figma',
  restore_open_design_artifact: 'Restore a design from an artifact',
};
