#!/usr/bin/env node
// Automates the exact manual test this repo's npm-publish path was
// verified with: start a local (throwaway) npm registry, really `npm
// publish` all three publishable packages to it, then — from a directory
// with zero access to this monorepo's own node_modules — really `npx`
// resolve them and exercise them for real. This is the one check that
// would have caught the original "packages/content is private, so
// packages/mcp-server can never actually resolve it once published" bug;
// `npm pack --dry-run` alone does not exercise cross-package dependency
// resolution at all.
//
// Runs identically locally and in CI — no CI-specific branching. Exits
// non-zero (with a clear message) on any failure, so it's a real gate:
// see openspec/changes/npm-publish-automation/design.md Decision 2.
//
// Usage: node scripts/test-npm-publish.mjs
// Precondition: packages/content, packages/mcp-server, packages/cli are
// already built (out/ present) — this script does not build them; run
// `npm run compile --workspaces --if-present` first if needed. If testing
// the real release pin (see pin-content-version-for-publish.mjs), run that
// script first too — this one works either way, it just tests whatever
// package.json currently says.
import { spawn, execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const REGISTRY_PORT = 4873;
const REGISTRY_URL = `http://127.0.0.1:${REGISTRY_PORT}/`;

const PACKAGES_IN_PUBLISH_ORDER = [
  { dir: 'packages/content', name: '@feimacode/open-design-agent-kit-content' },
  { dir: 'packages/mcp-server', name: '@feimacode/open-design-agent-kit-mcp' },
  { dir: 'packages/cli', name: '@feimacode/open-design-agent-kit' },
];

function log(msg) {
  console.log(`[test-npm-publish] ${msg}`);
}

async function withTempDir(prefix, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// `npx --yes verdaccio` has to resolve and install verdaccio (a sizeable
// dependency tree) before the process even starts, on top of the server's
// own startup — 15s was tuned on a machine that already had verdaccio in
// its local npx/npm cache from prior manual testing. A GitHub Actions
// runner is always a clean VM with an empty npx cache: measured directly
// (npx cache cleared, to match), a cold `npx --yes verdaccio --version`
// alone took ~19.5s here, before the actual server has even bound its
// port — meaning 15000 failed on effectively every CI run, not
// intermittently. 90s leaves real margin for CI runner/registry variance
// while still failing well within a normal step's runtime if something is
// genuinely broken rather than just slow.
async function waitForRegistry(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(REGISTRY_URL);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Local registry did not come up within ${timeoutMs}ms`);
}

async function startRegistry(configDir) {
  const configPath = path.join(configDir, 'config.yaml');
  const storageDir = path.join(configDir, 'storage');
  const htpasswdPath = path.join(configDir, 'htpasswd');
  await fs.mkdir(storageDir, { recursive: true });

  // max_users must be a real positive number, not -1 — verdaccio 6.x
  // rejects self-registration outright with -1 despite some older docs
  // suggesting -1 means "unlimited". Confirmed by hand before automating.
  const config = `storage: ${storageDir}
auth:
  htpasswd:
    file: ${htpasswdPath}
    max_users: 10000
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@feimacode/*':
    access: $all
    publish: $all
    unpublish: $all
  '**':
    access: $all
    publish: $authenticated
    proxy: npmjs
log: { type: stdout, format: pretty, level: warn }
listen: 127.0.0.1:${REGISTRY_PORT}
`;
  await fs.writeFile(configPath, config, 'utf8');

  // `detached: true` (POSIX: setsid()) makes this child the leader of its
  // own process group, so `killProcessGroup` below can kill the whole group —
  // `npx` wraps the real `verdaccio` binary in at least one intermediate
  // process, and a plain `child.kill()` on just the direct child leaves
  // that grandchild running as an orphan. Confirmed by hand: the first run
  // of this script exited cleanly but left a real `verdaccio` process
  // behind (`ps aux` showed it after the script had already logged
  // success) until this fix.
  // The CLI --listen flag overrides config.yaml's `listen: 127.0.0.1:PORT`
  // outright — a bare port number here (no host) previously made verdaccio
  // fall back to binding on "localhost" instead (confirmed by its own
  // startup log: "http address - http://localhost:4873/", not 127.0.0.1),
  // which on a GitHub Actions runner resolved/bound differently than the
  // 127.0.0.1 this script explicitly polls (an IPv4/IPv6 loopback split —
  // the server was healthy the whole time, waitForRegistry just couldn't
  // reach it). Pass the same host:port explicitly here so the CLI and
  // config agree with REGISTRY_URL instead of leaving it to a default.
  const child = spawn('npx', ['--yes', 'verdaccio', '--config', configPath, '--listen', `127.0.0.1:${REGISTRY_PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  // Buffered, not discarded: if waitForRegistry() times out for a reason
  // OTHER than "still installing" (a config error, the registry port
  // already in use, no network access to npmjs for the npx install itself),
  // this is the only place that reason would ever surface — a bare timeout
  // message alone gives no way to tell "still slow" apart from "actually
  // broken" on the next failure.
  let output = '';
  child.stdout.on('data', (d) => (output += d.toString()));
  child.stderr.on('data', (d) => (output += d.toString()));

  try {
    await waitForRegistry();
  } catch (err) {
    killProcessGroup(child);
    const trimmed = output.trim();
    throw new Error(`${err.message}${trimmed ? `\n--- verdaccio output ---\n${trimmed}` : ' (verdaccio produced no output)'}`);
  }
  log('local registry is up');
  return child;
}

function killProcessGroup(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Group already gone, or never had children — fall back to the direct child.
    try {
      child.kill('SIGTERM');
    } catch {
      // Already dead.
    }
  }
}

async function registerThrowawayUser() {
  const res = await fetch(`${REGISTRY_URL}-/user/org.couchdb.user:tester`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _id: 'org.couchdb.user:tester',
      name: 'tester',
      password: 'testerpass123',
      type: 'user',
      roles: [],
      date: new Date().toISOString(),
    }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`Failed to register throwaway registry user: ${JSON.stringify(body)}`);
  log('registered throwaway registry user');
  return body.token;
}

async function publishAllPackages(npmrcPath) {
  for (const pkg of PACKAGES_IN_PUBLISH_ORDER) {
    log(`publishing ${pkg.name}...`);
    execFileSync('npm', ['publish', '--userconfig', npmrcPath, '--registry', REGISTRY_URL], {
      cwd: path.join(repoRoot, pkg.dir),
      stdio: 'inherit',
    });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function testMcpServerResolution(scratchDir) {
  await fs.writeFile(path.join(scratchDir, '.npmrc'), `registry=${REGISTRY_URL}\n`, 'utf8');

  // detached: true for the same reason as startRegistry() above — npx
  // wraps the real server binary in an intermediate process, so cleanup
  // needs to target the whole process group, not just this direct child.
  const child = spawn('npx', ['--yes', '@feimacode/open-design-agent-kit-mcp'], {
    cwd: scratchDir,
    env: { ...process.env, npm_config_registry: REGISTRY_URL },
    stdio: ['pipe', 'pipe', 'inherit'],
    detached: true,
  });

  const results = [];
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) {
        try {
          results.push(JSON.parse(line));
        } catch {
          // non-JSON stdout noise, ignore
        }
      }
    }
  });

  // Waits for a response with this exact id to actually show up in
  // `results`, instead of the fixed-delay sleeps this replaced — those
  // guessed a delay long enough for the server to respond (1500ms for
  // tools/call), but `list_open_design_skills` parses ~1,100+ vendored
  // files with gray-matter on its first call, and how long that legitimately
  // takes varies with machine/CI load. A short, fixed sleep is a race: it
  // passed most of the time locally, but failed outright roughly 1 run in 5
  // in this same environment with the exact same content — see the
  // "returned no entries" failure this replaced (the response just hadn't
  // arrived yet when the process was killed, not a real resolution bug).
  async function waitForResponse(id, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = results.find((r) => r.id === id);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`No response for request id ${id} within ${timeoutMs}ms`);
  }

  const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n');
  try {
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'ci-smoke-test', version: '0' } } });
    const init = await waitForResponse(1);

    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const list = await waitForResponse(2);

    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_open_design_skills', arguments: { query: 'landing' } } });
    const call = await waitForResponse(3);

    assert(init?.result?.serverInfo?.name === 'open-design', 'initialize did not return the expected serverInfo');
    assert(list?.result?.tools?.length === 9, `expected 9 tools, got ${list?.result?.tools?.length}`);
    const callText = call?.result?.content?.[0]?.text;
    const parsedCall = callText ? JSON.parse(callText) : undefined;
    assert(Array.isArray(parsedCall) && parsedCall.length > 0, 'list_open_design_skills returned no entries');
    log(`mcp-server resolution + handshake OK (${list.result.tools.length} tools, ${parsedCall.length} entries for query "landing")`);
  } finally {
    killProcessGroup(child);
  }
}

async function testCliInit(scratchDir) {
  await fs.writeFile(path.join(scratchDir, '.npmrc'), `registry=${REGISTRY_URL}\n`, 'utf8');
  execFileSync('npx', ['--yes', '@feimacode/open-design-agent-kit', 'init', '.', '--tools', 'all'], {
    cwd: scratchDir,
    env: { ...process.env, npm_config_registry: REGISTRY_URL },
    stdio: 'inherit',
  });

  const claudeSkills = await fs.readdir(path.join(scratchDir, '.claude', 'skills'));
  const codexSkills = await fs.readdir(path.join(scratchDir, '.agents', 'skills'));
  assert(claudeSkills.length === 24, `expected 24 Claude skills, got ${claudeSkills.length}`);
  assert(codexSkills.length === 24, `expected 24 Codex skills, got ${codexSkills.length}`);
  assert(
    JSON.parse(await fs.readFile(path.join(scratchDir, '.mcp.json'), 'utf8')).mcpServers['open-design'],
    '.mcp.json missing the open-design entry',
  );
  await fs.access(path.join(scratchDir, '.codex', 'config.toml'));
  log('cli init OK (24 skills per host, .mcp.json and .codex/config.toml written)');
}

async function main() {
  await withTempDir('od-registry-', async (registryDir) => {
    const registryProcess = await startRegistry(registryDir);
    try {
      const token = await registerThrowawayUser();
      await withTempDir('od-npmrc-', async (npmrcDir) => {
        const npmrcPath = path.join(npmrcDir, '.npmrc');
        await fs.writeFile(npmrcPath, `registry=${REGISTRY_URL}\n//127.0.0.1:${REGISTRY_PORT}/:_authToken=${token}\n`, 'utf8');

        await publishAllPackages(npmrcPath);

        await withTempDir('od-fresh-mcp-', (scratchDir) => testMcpServerResolution(scratchDir));
        await withTempDir('od-fresh-cli-', (scratchDir) => testCliInit(scratchDir));
      });
    } finally {
      killProcessGroup(registryProcess);
    }
  });

  log('ALL CHECKS PASSED');
}

main().catch((err) => {
  console.error(`[test-npm-publish] FAILED: ${err.message}`);
  process.exit(1);
});
