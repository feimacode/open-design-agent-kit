// MCP Apps host probe (openspec chatgpt-mcp-apps-compat, task 1.1): a tiny
// stdio MCP server that records what a host does with MCP Apps, so the rest of
// the change is scoped to facts. It logs, as JSON lines, to probe-log.jsonl in
// its own folder (or OPEN_DESIGN_PROBE_LOG):
//   - initialize: the client's capabilities and clientInfo;
//   - every tools/list and tools/call, with the caller (model or view);
//   - what the view reports: host info, capabilities and context, which
//     bridge calls worked, whether a srcdoc iframe ran its inline script, and
//     the largest tool result that reached it.
// Bundled to one file by build.mjs; needs nothing installed.
import { appendFileSync } from 'node:fs';
import * as path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';

declare const VIEW_HTML: string;

const URI = 'ui://od-probe/view.html';
const MIME = 'text/html;profile=mcp-app';
const LOG = process.env.OPEN_DESIGN_PROBE_LOG || path.join(__dirname, 'probe-log.jsonl');

function log(event: string, data: unknown): void {
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), event, data })}\n`);
}

const server = new Server({ name: 'od-mcp-apps-probe', version: '0.1.0' }, { capabilities: { tools: {}, resources: {} } });

const TOOLS = [
  {
    name: 'probe_show_view',
    description: 'Shows the Open Design MCP Apps probe view. Call it once when the user asks to run the probe.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: URI }, 'ui/resourceUri': URI, 'openai/outputTemplate': URI, 'openai/toolInvocation/invoking': 'Starting the probe…', 'openai/toolInvocation/invoked': 'Probe view ready' },
  },
  {
    name: 'probe_payload',
    description: 'Called by the probe view only. Returns a text payload of the requested size.',
    inputSchema: { type: 'object', properties: { bytes: { type: 'number' } }, required: ['bytes'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: URI, visibility: ['app'] } },
  },
  {
    name: 'probe_report',
    description: 'Called by the probe view only. Records what the view found.',
    inputSchema: { type: 'object', properties: { report: { type: 'object' } }, required: ['report'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: URI, visibility: ['app'] } },
  },
];

server.oninitialized = () => {
  log('initialize', { clientInfo: server.getClientVersion(), capabilities: server.getClientCapabilities() });
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  log('tools/list', { offered: TOOLS.map((t) => t.name), clientInfo: server.getClientVersion(), capabilities: server.getClientCapabilities() });
  return { tools: TOOLS };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: URI, name: 'Open Design probe', mimeType: MIME }] }));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  log('resources/read', { uri: request.params.uri });
  return { contents: [{ uri: URI, mimeType: MIME, text: VIEW_HTML, _meta: { ui: { csp: { resourceDomains: [], connectDomains: [] }, prefersBorder: true } } }] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log('tools/call', { name, args: name === 'probe_report' ? undefined : args, meta: request.params._meta });
  if (name === 'probe_show_view') {
    return { content: [{ type: 'text', text: 'The probe view is open. It runs its checks by itself and saves them; tell the user to wait until it says "Done", then to send the log file.' }], structuredContent: { started: true } };
  }
  if (name === 'probe_payload') {
    const bytes = Math.max(0, Math.min(Number((args as { bytes?: number })?.bytes) || 0, 20 * 1024 * 1024));
    return { content: [{ type: 'text', text: 'x'.repeat(bytes) }] };
  }
  if (name === 'probe_report') {
    log('view-report', (args as { report?: unknown })?.report);
    return { content: [{ type: 'text', text: `Saved to ${LOG}` }] };
  }
  return { content: [{ type: 'text', text: `Unknown tool ${name}` }], isError: true };
});

log('start', { pid: process.pid, cwd: process.cwd(), node: process.version, env: { OPEN_DESIGN_LAUNCHER: process.env.OPEN_DESIGN_LAUNCHER } });
server.connect(new StdioServerTransport()).catch((err) => log('error', String(err)));
