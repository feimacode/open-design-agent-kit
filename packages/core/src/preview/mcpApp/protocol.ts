// The preview MCP App (openspec add-mcp-app-preview): names and payloads
// shared by the MCP server, which registers the `ui://` resource and its
// tools, and the page (mcpApp/main.ts), which renders in hosts that support
// MCP Apps (Claude Desktop Chat). Kept free of node: and DOM imports.
// The MCP Apps names below are pinned to @modelcontextprotocol/ext-apps
// 1.7.5; this is the one place that declares them.
import type { ArtifactComment } from '../../workspace/artifactCommentTypes';

/** The MCP Apps extension id a client lists under `capabilities.extensions`. */
export const MCP_APPS_EXTENSION_ID = 'io.modelcontextprotocol/ui';
/** The MIME type of an MCP App HTML resource. */
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';
/** The older flat `_meta` key some hosts still read for a tool's UI resource. */
export const MCP_APP_LEGACY_RESOURCE_KEY = 'ui/resourceUri';

export const PREVIEW_APP_URI = 'ui://open-design/preview';

export const SHOW_ARTIFACT_TOOL = 'show_open_design_artifact';
export const SHOW_EXAMPLES_TOOL = 'show_open_design_examples';
export const SHOW_DESIGN_SYSTEMS_TOOL = 'show_open_design_design_systems';
export const SAVE_COMMENT_TOOL = 'save_open_design_comment';
export const PREVIEW_STATE_TOOL = 'get_open_design_preview_state';
export const SHOW_QUESTIONS_TOOL = 'show_open_design_questions';

/** Remote hosts every preview may load from: Google Fonts' stylesheets and font files. */
export const PREVIEW_APP_BASE_DOMAINS: readonly string[] = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

/** Above this size the page shows the latest check screenshot instead of the design. */
export const PREVIEW_APP_MAX_HTML_BYTES = 5 * 1024 * 1024;
/** Examples per page of the gallery (openspec add-mcp-app-pickers). */
export const PREVIEW_APP_EXAMPLES_PAGE_SIZE = 24;
/** Above this size a campaign tile shows its label and errors without the image. */
export const PREVIEW_APP_MAX_TILE_IMAGE_BYTES = 1024 * 1024;

/** `_meta` for a tool whose result the preview renders. */
export function previewAppToolMeta(status?: ToolStatusText): Record<string, unknown> {
  return {
    ui: { resourceUri: PREVIEW_APP_URI },
    [MCP_APP_LEGACY_RESOURCE_KEY]: PREVIEW_APP_URI,
    ...(status ? { [TOOL_INVOKING_KEY]: status.invoking, [TOOL_INVOKED_KEY]: status.invoked } : {}),
  };
}

/** Status lines a host may show while a render tool runs and once it's done (ChatGPT reads these keys; others ignore them). */
export interface ToolStatusText {
  invoking: string;
  invoked: string;
}
export const TOOL_INVOKING_KEY = 'openai/toolInvocation/invoking';
export const TOOL_INVOKED_KEY = 'openai/toolInvocation/invoked';

/** The render tools' status lines (openspec chatgpt-mcp-apps-compat), short and plain. */
export const RENDER_TOOL_STATUS: Record<string, ToolStatusText> = {
  show_open_design_artifact: { invoking: 'Opening the preview…', invoked: 'Preview ready' },
  show_open_design_examples: { invoking: 'Finding examples…', invoked: 'Examples ready' },
  show_open_design_design_systems: { invoking: 'Finding design systems…', invoked: 'Design systems ready' },
  show_open_design_questions: { invoking: 'Preparing a few questions…', invoked: 'Questions ready' },
};

/** `_meta` for a tool only the preview page calls: hosts keep it out of the model's tool list. */
export function appOnlyToolMeta(): Record<string, unknown> {
  return { ui: { resourceUri: PREVIEW_APP_URI, visibility: ['app'] } };
}

/** True when the client's capabilities say it renders MCP App HTML resources. */
export function clientSupportsMcpApps(capabilities: unknown): boolean {
  const extensions = (capabilities as { extensions?: Record<string, unknown> } | null | undefined)?.extensions;
  const ui = extensions?.[MCP_APPS_EXTENSION_ID] as { mimeTypes?: unknown } | undefined;
  if (!ui || typeof ui !== 'object') return false;
  // A host that lists MIME types must list ours; one that lists none renders the default.
  return !Array.isArray(ui.mimeTypes) || ui.mimeTypes.includes(MCP_APP_MIME_TYPE);
}

export interface ExampleFilters {
  query?: string;
  mode?: string;
  surface?: string;
}

export interface DesignSystemFilters {
  query?: string;
  category?: string;
  /** A shortlist, shown in this order. */
  ids?: string[];
}

/** What a show tool hands the page as its structured result: the view, its filters and a title, never the data itself. */
export type ShowTarget =
  | { view: 'artifact'; entryPath: string; title: string }
  | { view: 'exploration'; explorationId: string; title: string }
  | ({ view: 'examples'; title: string } & ExampleFilters)
  | ({ view: 'design-systems'; title: string } & DesignSystemFilters)
  | { view: 'campaign'; entryPath: string; title: string }
  | ({ view: 'ask'; title: string } & Pick<AskSchema, 'questions'>);

export interface PreviewAppCheckImage {
  label: string;
  /** A `data:image/jpeg;base64,…` URL. */
  src: string;
}

export interface PreviewAppArtifactState {
  view: 'artifact';
  entryPath: string;
  title: string;
  kind?: string;
  /** The standalone page with the preview bridge injected; absent when it can't be shown inline (see `fallback`). */
  html?: string;
  /** Why `html` is absent: too large, not an HTML kind, or packaging failed. */
  fallback?: string;
  comments: ArtifactComment[];
  /** The latest check run's screenshots. */
  checkImages: PreviewAppCheckImage[];
  /** Export formats offered as buttons (each sends a chat request). */
  exports: string[];
}

export interface PreviewAppDirection {
  id: string;
  label: string;
  summary: string;
  /** The direction's registered artifact, once it has one. */
  entryPath?: string;
  title?: string;
  /** The standalone page (view only), or absent when `image` or nothing is shown instead. */
  html?: string;
  image?: string;
}

export interface PreviewAppExplorationState {
  view: 'exploration';
  explorationId: string;
  title: string;
  chosenDirectionId?: string;
  /** Made with the style-tile skill: each direction can be saved as a design system. */
  styleTiles?: boolean;
  directions: PreviewAppDirection[];
}

export interface PreviewAppExample {
  /** The skill id remix_open_design_example takes. */
  id: string;
  name: string;
  mode: string;
  summary: string;
}

/** One page of the gallery; each card's preview is fetched on its own (PreviewAppExamplePreview). */
export interface PreviewAppExamplesState {
  view: 'examples';
  title: string;
  filters: ExampleFilters;
  /** Modes offered as filter chips: every mode among the examples that match the other filters. */
  modes: string[];
  examples: PreviewAppExample[];
  total: number;
  /** Pass back as `cursor` for the next page. */
  nextCursor?: string;
  /** The public gallery's examples hub, while it is live (openspec link-public-gallery). */
  galleryUrl?: string;
}

export interface PreviewAppExamplePreview {
  exampleId: string;
  /** The example as one view-only page, or absent (see `fallback`). */
  html?: string;
  fallback?: string;
}

export interface PreviewAppDesignSystemTile {
  id: string;
  name: string;
  category?: string;
  summary: string;
  active: boolean;
  /** Up to five CSS colors: background, text, accent, surface, muted (or DESIGN.md's colors). */
  swatches: string[];
  displayFont?: string;
  bodyFont?: string;
}

export interface PreviewAppDesignSystemsState {
  view: 'design-systems';
  title: string;
  filters: DesignSystemFilters;
  systems: PreviewAppDesignSystemTile[];
  /** Shortlisted ids that matched nothing. */
  unknownIds?: string[];
  /** The public gallery's design-systems hub, while it is live (openspec link-public-gallery). */
  galleryUrl?: string;
}

/** A design system's Visualize page: script-free, shown in a view-only frame. */
export interface PreviewAppDesignSystemPreview {
  designSystemId: string;
  html: string;
}

export interface PreviewAppCampaignError {
  check: string;
  message: string;
}

export interface PreviewAppCampaignTile {
  label: string;
  /** A shape of the master (a preset id such as banner-mobile)… */
  shape?: string;
  /** …or another piece of the collection, opened in the artifact view. */
  entryPath?: string;
  /** The exported file the tile shows, when the export wrote one. */
  file?: string;
  /** A data URL, absent when the tile's image is missing or over the per-tile cap. */
  image?: string;
  errors: PreviewAppCampaignError[];
}

export interface PreviewAppCampaignState {
  view: 'campaign';
  entryPath: string;
  title: string;
  tiles: PreviewAppCampaignTile[];
  /** campaign-sheet.png as a data URL, when there is no sidecar to draw tiles from. */
  sheetImage?: string;
  /** Shown instead of tiles: why there are none. */
  message?: string;
}

export type PreviewAppState = PreviewAppArtifactState | PreviewAppExplorationState | PreviewAppExamplesState | PreviewAppDesignSystemsState | PreviewAppCampaignState;

export const PREVIEW_APP_VIEWS: readonly PreviewAppState['view'][] = ['artifact', 'exploration', 'examples', 'design-systems', 'campaign'];

/** The chat message "Ask Claude to apply" sends. */
export function applyCommentsMessage(entryPath: string, comments: Pick<ArtifactComment, 'id' | 'note'>[]): string {
  const list = comments.map((c) => `- ${c.id}: ${c.note}`).join('\n');
  return `Apply my ${comments.length === 1 ? 'comment' : `${comments.length} comments`} on the Open Design artifact "${entryPath}":\n${list}\n\nCall get_open_design_artifact for it, address each comment, and pass their ids as resolvedCommentIds when you re-register it. The preview I commented in updates by itself, so don't call ${SHOW_ARTIFACT_TOOL} again.`;
}

/** The chat message an export button sends; the server tool writes the file, the page never downloads. */
export function exportRequestMessage(entryPath: string, format: string): string {
  return `Export the Open Design artifact "${entryPath}" as ${format}: call export_open_design_artifact with format "${format}" and tell me where the file was written.`;
}

/** The chat message "Take this one" sends; the agent confirms before calling choose_open_design_direction. */
export function pickDirectionMessage(explorationId: string, direction: Pick<PreviewAppDirection, 'id' | 'label'>): string {
  return `I'd like direction "${direction.label}" (${direction.id}) from the Open Design exploration "${explorationId}". Ask me whether to build it out, merge in parts of other directions, or save it as a design system, then call choose_open_design_direction with my answer.`;
}

// Picks (openspec add-mcp-app-pickers): each names the tool and arguments the
// agent should use; the page itself never calls a model-visible tool.

/** "Remix this": the agent asks what to make first when the person hasn't said. */
export function remixExampleMessage(example: Pick<PreviewAppExample, 'id' | 'name'>): string {
  return `I'd like to remix the Open Design example "${example.name}" (skillId "${example.id}"). If I haven't said what to make with it, ask me first; then call remix_open_design_example with skillId "${example.id}".`;
}

/** "Use this design system": a direct instruction. */
export function useDesignSystemMessage(system: Pick<PreviewAppDesignSystemTile, 'id' | 'name'>): string {
  return `Use the "${system.name}" design system: call set_active_design_system with designSystemId "${system.id}".`;
}

/** "Use as design system" on a style-tile exploration: a direct instruction. */
export function saveTileMessage(explorationId: string, direction: Pick<PreviewAppDirection, 'id' | 'label'>): string {
  return `Save tile "${direction.label}" (${direction.id}) from the Open Design style-tile exploration "${explorationId}" as a design system: call choose_open_design_direction with explorationId "${explorationId}", directionId "${direction.id}" and next: "save-design-system".`;
}

/** "Fix this piece" on the campaign sheet. */
export function fixCampaignPieceMessage(masterEntryPath: string, tile: Pick<PreviewAppCampaignTile, 'label' | 'shape' | 'entryPath' | 'errors'>): string {
  const piece = tile.entryPath ? `the piece "${tile.entryPath}"` : `the "${tile.shape ?? tile.label}" shape of "${masterEntryPath}"`;
  const errors = tile.errors.length ? `\n${tile.errors.map((e) => `- ${e.check}: ${e.message}`).join('\n')}` : ' It has no errors listed; ask me what to change.';
  return `Fix ${piece} on the Open Design campaign sheet (${tile.label}).${errors}\n\nThen export the master again with campaignSheet: true (entryPath "${masterEntryPath}"). The sheet I clicked in updates by itself, so don't call ${SHOW_ARTIFACT_TOOL} again.`;
}

// ── The ask view (openspec add-mcp-app-ask-view) ──────────────────────────
// A fixed schema the kit owns, not a UI language: a few questions with
// tappable options. Send posts one chat message with a readable line and a
// machine line the skills tell the agent to read.

export const ASK_MAX_QUESTIONS = 4;
export const ASK_MAX_OPTIONS = 8;
export const ASK_MAX_LABEL_CHARS = 120;
export const ASK_MAX_TEXT_CHARS = 200;
/** The whole schema, as JSON. */
export const ASK_MAX_BYTES = 2048;
/** The answer a "You pick" chip gives: the agent chooses for the user. No option may use this id. */
export const ASK_YOU_PICK = 'you-pick';
/** The machine line's marker: `<!-- od-answers {...} -->`. */
export const ASK_ANSWERS_MARKER = 'od-answers';

export type AskQuestionKind = 'single' | 'multi' | 'text';

export interface AskOption {
  id: string;
  label: string;
  /** Something the server already renders (see ASK_IMAGE_REF_KINDS), never a URL. */
  imageRef?: string;
}

export interface AskQuestion {
  id: string;
  text: string;
  kind: AskQuestionKind;
  /** For single and multi: 1 to ASK_MAX_OPTIONS options. A text question has none. */
  options?: AskOption[];
  /** An option id (single), option ids (multi) or a prefilled answer (text). */
  default?: string | string[];
}

export interface AskSchema {
  title?: string;
  questions: AskQuestion[];
}

/** What an `imageRef` may name: `designSystem:<id>`, `example:<skillId>`, `artifact:<entryPath>`, `checkRun:<entryPath>` or `checkRun:<entryPath>#<runId>`. */
export const ASK_IMAGE_REF_KINDS = ['designSystem', 'example', 'artifact', 'checkRun'] as const;
export type AskImageRefKind = (typeof ASK_IMAGE_REF_KINDS)[number];

export interface AskImageRef {
  kind: AskImageRefKind;
  /** The design-system id, example skill id or entry path. */
  value: string;
  /** checkRun only: a run id; absent means the latest run. */
  runId?: string;
}

const ASK_ID = /^[A-Za-z0-9][\w-]{0,39}$/;
const IMAGE_REF_HELP = 'designSystem:<id>, example:<skillId>, artifact:<entryPath>, checkRun:<entryPath> or checkRun:<entryPath>#<runId>';

export function parseAskImageRef(ref: string): AskImageRef | string {
  const colon = ref.indexOf(':');
  const kind = colon > 0 ? ref.slice(0, colon) : '';
  const rest = colon > 0 ? ref.slice(colon + 1).trim() : '';
  if (!(ASK_IMAGE_REF_KINDS as readonly string[]).includes(kind) || !rest || /^[a-z][a-z0-9+.-]*:\/\//i.test(ref) || /^(data|javascript):/i.test(rest)) {
    return `imageRef "${ref.slice(0, 80)}" isn't allowed. Use one of: ${IMAGE_REF_HELP}. Raw URLs and HTML aren't accepted.`;
  }
  if (kind === 'checkRun') {
    const hash = rest.lastIndexOf('#');
    if (hash > 0) {
      const runId = rest.slice(hash + 1);
      if (!/^[\w-]+$/.test(runId)) return `imageRef "${ref.slice(0, 80)}": the run id after "#" may only hold letters, digits, "-" and "_".`;
      return { kind, value: rest.slice(0, hash), runId };
    }
  }
  return { kind: kind as AskImageRefKind, value: rest };
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Checks the agent's questions field by field and returns a clean copy, or a message saying what to fix. */
export function parseAskSchema(value: unknown): { ok: true; schema: AskSchema } | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message });
  if (!value || typeof value !== 'object') return fail('Pass questions as an array.');
  const v = value as Record<string, unknown>;
  if (v.title !== undefined && (!isStr(v.title) || v.title.length > ASK_MAX_LABEL_CHARS)) return fail(`title must be a string of at most ${ASK_MAX_LABEL_CHARS} characters.`);
  if (!Array.isArray(v.questions) || v.questions.length === 0) return fail('Pass at least one question.');
  if (v.questions.length > ASK_MAX_QUESTIONS) return fail(`Ask at most ${ASK_MAX_QUESTIONS} questions at once (got ${v.questions.length}).`);
  const questions: AskQuestion[] = [];
  const ids = new Set<string>();
  for (const [i, raw] of v.questions.entries()) {
    const where = `questions[${i}]`;
    if (!raw || typeof raw !== 'object') return fail(`${where} must be an object.`);
    const q = raw as Record<string, unknown>;
    if (!isStr(q.id) || !ASK_ID.test(q.id)) return fail(`${where}.id must be 1–40 letters, digits, "-" or "_", starting with a letter or digit.`);
    if (ids.has(q.id)) return fail(`${where}.id "${q.id}" is used twice.`);
    ids.add(q.id);
    if (!isStr(q.text) || !q.text.trim() || q.text.length > ASK_MAX_TEXT_CHARS) return fail(`${where}.text must be a question of 1–${ASK_MAX_TEXT_CHARS} characters.`);
    const kind = q.kind ?? 'single';
    if (kind !== 'single' && kind !== 'multi' && kind !== 'text') return fail(`${where}.kind must be "single", "multi" or "text".`);
    const question: AskQuestion = { id: q.id, text: q.text.trim(), kind };
    if (kind === 'text') {
      if (Array.isArray(q.options) && q.options.length) return fail(`${where} is a text question: it takes no options.`);
      if (q.default !== undefined) {
        if (!isStr(q.default) || q.default.length > ASK_MAX_TEXT_CHARS) return fail(`${where}.default must be a string of at most ${ASK_MAX_TEXT_CHARS} characters.`);
        question.default = q.default;
      }
      questions.push(question);
      continue;
    }
    if (!Array.isArray(q.options) || q.options.length === 0) return fail(`${where} needs options (a "${kind}" question).`);
    if (q.options.length > ASK_MAX_OPTIONS) return fail(`${where} has ${q.options.length} options; at most ${ASK_MAX_OPTIONS}.`);
    const options: AskOption[] = [];
    const optionIds = new Set<string>();
    for (const [j, rawOpt] of q.options.entries()) {
      const at = `${where}.options[${j}]`;
      if (!rawOpt || typeof rawOpt !== 'object') return fail(`${at} must be an object with id and label.`);
      const o = rawOpt as Record<string, unknown>;
      if (!isStr(o.id) || !ASK_ID.test(o.id)) return fail(`${at}.id must be 1–40 letters, digits, "-" or "_", starting with a letter or digit.`);
      if (o.id === ASK_YOU_PICK) return fail(`${at}.id "${ASK_YOU_PICK}" is reserved: the view adds a "You pick" choice itself.`);
      if (optionIds.has(o.id)) return fail(`${at}.id "${o.id}" is used twice in ${where}.`);
      optionIds.add(o.id);
      if (!isStr(o.label) || !o.label.trim() || o.label.length > ASK_MAX_LABEL_CHARS) return fail(`${at}.label must be 1–${ASK_MAX_LABEL_CHARS} characters.`);
      const option: AskOption = { id: o.id, label: o.label.trim() };
      if (o.imageRef !== undefined) {
        if (!isStr(o.imageRef)) return fail(`${at}.imageRef must be a string: one of ${IMAGE_REF_HELP}.`);
        const ref = parseAskImageRef(o.imageRef);
        if (typeof ref === 'string') return fail(`${at}: ${ref}`);
        option.imageRef = o.imageRef;
      }
      options.push(option);
    }
    question.options = options;
    if (q.default !== undefined) {
      const known = (id: unknown): boolean => isStr(id) && (optionIds.has(id) || id === ASK_YOU_PICK);
      if (kind === 'single' && !known(q.default)) return fail(`${where}.default must be one of its option ids.`);
      if (kind === 'multi' && !(Array.isArray(q.default) && q.default.every(known))) return fail(`${where}.default must be an array of its option ids.`);
      question.default = Array.isArray(q.default) ? [...(q.default as string[])] : (q.default as string);
    }
    questions.push(question);
  }
  const schema: AskSchema = v.title && (v.title as string).trim() ? { title: (v.title as string).trim(), questions } : { questions };
  const bytes = new TextEncoder().encode(JSON.stringify(schema)).length;
  if (bytes > ASK_MAX_BYTES) return fail(`The questions are ${bytes} bytes as JSON; keep them under ${ASK_MAX_BYTES} (shorter labels, fewer options).`);
  return { ok: true, schema };
}

/** Answers by question id: an option id (single), option ids (multi), the typed text, or ASK_YOU_PICK. Unanswered questions are left out. */
export type AskAnswers = Record<string, string | string[]>;

function answerLabel(question: AskQuestion, id: string): string {
  if (id === ASK_YOU_PICK) return 'You pick';
  return question.options?.find((o) => o.id === id)?.label ?? id;
}

/** The chat message Send posts: a readable `id = label` line for the user, and a JSON line in an HTML comment for the agent. */
export function askAnswersMessage(schema: AskSchema, answers: AskAnswers): string {
  const pairs: string[] = [];
  const machine: AskAnswers = {};
  for (const q of schema.questions) {
    const a = answers[q.id];
    if (a === undefined || (Array.isArray(a) && a.length === 0) || (!Array.isArray(a) && !a.trim())) continue;
    if (q.kind === 'text') {
      const text = (Array.isArray(a) ? a.join(', ') : a).trim().replace(/\s+/g, ' ').slice(0, ASK_MAX_TEXT_CHARS);
      pairs.push(`${q.id} = ${text}`);
      machine[q.id] = text;
    } else {
      const picked = Array.isArray(a) ? a : [a];
      pairs.push(`${q.id} = ${picked.map((id) => answerLabel(q, id)).join(', ')}`);
      machine[q.id] = q.kind === 'multi' ? picked : picked[0];
    }
  }
  // Escaped so a typed answer can't close the comment or start markup.
  const json = JSON.stringify(machine).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/-(?=-)/g, '\\u002d');
  return `Answers: ${pairs.join('; ') || '(none)'}\n<!-- ${ASK_ANSWERS_MARKER} ${json} -->`;
}

/** Reads the answers back from a message: the machine line, else the readable `id = label` pairs. */
export function parseAskAnswersMessage(text: string): AskAnswers | undefined {
  const machine = new RegExp(`<!--\\s*${ASK_ANSWERS_MARKER}\\s+(\\{[\\s\\S]*?\\})\\s*-->`).exec(text);
  if (machine) {
    try {
      const parsed = JSON.parse(machine[1]) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as AskAnswers;
    } catch {
      // Fall through to the readable line.
    }
  }
  const line = /^Answers:\s*(.*)$/m.exec(text);
  if (!line) return undefined;
  const out: AskAnswers = {};
  for (const pair of line[1].split(';')) {
    const eq = pair.indexOf('=');
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

/** What a host without MCP Apps gets: the questions as one numbered message to ask. */
export function askFallbackText(schema: AskSchema): string {
  const lines = schema.questions.map((q, i) => {
    const options = q.kind === 'text' ? ' (a short answer)' : `${q.kind === 'multi' ? ' (pick any)' : ''}: ${[...(q.options ?? []).map((o) => o.label), 'You pick'].join(' / ')}`;
    return `${i + 1}. ${q.text}${options}`;
  });
  return `This host doesn't show MCP Apps inline. Ask the user these in one message:\n${schema.title ? `${schema.title}\n` : ''}${lines.join('\n')}\n\nAccept "you pick" as an answer, and continue with whatever they answer.`;
}

/** What a host with MCP Apps gets alongside the inline questions. */
export function askShowText(schema: AskSchema): string {
  return `Showing ${schema.questions.length} question${schema.questions.length === 1 ? '' : 's'} inline; don't repeat them in chat. The user taps answers and Send, which posts a message starting "Answers:" with a line <!-- ${ASK_ANSWERS_MARKER} {...} -->. Read that JSON: keys are question ids, values are option ids (an array for multi), typed text, or "${ASK_YOU_PICK}" (choose for them and say what you chose). The user may type answers instead; accept those too.`;
}

/** An option picture for the ask view, from get_open_design_preview_state with `imageRef`. */
export interface PreviewAppAskImage {
  imageRef: string;
  /** A `data:image/…` URL (an artifact's or check run's screenshot). */
  image?: string;
  /** A view-only page (an example, or an artifact with no screenshot yet), shown scaled. */
  html?: string;
  /** A design system's palette. */
  swatches?: string[];
  /** Why there's nothing to show. */
  fallback?: string;
}

// ── Feedback chips under a design ─────────────────────────────────────────

export const FEEDBACK_CHIPS = [
  { id: 'good', label: 'Looks good' },
  { id: 'change', label: 'Change something' },
  { id: 'another', label: 'Try another direction' },
] as const;
export type FeedbackChipId = (typeof FEEDBACK_CHIPS)[number]['id'];

/** The chat message a feedback chip sends. */
export function feedbackChipMessage(entryPath: string, chip: FeedbackChipId): string {
  switch (chip) {
    case 'good':
      return `The Open Design artifact "${entryPath}" looks good to me. Ask me whether I want it exported or shared, or something else made next.`;
    case 'change':
      return `I'd like to change something in the Open Design artifact "${entryPath}". Ask me what to change, in one short question; I can also comment on elements in the preview.`;
    case 'another':
      return `Try another direction for the Open Design artifact "${entryPath}". Suggest two or three directions that differ from it (ask with ${SHOW_QUESTIONS_TOOL} if it's in your tools), then build the one I pick.`;
  }
}
