// The gateway's own tools (openspec add-mcp-gateway, add-gateway-sign-in):
// project handles, export job status and, with sign-in, the user's library.
import type { RemoteTool, ToolResult } from '@feimacode/open-design-agent-kit-mcp/src/session';
import type { ExportJobs } from './jobs';
import type { GatewayUser, ProjectStore } from './projects';

export const START_PROJECT_TOOL = 'start_open_design_project';
export const EXPORT_STATUS_TOOL = 'get_open_design_export_status';
export const LIST_PROJECTS_TOOL = 'list_open_design_projects';
export const CLAIM_PROJECT_TOOL = 'claim_open_design_project';
export const DELETE_PROJECT_TOOL = 'delete_open_design_project';

/** Tools that need a signed-in user: without a token the gateway answers HTTP 401 so the host starts sign-in. */
export const ACCOUNT_TOOLS = new Set([LIST_PROJECTS_TOOL, CLAIM_PROJECT_TOOL]);

export interface CallContext {
  user?: GatewayUser;
  ip: string;
}

export interface GatewayToolDeps {
  store: ProjectStore;
  jobs: ExportJobs;
  signInEnabled: boolean;
  /** The caller of the current request. */
  caller(): CallContext;
}

function text(t: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) };
}

export const UNKNOWN_PROJECT =
  'That project handle is unknown or has expired (anonymous projects are deleted after 7 days without use). Call start_open_design_project to start a new project, then use its handle. Nothing was changed.';

export function gatewayTools(deps: GatewayToolDeps): RemoteTool[] {
  const { store, jobs } = deps;
  const projectArg = { type: 'string', description: 'The project handle from start_open_design_project (odp_…).' };
  const tools: RemoteTool[] = [
    {
      tool: {
        name: START_PROJECT_TOOL,
        title: 'Start a design project',
        description:
          'Starts an Open Design project and returns its handle. Call it once at the start of a conversation, before any tool that makes, checks, shows or exports a design, and pass the handle as "project" on every later call. Browsing tools (list_open_design_skills, list_open_design_design_systems, recommend_open_design_design_systems) work without one. Signed-in users keep their projects; anonymous projects are deleted after 7 days without use, so tell the user to save what they want to keep.',
        inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'A short name for the project, e.g. "Café opening poster".' } } },
        annotations: { title: 'Start a design project', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      },
      handler: async (args) => {
        const { user, ip } = deps.caller();
        if (!user && !store.allowNewProject(ip)) {
          return text('Too many new projects from this network in the last hour. Keep using the current project handle, or try again later.', true);
        }
        const ref = await store.create({ title: typeof args.title === 'string' ? args.title : undefined, user });
        const keep = user ? 'It is saved to the user’s Open Design library.' : 'It is kept for 7 days after its last use; tell the user once to save (export) what they want to keep.';
        return {
          content: [{ type: 'text', text: `Project started. Pass project: "${ref.meta.id}" on every Open Design call in this conversation. ${keep}` }],
          structuredContent: { project: ref.meta.id, ...(ref.meta.title ? { title: ref.meta.title } : {}), signedIn: Boolean(user) },
        };
      },
    },
    {
      tool: {
        name: EXPORT_STATUS_TOOL,
        title: 'Check an export',
        description: 'Returns the state of an export job that export_open_design_artifact handed back, and its download links once it is done.',
        inputSchema: { type: 'object', properties: { project: projectArg, jobId: { type: 'string', description: 'The job id (odj_…).' } }, required: ['project', 'jobId'] },
        annotations: { title: 'Check an export', readOnlyHint: true, openWorldHint: false },
      },
      handler: async (args) => {
        const ref = await store.find(args.project, deps.caller().user);
        if (!ref) return text(UNKNOWN_PROJECT, true);
        const job = await jobs.status(ref.dir, args.jobId);
        if (!job) return text('No export job with that id in this project.', true);
        if (job.status === 'queued' || job.status === 'running') return text(`Export ${job.id} is still ${job.status}. Check again in about 20 seconds.`);
        return job.result ?? text(`Export ${job.id} finished with no result.`, job.status === 'failed');
      },
    },
    {
      tool: {
        name: DELETE_PROJECT_TOOL,
        title: 'Delete a design project',
        description: 'Deletes a project with all its designs, exports and share links. Only when the user asks to delete it.',
        inputSchema: { type: 'object', properties: { project: projectArg }, required: ['project'] },
        annotations: { title: 'Delete a design project', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
      },
      handler: async (args) => {
        const ref = await store.find(args.project, deps.caller().user);
        if (!ref) return text(UNKNOWN_PROJECT, true);
        await store.remove(ref);
        return text('The project and everything in it were deleted, including its share links.');
      },
    },
  ];
  if (deps.signInEnabled) {
    tools.push(
      {
        tool: {
          name: LIST_PROJECTS_TOOL,
          title: 'List my design projects',
          description: "Lists the signed-in user's Open Design projects, newest first, with their handles. Use when the user wants to continue an earlier design.",
          inputSchema: { type: 'object', properties: {} },
          annotations: { title: 'List my design projects', readOnlyHint: true, openWorldHint: false },
        },
        handler: async () => {
          const { user } = deps.caller();
          if (!user) return text('Sign in to see your projects.', true);
          const list = await store.list(user);
          if (!list.length) return text('No saved projects yet. Start one with start_open_design_project.');
          return {
            content: [{ type: 'text', text: list.map((p) => `- ${p.title ?? 'Untitled'} (project: ${p.id}, last used ${p.lastUsedAt.slice(0, 10)})`).join('\n') }],
            structuredContent: { projects: list.map((p) => ({ project: p.id, title: p.title, lastUsedAt: p.lastUsedAt })) },
          };
        },
      },
      {
        tool: {
          name: CLAIM_PROJECT_TOOL,
          title: 'Save a project to my library',
          description: "Moves an anonymous project into the signed-in user's library, so it is kept and appears in list_open_design_projects. The handle stays the same but only works for this user afterwards.",
          inputSchema: { type: 'object', properties: { project: projectArg }, required: ['project'] },
          annotations: { title: 'Save a project to my library', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        handler: async (args) => {
          const { user } = deps.caller();
          if (!user) return text('Sign in to save projects.', true);
          const ref = await store.claim(args.project, user);
          if (!ref) return text('No anonymous project with that handle (it may already be saved, or expired).', true);
          return text(`Saved to the library. Keep using project: "${ref.meta.id}".`);
        },
      },
    );
  }
  return tools;
}
