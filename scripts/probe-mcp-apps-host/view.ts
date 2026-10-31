/// <reference lib="dom" />
// The probe's view (openspec chatgpt-mcp-apps-compat): connects with the
// MCP Apps App class the kit's preview uses, records what the host offers,
// tries a srcdoc iframe with an inline script, measures the largest tool
// result it can receive, and reports it all through probe_report.
import { App } from '@modelcontextprotocol/ext-apps';

const out = document.getElementById('out') as HTMLPreElement;
const lines: string[] = [];
const say = (text: string) => {
  lines.push(text);
  out.textContent = lines.join('\n');
};

const app = new App({ name: 'Open Design probe', version: '0.1.0' });
const report: Record<string, unknown> = { startedAt: new Date().toISOString(), userAgent: navigator.userAgent };
const openai = (window as unknown as { openai?: Record<string, unknown> }).openai;
report.windowOpenai = openai ? Object.keys(openai).sort() : null;

let toolResultSeen = false;
app.ontoolresult = () => {
  toolResultSeen = true;
};

function srcdocRuns(): Promise<boolean> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1px;height:1px;border:0';
    const timer = setTimeout(() => resolve(false), 3000);
    window.addEventListener('message', function onMsg(e) {
      if (e.data === 'od-probe-srcdoc-ok') {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(true);
      }
    });
    frame.srcdoc = '<!doctype html><script>parent.postMessage("od-probe-srcdoc-ok","*")</script>';
    document.body.appendChild(frame);
  });
}

async function largestPayload(): Promise<{ ok: number; failedAt?: number; error?: string }> {
  let ok = 0;
  for (const bytes of [1_000, 50_000, 100_000, 150_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000]) {
    try {
      const result = await app.callServerTool({ name: 'probe_payload', arguments: { bytes } });
      const text = (result.content ?? []).map((c) => ('text' in c ? String(c.text) : '')).join('');
      if (text.length < bytes) return { ok, failedAt: bytes, error: `got ${text.length} of ${bytes} characters` };
      ok = bytes;
      say(`payload ${bytes.toLocaleString()} characters: ok`);
    } catch (err) {
      return { ok, failedAt: bytes, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok };
}

async function run(): Promise<void> {
  say('Connecting…');
  try {
    await app.connect();
    report.connected = true;
  } catch (err) {
    report.connected = false;
    report.connectError = err instanceof Error ? err.message : String(err);
    say(`Couldn't connect: ${report.connectError}`);
  }
  report.hostVersion = app.getHostVersion();
  report.hostCapabilities = app.getHostCapabilities();
  report.hostContext = app.getHostContext();
  say(`host: ${JSON.stringify(report.hostVersion)}`);
  say(`display modes: ${JSON.stringify((report.hostContext as { availableDisplayModes?: unknown } | undefined)?.availableDisplayModes ?? null)}`);
  report.srcdocInlineScriptRuns = await srcdocRuns();
  say(`srcdoc inline script runs: ${report.srcdocInlineScriptRuns}`);
  report.payload = await largestPayload();
  report.toolResultNotificationSeen = toolResultSeen;
  try {
    await app.updateModelContext({ content: [{ type: 'text', text: 'Open Design probe ran.' }] });
    report.updateModelContext = 'ok';
  } catch (err) {
    report.updateModelContext = err instanceof Error ? err.message : String(err);
  }
  try {
    const result = await app.callServerTool({ name: 'probe_report', arguments: { report } });
    say((result.content?.[0] as { text?: string } | undefined)?.text ?? 'Saved.');
    say('Done.');
  } catch (err) {
    say(`Couldn't save the report: ${err instanceof Error ? err.message : String(err)}`);
    say(JSON.stringify(report, null, 2));
  }
}

void run();
