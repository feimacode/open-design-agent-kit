// A small agent loop for the evals that needs no agent CLI: it calls an
// OpenAI-compatible /chat/completions endpoint (ClinePass, OpenRouter, OpenAI,
// a local server) with function tools, and runs the tool calls itself.
//
// Two arms share the same loop, model and file tools, so the difference
// between them is what the kit adds:
//   kit   file tools + this checkout's MCP server (its tools, in-process over stdio)
//         + the plugin's open-design skill as the system prompt
//   bare  file tools only
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/** Kit tools that don't fit a headless run in a plain folder: they pick another folder, or open windows on a desktop. */
export const HIDDEN_KIT_TOOLS = new Set([
  'set_open_design_workspace',
  'use_open_design_managed_workspace',
  'write_open_design_file',
  'set_up_open_design_browser_pane',
  'open_open_design_preview',
]);

const MAX_TOOL_RESULT_CHARS = 60_000;
const MAX_READ_BYTES = 200_000;
const SKIPPED = new Set(['node_modules', '.git']);

// ---------------------------------------------------------------- endpoint

/**
 * One chat completion. Retries rate limits and server errors with backoff;
 * anything else throws with the endpoint's message.
 */
export async function chatCompletion({ baseUrl, apiKey, model, messages, tools, fetchImpl = fetch, retries = 4, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = JSON.stringify({ model, messages, ...(tools?.length ? { tools, tool_choice: 'auto' } : {}) });
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body });
    } catch (err) {
      if (attempt >= retries) throw new Error(`Can't reach ${url}: ${err instanceof Error ? err.message : String(err)}`);
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.ok) {
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`${url} returned a ${res.status} that is not JSON: ${text.slice(0, 300)}`);
      }
      // ClinePass and some other gateways wrap the completion as { data: { choices: [...] } }.
      if (!json?.choices && json?.data?.choices) json = json.data;
      // Some OpenAI-compatible endpoints answer 200 with an error object instead of a completion.
      if (!json?.choices?.[0]?.message) throw new Error(`${url} returned no message for model "${model}": ${(json?.error ? JSON.stringify(json.error) : text).slice(0, 400)}`);
      return json;
    }
    const text = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const after = Number(res.headers?.get?.('retry-after'));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`${res.status} from ${url}: ${text.slice(0, 300) || res.statusText}`);
  }
}

/**
 * One small call before any brief runs, so a wrong URL, model id or key stops
 * the run at once instead of failing every case. No max_tokens: a reasoning
 * model can spend a small cap thinking and come back empty.
 */
export async function checkEndpoint({ baseUrl, apiKey, model, fetchImpl, sleep }) {
  await chatCompletion({ baseUrl, apiKey, model, messages: [{ role: 'user', content: 'Reply with the word ok.' }], fetchImpl, sleep, retries: 1 });
}

// ---------------------------------------------------------------- tools

/** Resolves a path the model gave inside root, or throws. */
function inside(root, rel) {
  const target = path.resolve(root, String(rel ?? '.'));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`${rel} is outside the working folder.`);
  return target;
}

async function listTree(root, dir, depth, out) {
  let entries = [];
  try {
    entries = await fs.readdir(path.join(root, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIPPED.has(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    out.push(e.isDirectory() ? `${rel}/` : rel);
    if (e.isDirectory() && depth > 0) await listTree(root, rel, depth - 1, out);
    if (out.length > 500) return;
  }
}

/** list_files, read_file and write_file in one folder: the same in both arms. */
export function fileTools(root) {
  const definitions = [
    {
      type: 'function',
      function: {
        name: 'list_files',
        description: 'Lists files and folders under a folder of the working folder (default: the working folder), up to three levels deep.',
        parameters: { type: 'object', properties: { path: { type: 'string', description: 'Folder, relative to the working folder.' } } },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Reads a text file in the working folder.',
        parameters: { type: 'object', properties: { path: { type: 'string', description: 'File, relative to the working folder.' } }, required: ['path'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Writes a whole text file in the working folder, creating folders as needed. Replaces the file if it exists.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'File, relative to the working folder.' }, content: { type: 'string', description: 'The whole file.' } },
          required: ['path', 'content'],
        },
      },
    },
  ];
  const call = async (name, args) => {
    if (name === 'list_files') {
      const out = [];
      const dir = path.relative(root, inside(root, args.path ?? '.'));
      await listTree(root, dir, 2, out);
      return out.length ? out.join('\n') : '(empty)';
    }
    if (name === 'read_file') {
      const file = inside(root, args.path);
      const buf = await fs.readFile(file);
      return buf.length > MAX_READ_BYTES ? `${buf.subarray(0, MAX_READ_BYTES).toString('utf8')}\n… (cut at ${MAX_READ_BYTES} bytes)` : buf.toString('utf8');
    }
    if (name === 'write_file') {
      const file = inside(root, args.path);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, String(args.content ?? ''));
      return `Wrote ${path.relative(root, file)} (${Buffer.byteLength(String(args.content ?? ''))} bytes).`;
    }
    return undefined;
  };
  return { definitions, names: new Set(definitions.map((d) => d.function.name)), call };
}

/** MCP tool content as text: text parts kept, images and resources named. */
export function mcpResultText(result) {
  const parts = [];
  for (const c of result?.content ?? []) {
    if (c.type === 'text') parts.push(c.text);
    else if (c.type === 'image') parts.push(`[image: ${c.mimeType ?? 'image'}, not shown]`);
    else if (c.type === 'resource') parts.push(c.resource?.text ?? `[resource ${c.resource?.uri ?? ''}]`);
    else if (c.type === 'resource_link') parts.push(`[resource ${c.uri}]`);
  }
  if (parts.length === 0 && result?.structuredContent) parts.push(JSON.stringify(result.structuredContent));
  const text = parts.join('\n\n') || '(no output)';
  return result?.isError ? `Error: ${text}` : text;
}

/** MCP tools as chat-completion function tools. */
export function mcpToFunctions(tools) {
  return tools
    .filter((t) => !HIDDEN_KIT_TOOLS.has(t.name))
    .map((t) => ({ type: 'function', function: { name: t.name, description: t.description ?? t.title ?? '', parameters: t.inputSchema ?? { type: 'object', properties: {} } } }));
}

/** The plugin's main skill without its frontmatter: what Claude Code would load for a design request. */
export async function kitSystemPrompt(repoRoot) {
  const file = path.join(repoRoot, 'packages', 'claude-plugin', 'skills', 'open-design', 'SKILL.md');
  const text = await fs.readFile(file, 'utf8');
  return text.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

/** Starts this checkout's MCP server on the workspace and connects to it. */
export async function connectKit({ serverPath, workspace, env }) {
  if (!existsSync(serverPath)) throw new Error(`${serverPath} is missing: compile packages/mcp-server first.`);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: workspace,
    env: { ...env, OPEN_DESIGN_WORKSPACE_ROOT: workspace, OPEN_DESIGN_EVALS: '1', OPEN_DESIGN_ALLOW_HOSTS: '127.0.0.1' },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'open-design-evals', version: '1.0.0' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  return {
    definitions: mcpToFunctions(tools),
    names: new Set(tools.filter((t) => !HIDDEN_KIT_TOOLS.has(t.name)).map((t) => t.name)),
    call: async (name, args) => mcpResultText(await client.callTool({ name, arguments: args }, undefined, { timeout: 10 * 60_000 })),
    close: () => client.close(),
  };
}

// ---------------------------------------------------------------- loop

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Runs one user turn: sends the conversation, runs every tool call the model
 * makes, and repeats until it answers without tools or hits maxTurns.
 * Mutates and returns `messages`; `log` gets one JSON line per event.
 */
export async function runTurn({ endpoint, messages, toolsets, maxTurns, log = () => {} }) {
  const definitions = toolsets.flatMap((t) => t.definitions);
  const texts = [];
  const toolUses = [];
  const usage = { prompt: 0, completion: 0 };
  let turns = 0;
  let finalText = '';
  while (true) {
    if (turns >= maxTurns) return { texts, toolUses, usage, turns, finalText, error: `stopped at the ${maxTurns}-turn cap` };
    turns++;
    const response = await chatCompletion({ ...endpoint, messages, tools: definitions });
    usage.prompt += response.usage?.prompt_tokens ?? 0;
    usage.completion += response.usage?.completion_tokens ?? 0;
    const message = response.choices[0].message;
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    messages.push({ role: 'assistant', content: message.content ?? '', ...(calls.length ? { tool_calls: calls } : {}) });
    if (typeof message.content === 'string' && message.content.trim()) {
      texts.push(message.content);
      finalText = message.content;
    }
    log({ type: 'assistant', content: message.content ?? '', tool_calls: calls, usage: response.usage });
    if (calls.length === 0) return { texts, toolUses, usage, turns, finalText };
    for (const call of calls) {
      const name = call.function?.name;
      const args = parseArgs(call.function?.arguments);
      let output;
      if (args === undefined) output = 'Error: the arguments were not valid JSON. Send the call again with valid JSON arguments.';
      else {
        toolUses.push({ name, input: args });
        const set = toolsets.find((t) => t.names.has(name));
        try {
          output = set ? await set.call(name, args) : `Error: there is no tool named ${name}.`;
        } catch (err) {
          output = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      const content = output.length > MAX_TOOL_RESULT_CHARS ? `${output.slice(0, MAX_TOOL_RESULT_CHARS)}\n… (cut at ${MAX_TOOL_RESULT_CHARS} characters)` : output;
      messages.push({ role: 'tool', tool_call_id: call.id, content });
      log({ type: 'tool', name, input: args, output: content.slice(0, 2000) });
    }
  }
}
