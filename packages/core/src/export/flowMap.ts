// The flow map of a collection (openspec add-linked-flows): <collection>/flow.html
// shows every screen as a live, scaled-down thumbnail in columns by how many
// steps it is from the first screen, with an arrow per link. Links found in the
// screens are solid; planned links not built yet are dashed red; planned
// screens not built yet are empty cards. Self-contained apart from the screens
// it frames, which sit next to it.
import type { FlowPlan } from '../generation/flowPlan';
import type { FoundLink } from './flowCheck';

export const FLOW_MAP_FILE = 'flow.html';

export interface FlowMapScreen {
  id: string;
  title: string;
  /** The screen's file, relative to the collection's directory; absent when it isn't built. */
  href?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Columns by distance from the first screen; screens nothing reaches go in a last column. */
export function flowColumns(screens: FlowMapScreen[], edges: Array<{ from: string; to: string }>): string[][] {
  if (screens.length === 0) return [];
  const depth = new Map<string, number>([[screens[0].id, 0]]);
  const queue = [screens[0].id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const e of edges) {
      if (e.from === id && !depth.has(e.to) && screens.some((s) => s.id === e.to)) {
        depth.set(e.to, depth.get(id)! + 1);
        queue.push(e.to);
      }
    }
  }
  const max = Math.max(...depth.values());
  const columns: string[][] = Array.from({ length: max + 1 }, () => []);
  const unreached: string[] = [];
  for (const s of screens) {
    const d = depth.get(s.id);
    if (d === undefined) unreached.push(s.id);
    else columns[d].push(s.id);
  }
  if (unreached.length > 0) columns.push(unreached);
  return columns;
}

export function flowMapHtml(input: {
  title: string;
  screens: FlowMapScreen[];
  links: FoundLink[];
  plan?: FlowPlan;
  missingLinks: Array<{ from: string; trigger: string; to: string }>;
  /** Screen width the thumbnails are rendered at (default 390, a phone). */
  frameWidth?: number;
}): string {
  const width = input.frameWidth ?? 390;
  const height = Math.round(width * (844 / 390));
  const scale = 220 / width;
  const found = new Map<string, FoundLink>();
  for (const l of input.links) if (!l.broken && l.from !== l.to) found.set(`${l.from}>${l.to}`, l);
  const edges = [
    ...[...found.values()].map((l) => ({ from: l.from, to: l.to, label: l.trigger, missing: false })),
    ...input.missingLinks.map((l) => ({ from: l.from, to: l.to, label: l.trigger, missing: true })),
  ];
  const columns = flowColumns(input.screens, edges);
  const byId = new Map(input.screens.map((s) => [s.id, s]));
  const cards = columns
    .map(
      (col) =>
        `<div class="col">${col
          .map((id) => {
            const s = byId.get(id)!;
            const frame = s.href
              ? `<a class="open" href="${esc(s.href)}" title="Open ${esc(s.title)}"><iframe src="${esc(s.href)}" loading="lazy" tabindex="-1" style="width:${width}px;height:${height}px;transform:scale(${scale})"></iframe></a>`
              : '<div class="unbuilt">Not built yet</div>';
            return `<figure class="screen${s.href ? '' : ' missing'}" data-id="${esc(id)}"><div class="thumb" style="height:${Math.round(height * scale)}px">${frame}</div><figcaption><b>${esc(s.title)}</b><span>${esc(id)}</span></figcaption></figure>`;
          })
          .join('')}</div>`,
    )
    .join('');
  const data = JSON.stringify(edges).replace(/</g, '\\u003c');
  const legend = `${found.size} link(s) found${input.missingLinks.length ? `, <span class="bad">${input.missingLinks.length} planned link(s) missing</span>` : ''}${input.plan ? `, ${input.plan.screens.length} planned screen(s)` : ''}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(input.title)} — flow map</title>
<style>
:root{--bg:#f6f6f4;--fg:#1c1c1c;--muted:#6b6b6b;--card:#fff;--line:#4a4a4a;--bad:#c62828}
@media (prefers-color-scheme:dark){:root{--bg:#161617;--fg:#eee;--muted:#9a9a9a;--card:#232325;--line:#bbb;--bad:#ff6b6b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
header{padding:20px 24px 4px}h1{margin:0 0 4px;font-size:20px}p{margin:0;color:var(--muted)}.bad{color:var(--bad)}
.map{position:relative;display:flex;gap:96px;padding:24px;overflow:auto;align-items:flex-start}
.col{display:flex;flex-direction:column;gap:40px}
.screen{margin:0;width:236px;background:var(--card);border-radius:12px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,.12);position:relative;z-index:1}
.screen.missing{border:2px dashed var(--bad);box-shadow:none}
.thumb{overflow:hidden;border-radius:8px;background:var(--bg);position:relative}
.thumb iframe{border:0;transform-origin:0 0;pointer-events:none;background:#fff}
.open{display:block}.unbuilt{display:grid;place-items:center;height:100%;color:var(--bad)}
figcaption{display:flex;justify-content:space-between;gap:8px;padding:8px 2px 0}figcaption span{color:var(--muted)}
svg{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
svg path{fill:none;stroke:var(--line);stroke-width:1.5}svg path.missing{stroke:var(--bad);stroke-dasharray:6 5}
svg text{fill:var(--muted);font-size:11px}svg text.missing{fill:var(--bad)}
</style></head><body>
<header><h1>${esc(input.title)}</h1><p>${legend}. Click a screen to open it.</p></header>
<div class="map" id="map">${cards}<svg id="arrows"><defs><marker id="h" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L8 4L0 8z" style="fill:var(--line);stroke:none"/></marker><marker id="hm" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L8 4L0 8z" style="fill:var(--bad);stroke:none"/></marker></defs></svg></div>
<script>
(function(){var edges=${data};var map=document.getElementById('map');var svg=document.getElementById('arrows');
function draw(){[].slice.call(svg.querySelectorAll('g')).forEach(function(g){g.remove()});var m=map.getBoundingClientRect();svg.setAttribute('width',map.scrollWidth);svg.setAttribute('height',map.scrollHeight);
var seen={};edges.forEach(function(e){var a=map.querySelector('[data-id="'+e.from+'"]'),b=map.querySelector('[data-id="'+e.to+'"]');if(!a||!b)return;
var key=e.from+'>'+e.to;var n=seen[key]=(seen[key]||0)+1;var ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();var ox=map.scrollLeft-m.left,oy=map.scrollTop-m.top;
var back=rb.left<ra.left+10;var x1=(back?ra.left:ra.right)+ox,y1=ra.top+ra.height/2+oy+(n-1)*14,x2=(back?rb.right:rb.left)+ox,y2=rb.top+rb.height/2+oy+(n-1)*14;
var c=Math.max(40,Math.abs(x2-x1)/2)*(back?-1:1);var g=document.createElementNS('http://www.w3.org/2000/svg','g');
var p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M'+x1+' '+y1+' C'+(x1+c)+' '+y1+' '+(x2-c)+' '+y2+' '+x2+' '+y2);p.setAttribute('marker-end',e.missing?'url(#hm)':'url(#h)');if(e.missing)p.setAttribute('class','missing');
var t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('x',(x1+x2)/2);t.setAttribute('y',(y1+y2)/2-6);t.setAttribute('text-anchor','middle');if(e.missing)t.setAttribute('class','missing');t.textContent=(e.missing?'missing: ':'')+e.label;
g.appendChild(p);g.appendChild(t);svg.appendChild(g)})}
window.addEventListener('load',draw);window.addEventListener('resize',draw);draw()})();
</script>
</body></html>
`;
}
