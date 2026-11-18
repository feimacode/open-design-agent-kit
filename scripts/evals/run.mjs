#!/usr/bin/env -S npx tsx
// Runs the Open Design eval briefs (openspec add-output-quality-evals)
// headless, one fresh temporary workspace per brief and repeat, then scores
// every design with scripts/evals/score.mjs and appends a section to
// evals/RESULTS.md. Two drivers:
//   --agent claude (default)  Claude Code with this checkout's plugin and MCP server
//   --agent api               the runner's own loop over an OpenAI-compatible
//                             /chat/completions endpoint (scripts/evals/apiAgent.mjs),
//                             with or without the kit (--arm kit|bare|both)
//
//   npm run evals                                 every brief, twice
//   npm run evals -- --only gig-poster --repeat 1 one quick look
//   npm run evals -- --agent api --arm both       with vs without the kit (EVALS_BASE_URL, EVALS_MODEL, EVALS_API_KEY)
//   npm run evals -- --score-only <dir>           score designs made elsewhere (Desktop, Codex)
//
// Costs model tokens: run it by hand before and after a quality change, not in CI.
import { spawn } from 'node:child_process';
import * as http from 'node:http';
import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  appendResults,
  browserEnv,
  countQuestions,
  EVALS_DIR,
  loadBriefs,
  htmlFiles,
  parseTranscript,
  registeredDesigns,
  REPO_ROOT,
  scoreOnly,
  scoreTable,
  scoreWorkspace,
  summary,
  writeContactSheet,
} from './score.mjs';
import { armComparison, bareEligible, caseVerdict, siteContentType } from './lib.mjs';
import { connectKit, fileTools, kitSystemPrompt, runTurn } from './apiAgent.mjs';

const DEFAULTS = { repeat: 2, model: 'claude-sonnet-5-5', maxTurns: 80, maxRounds: 3, roundTimeoutMinutes: 20 };
// The api loop's endpoint, model and key come only from the environment, so a
// run, a workflow and a local shell are configured the same way.
const API_ENV = {
  EVALS_BASE_URL: 'the OpenAI-compatible base URL, e.g. https://api.cline.bot/api/v1',
  EVALS_MODEL: 'the model id at that endpoint, e.g. cline-pass/glm-5.3',
  EVALS_API_KEY: "the endpoint's key",
};

// What the api loop adds for its own file tools, in both arms.
const API_FILE_PROMPT = 'You have list_files, read_file and write_file for the working folder; paths are relative to it.';
// Only the arm without the kit is told where a design goes, so its pages can be found and checked.
const BARE_PROMPT = 'Make each design as a self-contained HTML page and save it in the working folder with write_file.';

// The only thing the agent is told beyond the request: there is no one to click a picker.
const EVAL_SYSTEM_PROMPT =
  'There is no interactive user in this session. If you need to ask the user something, ask it in your reply as plain text and end your turn; their answer arrives as the next message. Work in the current directory.';

// Variables of a parent Claude Code session that would make the child think it is that session.
const PARENT_SESSION_ENV = ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_REMOTE_SESSION_ID', 'CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES', 'CLAUDE_CODE_ENTRYPOINT'];

const ACCOUNT_ERROR = /session limit|usage limit|rate limit|log ?in|authenticat|credit balance/i;

const USAGE = `Usage: npm run evals -- [options]
  --only <id,...>         Run only these briefs
  --repeat <n>            Runs per brief (default ${DEFAULTS.repeat})
  --agent <claude|api>    Claude Code (default), or the runner's own loop over an OpenAI-compatible endpoint
  --arm <kit|bare|both>   api only: with the kit (default), without it (file tools only), or both; the bare arm skips
                          briefs with an app, a site or follow-ups
  --model <id>            claude only: model for every run (default ${DEFAULTS.model})
  The api agent is configured only by environment variables:
${Object.entries(API_ENV).map(([k, v]) => `    ${k.padEnd(20)}${v}`).join('\n')}
  --max-turns <n>         Agent turn cap per round (default ${DEFAULTS.maxTurns})
  --max-budget-usd <n>    Spend cap per round
  --plugin <dir>          Plugin directory to load as-is (default: this checkout's plugin with the local MCP server)
  --no-build              Don't compile packages/mcp-server first
  --browser <path>        Browser for checks (default: OPEN_DESIGN_BROWSER_PATH, then auto-detect)
  --label <text>          Heading suffix in RESULTS.md, e.g. "before add-taste-checks"
  --no-results            Don't append to evals/RESULTS.md
  --dry-run               Print what would run, run nothing
  --score-only <dir>      Score designs already made (a workspace or a folder of workspaces); no agent run`;

function parseArgs(argv) {
  const out = { ...DEFAULTS, model: undefined, agent: 'claude', arm: 'kit', build: true, results: true };
  const next = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    return v;
  };
  const positive = (v, flag) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive whole number (got "${v}")`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') out.only = next(i++, a).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--repeat') out.repeat = positive(next(i++, a), a);
    else if (a === '--model') out.model = next(i++, a);
    else if (a === '--max-turns') out.maxTurns = positive(next(i++, a), a);
    else if (a === '--max-budget-usd') out.maxBudgetUsd = next(i++, a);
    else if (a === '--plugin') out.plugin = path.resolve(next(i++, a));
    else if (a === '--browser') out.browser = next(i++, a);
    else if (a === '--label') out.label = next(i++, a);
    else if (a === '--score-only') out.scoreOnly = next(i++, a);
    else if (a === '--no-build') out.build = false;
    else if (a === '--no-results') out.results = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--agent') {
      out.agent = next(i++, a);
      if (!['claude', 'api'].includes(out.agent)) throw new Error(`--agent is claude or api (got "${out.agent}"); score other hosts' designs with --score-only.`);
    } else if (a === '--arm') {
      out.arm = next(i++, a);
      if (!['kit', 'bare', 'both'].includes(out.arm)) throw new Error(`--arm is kit, bare or both (got "${out.arm}")`);
    } else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument ${a}\n${USAGE}`);
  }
  if (out.agent === 'claude' && out.arm !== 'kit') throw new Error('--arm bare and both need --agent api: Claude Code always loads its own tools.');
  if (out.agent === 'api') {
    if (out.model) throw new Error('--agent api takes its model from EVALS_MODEL, not --model.');
    out.model = process.env.EVALS_MODEL?.trim() || undefined;
    out.baseUrl = process.env.EVALS_BASE_URL?.trim() || undefined;
    const missing = Object.keys(API_ENV).filter((k) => !process.env[k]?.trim());
    if (missing.length && !out.help && !out.scoreOnly) throw new Error(`--agent api needs ${missing.join(', ')}:\n${missing.map((k) => `  ${k}: ${API_ENV[k]}`).join('\n')}`);
    if (out.baseUrl && !/^https?:\/\//.test(out.baseUrl)) throw new Error(`EVALS_BASE_URL must start with http:// or https:// (got "${out.baseUrl}").`);
  } else out.model ??= DEFAULTS.model;
  return out;
}

function exec(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = options.timeoutMs ? setTimeout(() => ((timedOut = true), child.kill('SIGTERM')), options.timeoutMs) : undefined;
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err), timedOut }));
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** This checkout's plugin (skills as they are on disk) wired to the locally built MCP server, so a run measures this code, not the published package. */
async function localPlugin(runDir) {
  const source = path.join(REPO_ROOT, 'packages', 'claude-plugin');
  const server = path.join(REPO_ROOT, 'packages', 'mcp-server', 'out', 'index.js');
  if (!existsSync(server)) throw new Error(`${path.relative(REPO_ROOT, server)} is missing: run without --no-build, or npm run compile --workspace=packages/mcp-server.`);
  const dir = path.join(runDir, 'plugin');
  await fs.mkdir(path.join(dir, '.claude-plugin'), { recursive: true });
  await fs.copyFile(path.join(source, '.claude-plugin', 'plugin.json'), path.join(dir, '.claude-plugin', 'plugin.json'));
  for (const sub of ['skills', 'agents']) {
    if (existsSync(path.join(source, sub))) await fs.symlink(path.join(source, sub), path.join(dir, sub), 'dir');
  }
  // OPEN_DESIGN_EVALS lets the site audit load the fixture sites this runner serves on 127.0.0.1 (briefs with `site:`).
  const mcp = { mcpServers: { 'open-design': { command: process.execPath, args: [server], env: { OPEN_DESIGN_LAUNCHER: 'claude-plugin', OPEN_DESIGN_EVALS: '1', OPEN_DESIGN_ALLOW_HOSTS: '127.0.0.1' } } } };
  await fs.writeFile(path.join(dir, '.mcp.json'), JSON.stringify(mcp, null, 2) + '\n');
  return dir;
}

/** Serves a fixture folder on 127.0.0.1 at a random port. */
async function serveSite(dir) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(dir, rel.endsWith('/') ? `${rel}index.html` : rel);
    if (!file.startsWith(dir + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file)
      .then((body) => {
        res.writeHead(200, { 'content-type': siteContentType(file) });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(404);
        res.end();
      });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

/** What the "user" says when the agent asks: the brief's answers, then "you pick" for the rest. */
export function answerMessage(brief) {
  const answers = Object.entries(brief.answers ?? {}).map(([key, value]) => `- ${key}: ${value}`);
  return [answers.length ? 'Here are my answers:' : undefined, ...answers, 'For anything else, you pick. Please go ahead and make it.'].filter(Boolean).join('\n');
}


/** One brief, one repeat: up to maxRounds agent turns in a fresh workspace, answering questions in between. */
async function runBrief(brief, repeat, ctx) {
  const caseDir = path.join(ctx.runDir, `${brief.id}-${repeat}`);
  await fs.mkdir(caseDir, { recursive: true });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `od-eval-${brief.id}-`));
  // A brief about an existing project (design from your app) starts from a copy of it.
  if (brief.fixture) await fs.cp(path.join(EVALS_DIR, 'fixtures', brief.fixture), tmp, { recursive: true });
  // A brief about a live website (site audit, redesign) gets a fixture site served on 127.0.0.1 for the run.
  const site = brief.site ? await serveSite(path.join(EVALS_DIR, 'fixtures', brief.site)) : undefined;
  const transcriptFile = path.join(caseDir, 'transcript.jsonl');
  const started = Date.now();
  let sessionId;
  let questions = 0;
  let costUsd = 0;
  let error;
  let rounds = 0;
  let message = site ? brief.request.replaceAll('{{site}}', site.url) : brief.request;
  const texts = [];
  const toolUses = [];
  while (rounds < ctx.maxRounds) {
    rounds++;
    const args = ['-p', message, '--output-format', 'stream-json', '--verbose', '--model', ctx.model, '--max-turns', String(ctx.maxTurns), '--plugin-dir', ctx.plugin, '--permission-mode', 'bypassPermissions', '--setting-sources', 'project', '--append-system-prompt', EVAL_SYSTEM_PROMPT, '--disallowedTools', 'AskUserQuestion'];
    if (ctx.maxBudgetUsd) args.push('--max-budget-usd', ctx.maxBudgetUsd);
    if (sessionId) args.push('--resume', sessionId);
    const res = await exec('claude', args, { cwd: tmp, env: ctx.agentEnv, timeoutMs: DEFAULTS.roundTimeoutMinutes * 60_000 });
    await fs.appendFile(transcriptFile, res.stdout);
    const t = parseTranscript(res.stdout);
    texts.push(...t.texts);
    toolUses.push(...t.toolUses);
    sessionId = t.result?.session_id ?? sessionId;
    costUsd += t.result?.total_cost_usd ?? 0;
    if (res.timedOut) error = `round ${rounds} timed out`;
    else if (!t.result) error = `claude exited ${res.code}: ${res.stderr.trim().split('\n').slice(-2).join(' ') || 'no result'}`;
    else if (t.result.is_error) error = String(t.result.result || t.result.subtype || 'agent error').trim();
    // Done once something was built, registered or not (an unregistered page is scored as "no design").
    if (error || (await registeredDesigns(tmp)).length > 0 || (await htmlFiles(tmp)).length > 0) break;
    // Nothing built, so the agent stopped to ask for something. Count its questions (at least one:
    // "I need the 12 dishes" is a question without a "?") and answer them.
    questions += Math.max(1, countQuestions(t.result.result ?? t.texts.at(-1) ?? ''));
    message = answerMessage(brief);
  }
  // Later turns of the same conversation, once a design exists (openspec add-steering-edits).
  for (const followUp of !error && sessionId ? (brief.followUps ?? []) : []) {
    rounds++;
    const args = ['-p', followUp, '--output-format', 'stream-json', '--verbose', '--model', ctx.model, '--max-turns', String(ctx.maxTurns), '--plugin-dir', ctx.plugin, '--permission-mode', 'bypassPermissions', '--setting-sources', 'project', '--append-system-prompt', EVAL_SYSTEM_PROMPT, '--disallowedTools', 'AskUserQuestion', '--resume', sessionId];
    if (ctx.maxBudgetUsd) args.push('--max-budget-usd', ctx.maxBudgetUsd);
    const res = await exec('claude', args, { cwd: tmp, env: ctx.agentEnv, timeoutMs: DEFAULTS.roundTimeoutMinutes * 60_000 });
    await fs.appendFile(transcriptFile, res.stdout);
    const t = parseTranscript(res.stdout);
    texts.push(...t.texts);
    toolUses.push(...t.toolUses);
    sessionId = t.result?.session_id ?? sessionId;
    costUsd += t.result?.total_cost_usd ?? 0;
    if (res.timedOut) error = `follow-up "${followUp}" timed out`;
    else if (!t.result) error = `claude exited ${res.code} on a follow-up: ${res.stderr.trim().split('\n').slice(-2).join(' ') || 'no result'}`;
    else if (t.result.is_error) error = String(t.result.result || t.result.subtype || 'agent error').trim();
    if (error) break;
  }
  site?.close();
  const wallSeconds = (Date.now() - started) / 1000;
  const workspace = path.join(caseDir, 'workspace');
  await fs.cp(tmp, workspace, { recursive: true, filter: (src) => !src.split(path.sep).includes('node_modules') });
  await fs.rm(tmp, { recursive: true, force: true });
  const score = await scoreWorkspace({
    workspaceRoot: workspace,
    shotsDir: path.join(caseDir, 'shots'),
    brief,
    env: ctx.checkEnv,
    run: { repeat, transcript: { texts, toolUses }, questions, rounds, wallSeconds, costUsd, error },
  });
  await fs.writeFile(path.join(caseDir, 'score.json'), JSON.stringify(score, null, 2) + '\n');
  return score;
}

/** The same as runBrief, through the runner's own loop over a chat-completions endpoint; arm "bare" runs without the kit. */
async function runBriefApi(brief, repeat, arm, ctx) {
  const caseDir = path.join(ctx.runDir, `${brief.id}${arm === 'bare' ? '-bare' : ''}-${repeat}`);
  await fs.mkdir(caseDir, { recursive: true });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `od-eval-${brief.id}-`));
  if (brief.fixture) await fs.cp(path.join(EVALS_DIR, 'fixtures', brief.fixture), tmp, { recursive: true });
  const site = brief.site ? await serveSite(path.join(EVALS_DIR, 'fixtures', brief.site)) : undefined;
  const transcriptFile = path.join(caseDir, 'transcript.jsonl');
  const log = (event) => fs.appendFile(transcriptFile, JSON.stringify(event) + '\n').catch(() => {});
  const started = Date.now();
  const files = fileTools(tmp);
  let kit;
  let questions = 0;
  let error;
  let rounds = 0;
  const texts = [];
  const toolUses = [];
  const tokens = { prompt: 0, completion: 0 };
  try {
    const toolsets = [files];
    if (arm === 'kit') {
      kit = await connectKit({ serverPath: ctx.server, workspace: tmp, env: ctx.agentEnv });
      toolsets.push(kit);
    }
    const system = [EVAL_SYSTEM_PROMPT, API_FILE_PROMPT, arm === 'kit' ? ctx.kitPrompt : BARE_PROMPT].join('\n\n');
    const messages = [{ role: 'system', content: system }];
    const turn = async (content) => {
      rounds++;
      messages.push({ role: 'user', content });
      await log({ type: 'user', content });
      const t = await Promise.race([
        runTurn({ endpoint: ctx.endpoint, messages, toolsets, maxTurns: ctx.maxTurns, log }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`round ${rounds} timed out`)), DEFAULTS.roundTimeoutMinutes * 60_000).unref()),
      ]);
      texts.push(...t.texts);
      toolUses.push(...t.toolUses);
      tokens.prompt += t.usage.prompt;
      tokens.completion += t.usage.completion;
      return t;
    };
    const built = async () => (arm === 'kit' && (await registeredDesigns(tmp)).length > 0) || (await htmlFiles(tmp)).length > 0;
    let message = site ? brief.request.replaceAll('{{site}}', site.url) : brief.request;
    while (rounds < ctx.maxRounds) {
      const t = await turn(message);
      if (t.error) error = t.error;
      if (error || (await built())) break;
      questions += Math.max(1, countQuestions(t.finalText));
      message = answerMessage(brief);
    }
    for (const followUp of !error && arm === 'kit' ? (brief.followUps ?? []) : []) {
      const t = await turn(followUp);
      if (t.error) error = t.error;
      if (error) break;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    await kit?.close().catch(() => {});
    site?.close();
  }
  const wallSeconds = (Date.now() - started) / 1000;
  const workspace = path.join(caseDir, 'workspace');
  await fs.cp(tmp, workspace, { recursive: true, filter: (src) => !src.split(path.sep).includes('node_modules') });
  await fs.rm(tmp, { recursive: true, force: true });
  const score = await scoreWorkspace({
    workspaceRoot: workspace,
    shotsDir: path.join(caseDir, 'shots'),
    brief,
    env: ctx.checkEnv,
    run: { repeat, arm, transcript: { texts, toolUses }, questions, rounds, wallSeconds, tokens, error },
  });
  await fs.writeFile(path.join(caseDir, 'score.json'), JSON.stringify(score, null, 2) + '\n');
  return score;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(USAGE);
  if (args.scoreOnly) return void (await scoreOnly(args.scoreOnly, { label: args.label, writeResults: args.results, browser: args.browser }));

  const briefs = await loadBriefs();
  const unknown = (args.only ?? []).filter((id) => !briefs.some((b) => b.id === id));
  if (unknown.length) throw new Error(`Unknown brief(s): ${unknown.join(', ')}. Briefs: ${briefs.map((b) => b.id).join(', ')}`);
  const selected = args.only ? briefs.filter((b) => args.only.includes(b.id)) : briefs;
  const arms = args.arm === 'both' ? ['kit', 'bare'] : [args.arm];
  const plan = selected.flatMap((b) => arms.filter((arm) => arm === 'kit' || bareEligible(b)).flatMap((arm) => Array.from({ length: args.repeat }, (_, i) => [b, i + 1, arm])));
  if (plan.length === 0) throw new Error('Nothing to run: the arm without the kit skips briefs with an app, a site or follow-ups.');
  if (args.dryRun) {
    console.log(`${plan.length} run(s) with ${args.model}${args.agent === 'api' ? ` at ${args.baseUrl}` : ''}, at most ${args.maxTurns} turns and ${DEFAULTS.maxRounds} rounds each:`);
    for (const [b, r, arm] of plan) console.log(`- ${b.id}${arm === 'bare' ? ' (no kit)' : ''} #${r}: ${b.request}`);
    return;
  }

  let mode;
  if (args.agent === 'claude') {
    const version = await exec('claude', ['--version']);
    if (version.code !== 0) throw new Error('Claude Code (`claude`) is not on PATH. Install it, use --agent api, or score designs made elsewhere with --score-only <dir>.');
    mode = `agent claude (${version.stdout.trim()}), repeat ${args.repeat}`;
  } else {
    mode = `api loop (${new URL(args.baseUrl).host}), ${arms.length > 1 ? 'with and without the kit' : arms[0] === 'kit' ? 'with the kit' : 'without the kit'}, repeat ${args.repeat}`;
  }
  const runDir = path.join(EVALS_DIR, 'runs', new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'));
  await fs.mkdir(runDir, { recursive: true });
  if (args.build && !args.plugin) {
    console.error('Compiling packages/mcp-server…');
    const built = await exec('npm', ['run', 'compile', '--workspace=packages/mcp-server'], { cwd: REPO_ROOT });
    if (built.code !== 0) throw new Error(`Compiling the MCP server failed:\n${built.stderr || built.stdout}`);
  }
  const plugin = args.agent === 'claude' ? (args.plugin ?? (await localPlugin(runDir))) : undefined;
  const { env: checkEnv, browserPath, problem } = await browserEnv(runDir, args.browser);
  if (problem) console.error(`Browser: ${problem} Checks will fail until one is found.`);
  const agentEnv = { ...checkEnv };
  for (const key of PARENT_SESSION_ENV) delete agentEnv[key];
  const ctx = { runDir, plugin, model: args.model, maxTurns: args.maxTurns, maxRounds: DEFAULTS.maxRounds, maxBudgetUsd: args.maxBudgetUsd, agentEnv, checkEnv };
  if (args.agent === 'api') {
    ctx.endpoint = { baseUrl: args.baseUrl, apiKey: process.env.EVALS_API_KEY.trim(), model: args.model };
    ctx.server = path.join(REPO_ROOT, 'packages', 'mcp-server', 'out', 'index.js');
    ctx.kitPrompt = await kitSystemPrompt(REPO_ROOT);
  }
  const briefsById = new Map(briefs.map((b) => [b.id, b]));

  const scores = [];
  for (const [brief, repeat, arm] of plan) {
    console.error(`[${scores.length + 1}/${plan.length}] ${brief.id}${arm === 'bare' ? ' (no kit)' : ''} #${repeat}…`);
    const score = args.agent === 'api' ? await runBriefApi(brief, repeat, arm, ctx) : await runBrief(brief, repeat, ctx);
    const verdict = caseVerdict(score, brief);
    console.error(`  ${verdict.pass ? 'PASS' : 'FAIL'}: ${score.designs.length} design(s), ${score.questions ?? 0} question(s), ${Math.round(score.wallSeconds)}s${verdict.reasons.length ? `; ${verdict.reasons.join('; ')}` : ''}`);
    scores.push(score);
    // A usage limit or sign-in problem fails every later run the same way: stop instead of recording noise.
    if (score.designs.length === 0 && ACCOUNT_ERROR.test(score.agentError ?? '')) throw new Error(`The agent can't run: ${score.agentError}. Nothing was appended to RESULTS.md; try again later.`);
  }
  await fs.writeFile(path.join(runDir, 'scores.json'), JSON.stringify(scores, null, 2) + '\n');
  const contactSheet = await writeContactSheet(scores, path.join(runDir, 'contact-sheet.png'), browserPath);
  const comparison = armComparison(scores, briefsById);
  console.log(summary(scores));
  if (comparison) console.log(`\n${comparison}`);
  console.log(scoreTable(scores, briefsById));
  if (args.results) {
    const file = await appendResults({ scores, briefs, mode, model: args.model, label: args.label, contactSheet, runDir });
    console.log(`\nAppended to ${file}`);
  }
  // In GitHub Actions, the same numbers on the run's summary page.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`## Evals${args.label ? `: ${args.label}` : ''}`, '', `- Mode: ${mode}, model ${args.model}`, summary(scores), '', ...(comparison ? [comparison, ''] : []), scoreTable(scores, briefsById), ''];
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  }
}

try {
  await main();
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
