// A collection as one self-contained, clickable HTML file (openspec
// add-linked-flows): every screen inlined, links switch screens.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { bundleStandaloneHtml } from '../vendored/standaloneHtml';
import { loadCollectionFlow } from './collectionFlow';
import { resolveIncludes } from './flowIncludes';
import { workspaceAssetReader } from './workspaceAssets';

const PROTOTYPE_NAV_SCRIPT = `<script data-od-prototype>(function(){document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-od-goto],a[href]');if(!a)return;var id=a.getAttribute('data-od-goto');if(!id){var h=a.getAttribute('href')||'';var m=/^(?:\\.\\/)?([^/?#]+)\\.html?(?:[?#].*)?$/i.exec(h);if(!m)return;id=m[1]}e.preventDefault();parent.postMessage({odGoto:id},'*')},true)})();</script>`;

function withNavScript(html: string): string {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${PROTOTYPE_NAV_SCRIPT}</body>`) : html + PROTOTYPE_NAV_SCRIPT;
}

export function prototypeShellHtml(title: string, screens: Array<{ id: string; title: string; html: string }>, start: string): string {
  const data = JSON.stringify(Object.fromEntries(screens.map((s) => [s.id, s.html]))).replace(/</g, '\\u003c');
  const titles = JSON.stringify(Object.fromEntries(screens.map((s) => [s.id, s.title]))).replace(/</g, '\\u003c');
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;background:#111}iframe{display:block;border:0;width:100%;height:100%;background:#fff}
#od-proto-bar{position:fixed;right:12px;bottom:12px;display:flex;gap:6px;font:12px system-ui,sans-serif;z-index:2}
#od-proto-bar button,#od-proto-bar select{font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #888;background:#fff;color:#111}</style></head>
<body><iframe id="od-proto" title="${esc(title)}"></iframe>
<div id="od-proto-bar"><button type="button" id="od-proto-back" aria-label="Back">←</button><select id="od-proto-pick" aria-label="Screen"></select></div>
<script type="application/json" id="od-proto-screens">${data}</script>
<script>(function(){var screens=JSON.parse(document.getElementById('od-proto-screens').textContent);var titles=${titles};var frame=document.getElementById('od-proto');var pick=document.getElementById('od-proto-pick');var stack=[];var current=null;
Object.keys(screens).forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=titles[id]||id;pick.appendChild(o)});
function show(id,push){if(!screens[id])return;if(push&&current)stack.push(current);current=id;frame.srcdoc=screens[id];pick.value=id;try{if(location.hash!=='#'+id)window.history.replaceState(null,'','#'+id)}catch(err){}}
window.addEventListener('message',function(e){if(e.source===frame.contentWindow&&e.data&&typeof e.data.odGoto==='string')show(e.data.odGoto,true)});
pick.addEventListener('change',function(){show(pick.value,true)});document.getElementById('od-proto-back').addEventListener('click',function(){var prev=stack.pop();if(prev)show(prev,false)});
var first=location.hash.slice(1);show(screens[first]?first:${JSON.stringify(start)},false)})();</script>
</body></html>
`;
}

export type CollectionPrototypeResult = { ok: true; output: string; screens: string[]; bytes: number; warnings: string[] } | { ok: false; code: string; error: string };

/** One self-contained HTML file where the collection's links switch screens. */
export async function exportCollectionPrototype(workspaceRoot: string, outputDir: string, collectionId: string): Promise<CollectionPrototypeResult> {
  const flow = await loadCollectionFlow(workspaceRoot, outputDir, collectionId);
  if (!flow) return { ok: false, code: 'not-found', error: `No screens are registered with collectionId "${collectionId}".` };
  const absRoot = path.resolve(workspaceRoot);
  const warnings: string[] = [];
  const out: Array<{ id: string; title: string; html: string }> = [];
  for (const s of flow.screens) {
    if (s.html === undefined) {
      warnings.push(`${s.id}: the file is missing, so it isn't in the prototype.`);
      continue;
    }
    const resolved = await resolveIncludes(s.html, path.join(absRoot, s.entryPath), absRoot);
    if (resolved.missing.length > 0) warnings.push(`${s.id}: couldn't include ${resolved.missing.join(', ')}.`);
    try {
      const bundled = await bundleStandaloneHtml({ entryPath: s.entryPath, html: resolved.html, readAsset: workspaceAssetReader(workspaceRoot) });
      out.push({ id: s.id, title: s.title, html: withNavScript(bundled.html) });
      for (const url of bundled.externalDependencies) warnings.push(`${s.id}: still loads ${url} at view time.`);
    } catch (err) {
      warnings.push(`${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (out.length === 0) return { ok: false, code: 'package-failed', error: 'No screen of the collection could be packaged.' };
  const html = prototypeShellHtml(flow.collectionName, out, out[0].id);
  const output = path.posix.join(flow.collectionDir, 'exports', `${collectionId}-prototype.html`);
  await fs.mkdir(path.join(workspaceRoot, path.posix.dirname(output)), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, output), html);
  return { ok: true, output, screens: out.map((s) => s.id), bytes: Buffer.byteLength(html, 'utf8'), warnings };
}
