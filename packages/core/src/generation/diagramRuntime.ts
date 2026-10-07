// The diagram runtime (openspec add-codebase-diagrams, "codebase-diagrams"):
// plain, dependency-free JavaScript that lives inline in a diagram artifact
// as one `<script data-od-runtime="diagram">` block. It places nodes on a CSS
// grid by rank and lane, draws orthogonal connectors through the gaps between
// them, boxes groups, and lays out sequence diagrams — in the live preview
// (which renders artifacts from text via srcdoc, so a relative script file
// wouldn't load), in export, in the visual check and in any browser.
//
// Kept as a string, not a serialized function: a bundler's renamed or
// __name-wrapped helpers must never leak into a user's file. No backticks or
// "${" inside, so it can live in a template literal.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export const DIAGRAM_RUNTIME_VERSION = 2;

export const DIAGRAM_RUNTIME_JS = String.raw`(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var api = window.odDiagram || (window.odDiagram = {});
  var resolveReady;
  api.errors = [];
  api.ready = new Promise(function (r) { resolveReady = r; });
  var scheduled = false;
  var diagramCount = 0;

  var STYLE = [
    '[data-od-diagram]{position:relative;padding:var(--od-diagram-pad,32px);box-sizing:border-box}',
    '[data-od-diagram]:not([data-od-diagram="sequence"]){display:grid;justify-content:center;align-content:start;justify-items:center;align-items:center;column-gap:var(--od-rank-gap,96px);row-gap:var(--od-lane-gap,64px)}',
    '[data-od-diagram][data-direction="down"]:not([data-od-diagram="sequence"]){column-gap:var(--od-lane-gap,64px);row-gap:var(--od-rank-gap,80px)}',
    '[data-od-diagram="sequence"]{display:grid;justify-content:center;align-items:end;justify-items:center;column-gap:var(--od-participant-gap,72px)}',
    '[data-od-link],[data-od-message],[data-od-group]{display:none!important}',
    '[data-od-node],[data-od-participant]{position:relative;z-index:2}',
    '.od-diagram-edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:1}',
    '[data-od-group-box]{position:absolute;z-index:0;box-sizing:border-box;border:var(--od-group-border-width,1px) solid var(--od-group-border,var(--border,#d4d4d8));background:var(--od-group-bg,transparent);border-radius:var(--od-group-radius,12px);pointer-events:none}',
    '[data-od-group-box]>span{position:absolute;left:12px;top:5px;font-size:var(--od-group-label-size,12px);line-height:16px;font-weight:600;letter-spacing:.02em;color:var(--od-group-label-color,var(--muted,#71717a));white-space:nowrap}',
    '[data-od-edge-label]{position:absolute;z-index:3;transform:translate(-50%,-50%);padding:1px 6px;font-size:var(--od-edge-label-size,12px);line-height:1.4;white-space:nowrap;background:var(--od-edge-label-bg,var(--bg,#fff));color:var(--od-edge-label-color,var(--fg,#27272a));border-radius:4px;pointer-events:none}'
  ].join('\n');

  function ensureStyle() {
    var s = document.getElementById('od-diagram-style');
    if (!s) {
      s = document.createElement('style');
      s.id = 'od-diagram-style';
      (document.head || document.documentElement).appendChild(s);
    }
    if (s.textContent !== STYLE) s.textContent = STYLE;
  }

  function intAttr(el, name) {
    var v = parseInt(el.getAttribute(name), 10);
    return isFinite(v) && v > 0 ? v : 0;
  }
  function pxVar(el, name, fallback) {
    var v = parseFloat(getComputedStyle(el).getPropertyValue(name));
    return isFinite(v) ? v : fallback;
  }
  function own(root, selector) {
    return Array.prototype.filter.call(root.querySelectorAll(selector), function (el) {
      return el.closest('[data-od-diagram]') === root;
    });
  }
  function err(root, message) {
    var label = root.id ? '#' + root.id + ': ' : '';
    api.errors.push(label + message);
  }
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function box(root, el) {
    var rr = root.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var x = r.left - rr.left - root.clientLeft;
    var y = r.top - rr.top - root.clientTop;
    return { x0: x, y0: y, x1: x + r.width, y1: y + r.height };
  }
  function simplify(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var q = out[out.length - 1];
      if (q && Math.abs(q[0] - p[0]) < 0.5 && Math.abs(q[1] - p[1]) < 0.5) continue;
      if (out.length >= 2) {
        var a = out[out.length - 2];
        if ((Math.abs(a[0] - q[0]) < 0.5 && Math.abs(q[0] - p[0]) < 0.5) || (Math.abs(a[1] - q[1]) < 0.5 && Math.abs(q[1] - p[1]) < 0.5)) out.pop();
      }
      out.push(p);
    }
    return out;
  }

  function overlay(root, w, h) {
    var n = ++diagramCount;
    var svg = svgEl('svg', { 'class': 'od-diagram-edges', 'data-od-generated': '', width: String(w), height: String(h), 'aria-hidden': 'true' });
    var defs = svgEl('defs', {});
    var marker = svgEl('marker', { id: 'od-arrow-' + n, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
    marker.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', style: 'fill:var(--od-edge-color,var(--muted,#71717a))' }));
    defs.appendChild(marker);
    svg.appendChild(defs);
    root.appendChild(svg);
    return { svg: svg, arrow: 'url(#od-arrow-' + n + ')' };
  }

  function drawEdge(root, layer, pts, from, to, label, dashed, alongX) {
    var d = 'M' + pts.map(function (p) { return Math.round(p[0] * 10) / 10 + ',' + Math.round(p[1] * 10) / 10; }).join(' L');
    var path = svgEl('path', {
      d: d,
      fill: 'none',
      'data-od-edge': from + '->' + to,
      'data-points': JSON.stringify(pts.map(function (p) { return [Math.round(p[0]), Math.round(p[1])]; })),
      'marker-end': layer.arrow,
      style: 'stroke:var(--od-edge-color,var(--muted,#71717a));stroke-width:var(--od-edge-width,1.5px)' + (dashed ? ';stroke-dasharray:5 4' : '')
    });
    layer.svg.appendChild(path);
    if (!label) return;
    var lab = document.createElement('div');
    lab.setAttribute('data-od-edge-label', from + '->' + to);
    lab.setAttribute('data-od-generated', '');
    lab.textContent = label;
    root.appendChild(lab);
    // Prefer the longest segment running along the flow when the label fits on it (labels on
    // channel segments sit on top of other links); else the longest segment of any kind.
    var need = (alongX ? lab.offsetWidth : lab.offsetHeight) + 24;
    var best = -1, bi = 1, any = -1, ai = 1;
    for (var i = 1; i < pts.length; i++) {
      var dx = Math.abs(pts[i][0] - pts[i - 1][0]), dy = Math.abs(pts[i][1] - pts[i - 1][1]);
      var len = dx + dy;
      if (len > any) { any = len; ai = i; }
      var along = alongX ? dx : dy;
      if (along >= need && along > best) { best = along; bi = i; }
    }
    if (best < 0) bi = ai;
    lab.style.left = (pts[bi - 1][0] + pts[bi][0]) / 2 + 'px';
    lab.style.top = (pts[bi - 1][1] + pts[bi][1]) / 2 + 'px';
  }

  function renderFlow(root) {
    var down = root.getAttribute('data-direction') === 'down';
    var nodes = {};
    var list = [];
    own(root, '[data-od-node]').forEach(function (el) {
      var id = el.getAttribute('data-od-node');
      var rank = intAttr(el, 'data-rank');
      var lane = intAttr(el, 'data-lane');
      if (!id) { err(root, 'a node has an empty data-od-node id'); return; }
      if (nodes[id]) { err(root, 'node id "' + id + '" is used twice'); return; }
      if (!rank || !lane) { err(root, 'node "' + id + '" needs a positive integer data-rank and data-lane'); return; }
      el.style.gridColumn = String(down ? lane : rank);
      el.style.gridRow = String(down ? rank : lane);
      var n = { id: id, el: el, rank: rank, lane: lane, group: el.getAttribute('data-group') || '' };
      nodes[id] = n;
      list.push(n);
    });
    var rb = root.getBoundingClientRect();
    var layer = overlay(root, Math.max(root.scrollWidth, rb.width), Math.max(root.scrollHeight, rb.height));
    // u runs along the flow (ranks), v across it (lanes).
    list.forEach(function (n) {
      var b = box(root, n.el);
      n.u0 = down ? b.y0 : b.x0; n.u1 = down ? b.y1 : b.x1;
      n.v0 = down ? b.x0 : b.y0; n.v1 = down ? b.x1 : b.y1;
    });
    function extents(key, lo, hi) {
      var m = {};
      list.forEach(function (n) {
        var e = m[n[key]] || (m[n[key]] = { min: Infinity, max: -Infinity });
        e.min = Math.min(e.min, n[lo]); e.max = Math.max(e.max, n[hi]);
      });
      var keys = Object.keys(m).map(Number).sort(function (a, b) { return a - b; });
      return { m: m, keys: keys };
    }
    var R = extents('rank', 'u0', 'u1');
    var L = extents('lane', 'v0', 'v1');
    var rankGap = pxVar(root, '--od-rank-gap', down ? 80 : 96);
    var laneGap = pxVar(root, '--od-lane-gap', 64);
    function after(ext, k, gap) {
      var i = ext.keys.indexOf(k);
      var next = ext.keys[i + 1];
      return next === undefined ? ext.m[k].max + Math.min(gap / 2, 24) : (ext.m[k].max + ext.m[next].min) / 2;
    }
    function before(ext, k, gap) {
      var i = ext.keys.indexOf(k);
      var prev = ext.keys[i - 1];
      return prev === undefined ? ext.m[k].min - Math.min(gap / 2, 24) : (ext.m[prev].max + ext.m[k].min) / 2;
    }
    function laneBlocked(lane, r0, r1) {
      return list.some(function (n) { return n.lane === lane && n.rank > r0 && n.rank < r1; });
    }

    // Pass 1: symbolic routes, counting who shares each channel, gap and node side.
    var routes = [];
    var counts = {};
    function use(key) { counts[key] = (counts[key] || 0) + 1; return counts[key] - 1; }
    own(root, '[data-od-link]').forEach(function (el) {
      var from = el.getAttribute('data-from') || '';
      var to = el.getAttribute('data-to') || '';
      var S = nodes[from], T = nodes[to];
      if (!S) err(root, 'link from unknown node "' + from + '"');
      if (!T) err(root, 'link to unknown node "' + to + '"');
      if (!S || !T || S === T) return;
      var r = { S: S, T: T, label: el.getAttribute('data-label') || el.textContent.trim(), dashed: el.getAttribute('data-style') === 'dashed' };
      var sameRank = T.rank === S.rank;
      r.inSide = sameRank ? 'u1' : 'u0';
      r.outPort = use(S.id + ':u1');
      r.inPort = use(T.id + ':' + r.inSide);
      if (sameRank) {
        r.c1 = after(R, S.rank, rankGap);
      } else if (T.rank === S.rank + 1 || (T.rank > S.rank && T.lane === S.lane && !laneBlocked(S.lane, S.rank, T.rank))) {
        r.c1 = T.rank === S.rank + 1 ? after(R, S.rank, rankGap) : before(R, T.rank, rankGap);
      } else {
        r.c1 = after(R, S.rank, rankGap);
        r.c2 = before(R, T.rank, rankGap);
        r.g = T.lane < S.lane ? before(L, S.lane, laneGap) : after(L, S.lane, laneGap);
      }
      r.c1i = use('c' + Math.round(r.c1));
      if (r.c2 !== undefined) r.c2i = use('c' + Math.round(r.c2));
      if (r.g !== undefined) r.gi = use('g' + Math.round(r.g));
      routes.push(r);
    });

    // Pass 2: spread shared channels and node sides, then draw.
    // Links sharing a channel or gap fan out across up to 70% of its width (4–16 px apart),
    // in order of where they're heading, so the bundle reads as separate lines.
    var widths = {};
    R.keys.forEach(function (k, i) {
      var next = R.keys[i + 1];
      if (next !== undefined) widths['c' + Math.round((R.m[k].max + R.m[next].min) / 2)] = R.m[next].min - R.m[k].max;
    });
    L.keys.forEach(function (k, i) {
      var next = L.keys[i + 1];
      if (next !== undefined) widths['g' + Math.round((L.m[k].max + L.m[next].min) / 2)] = L.m[next].min - L.m[k].max;
    });
    var order = {};
    routes.forEach(function (r) {
      [['c' + Math.round(r.c1), 'c1i'], r.c2 !== undefined ? ['c' + Math.round(r.c2), 'c2i'] : null, r.g !== undefined ? ['g' + Math.round(r.g), 'gi'] : null].forEach(function (u) {
        if (u) (order[u[0]] || (order[u[0]] = [])).push({ r: r, slot: u[1] });
      });
    });
    Object.keys(order).forEach(function (key) {
      order[key].sort(function (a, b) { return (a.r.T.v0 - b.r.T.v0) || (a.r.S.v0 - b.r.S.v0); });
      order[key].forEach(function (u, i) { u.r[u.slot] = i; });
    });
    function spread(key, i) {
      var n = counts[key] || 1;
      var step = Math.max(4, Math.min(16, ((widths[key] || 48) * 0.7) / Math.max(1, n - 1)));
      return (i - (n - 1) / 2) * step;
    }
    function port(n, side, i) {
      var c = counts[n.id + ':' + side] || 1;
      return n.v0 + (n.v1 - n.v0) * (0.2 + 0.6 * (i + 1) / (c + 1));
    }
    routes.forEach(function (r) {
      var S = r.S, T = r.T;
      var sv = port(S, 'u1', r.outPort);
      var tv = port(T, r.inSide, r.inPort);
      var c1 = r.c1 + spread('c' + Math.round(r.c1), r.c1i);
      var uv = [[S.u1, sv], [c1, sv]];
      if (r.g !== undefined) {
        var g = r.g + spread('g' + Math.round(r.g), r.gi);
        var c2 = r.c2 + spread('c' + Math.round(r.c2), r.c2i);
        uv.push([c1, g], [c2, g], [c2, tv]);
      } else {
        uv.push([c1, tv]);
      }
      uv.push([r.inSide === 'u1' ? T.u1 : T.u0, tv]);
      var pts = simplify(uv.map(function (p) { return down ? [p[1], p[0]] : [p[0], p[1]]; }));
      drawEdge(root, layer, pts, S.id, T.id, r.label, r.dashed, !down);
    });

    // Groups: a labelled box around each group's members.
    var groupPad = pxVar(root, '--od-group-pad', 16);
    own(root, '[data-od-group]').forEach(function (el) {
      var id = el.getAttribute('data-od-group');
      var members = list.filter(function (n) { return n.group === id; });
      if (members.length === 0) { err(root, 'group "' + id + '" has no member nodes (data-group="' + id + '")'); return; }
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      members.forEach(function (n) {
        var b = box(root, n.el);
        x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
      });
      var label = el.getAttribute('data-label') || el.textContent.trim();
      var top = groupPad + (label ? 22 : 0);
      var g = document.createElement('div');
      g.setAttribute('data-od-group-box', id);
      g.setAttribute('data-od-generated', '');
      g.style.left = x0 - groupPad + 'px';
      g.style.top = y0 - top + 'px';
      g.style.width = x1 - x0 + 2 * groupPad + 'px';
      g.style.height = y1 - y0 + top + groupPad + 'px';
      if (label) {
        var s = document.createElement('span');
        s.textContent = label;
        g.appendChild(s);
      }
      root.insertBefore(g, root.firstChild);
    });
  }

  function renderSequence(root) {
    var parts = own(root, '[data-od-participant]');
    var byId = {};
    parts.forEach(function (el, i) {
      var id = el.getAttribute('data-od-participant');
      if (byId[id]) err(root, 'participant id "' + id + '" is used twice');
      byId[id] = el;
      el.style.gridColumn = String(i + 1);
      el.style.gridRow = '1';
    });
    var messages = own(root, '[data-od-message]');
    var gap = pxVar(root, '--od-message-gap', 44);
    var spacer = document.createElement('div');
    spacer.setAttribute('data-od-generated', '');
    spacer.style.gridColumn = '1 / -1';
    spacer.style.gridRow = '2';
    spacer.style.height = gap * (messages.length + 1) + 'px';
    root.appendChild(spacer);
    var rb = root.getBoundingClientRect();
    var layer = overlay(root, Math.max(root.scrollWidth, rb.width), Math.max(root.scrollHeight, rb.height));
    var head = 0;
    var xs = {};
    parts.forEach(function (el) {
      var b = box(root, el);
      head = Math.max(head, b.y1);
      xs[el.getAttribute('data-od-participant')] = (b.x0 + b.x1) / 2;
    });
    var end = head + gap * (messages.length + 1);
    Object.keys(xs).forEach(function (id) {
      layer.svg.appendChild(svgEl('line', {
        x1: String(xs[id]), y1: String(head), x2: String(xs[id]), y2: String(end), 'data-od-lifeline': id,
        style: 'stroke:var(--od-lifeline-color,var(--border,#d4d4d8));stroke-width:1px;stroke-dasharray:4 4'
      }));
    });
    messages.forEach(function (el, i) {
      var from = el.getAttribute('data-from') || '';
      var to = el.getAttribute('data-to') || '';
      if (xs[from] === undefined) err(root, 'message from unknown participant "' + from + '"');
      if (xs[to] === undefined) err(root, 'message to unknown participant "' + to + '"');
      if (xs[from] === undefined || xs[to] === undefined) return;
      var y = head + gap * (i + 1);
      var pts = from === to
        ? [[xs[from], y - 8], [xs[from] + 40, y - 8], [xs[from] + 40, y + 8], [xs[from] + 4, y + 8]]
        : [[xs[from], y], [xs[to] + (xs[to] > xs[from] ? -2 : 2), y]];
      var label = el.getAttribute('data-label') || el.textContent.trim();
      drawEdge(root, layer, pts, from, to, '', el.getAttribute('data-kind') === 'return', true);
      if (label) {
        var lab = document.createElement('div');
        lab.setAttribute('data-od-edge-label', from + '->' + to);
        lab.setAttribute('data-od-generated', '');
        lab.textContent = label;
        lab.style.left = (from === to ? xs[from] + 48 : (xs[from] + xs[to]) / 2) + 'px';
        lab.style.top = y - (from === to ? 0 : 12) + 'px';
        if (from === to) lab.style.transform = 'translate(0,-50%)';
        root.appendChild(lab);
      }
    });
  }

  function render() {
    scheduled = false;
    ensureStyle();
    api.errors = [];
    diagramCount = 0;
    Array.prototype.forEach.call(document.querySelectorAll('[data-od-diagram]'), function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-od-generated]'), function (el) {
        if (el.closest('[data-od-diagram]') === root) el.remove();
      });
      if (root.getAttribute('data-od-diagram') === 'sequence') renderSequence(root);
      else renderFlow(root);
      root.setAttribute('data-od-ready', '');
    });
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }
  api.relayout = render;

  function boot() {
    render();
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(schedule);
      Array.prototype.forEach.call(document.querySelectorAll('[data-od-diagram], [data-od-node], [data-od-participant]'), function (el) { ro.observe(el); });
    }
    window.addEventListener('resize', schedule);
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fonts.then(function () {
      render();
      resolveReady(api);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();`;

const RUNTIME_BLOCK = /<script\b[^>]*\bdata-od-runtime=["']diagram["'][^>]*>[\s\S]*?<\/script>/gi;

/** The runtime as the `<script>` block the artifact carries. */
export function diagramRuntimeBlock(): string {
  return `<script data-od-runtime="diagram" data-version="${DIAGRAM_RUNTIME_VERSION}">\n${DIAGRAM_RUNTIME_JS}\n</script>`;
}

/**
 * Puts exactly one current runtime block in the HTML: replaces existing ones
 * (any version) in place, else inserts before the last `</body>`, else
 * appends. Everything else is left byte-for-byte unchanged.
 */
export function withDiagramRuntime(html: string): { html: string; action: 'inserted' | 'updated' | 'unchanged' } {
  const block = diagramRuntimeBlock();
  const existing = [...html.matchAll(RUNTIME_BLOCK)];
  if (existing.length > 0) {
    let first = true;
    const out = html.replace(RUNTIME_BLOCK, () => {
      if (!first) return '';
      first = false;
      return block;
    });
    return { html: out, action: out === html ? 'unchanged' : 'updated' };
  }
  const close = html.toLowerCase().lastIndexOf('</body>');
  const out = close >= 0 ? `${html.slice(0, close)}${block}\n${html.slice(close)}` : `${html}${html.endsWith('\n') ? '' : '\n'}${block}\n`;
  return { html: out, action: 'inserted' };
}

export type AddDiagramRuntimeResult = { ok: true; entryPath: string; action: 'inserted' | 'updated' | 'unchanged'; version: number } | { ok: false; error: string };

/** add_open_design_diagram_runtime: writes the runtime into the entry file (registered or not). */
export async function addDiagramRuntime(input: { workspaceRoot: string; entryPath: string }): Promise<AddDiagramRuntimeResult> {
  const entry = input.entryPath.replace(/\\/g, '/');
  if (!/\.html?$/i.test(entry)) return { ok: false, error: `${input.entryPath} isn't an HTML file; diagrams are HTML artifacts.` };
  const abs = path.resolve(input.workspaceRoot, entry);
  const rel = path.relative(input.workspaceRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, error: `${input.entryPath} is outside the workspace.` };
  let html: string;
  try {
    html = await fs.readFile(abs, 'utf8');
  } catch {
    return { ok: false, error: `No file at ${input.entryPath}. Write the diagram first, then add the runtime.` };
  }
  const result = withDiagramRuntime(html);
  if (result.action !== 'unchanged') await fs.writeFile(abs, result.html, 'utf8');
  return { ok: true, entryPath: entry, action: result.action, version: DIAGRAM_RUNTIME_VERSION };
}

export function formatAddDiagramRuntimeResult(result: AddDiagramRuntimeResult): string {
  if (!result.ok) return `Diagram runtime not added: ${result.error}`;
  const verb = result.action === 'inserted' ? 'Added' : result.action === 'updated' ? 'Updated' : 'Already current:';
  return [
    `${verb} the diagram runtime (v${result.version}) in ${result.entryPath}. Don't edit or copy that <script data-od-runtime="diagram"> block; run this tool again to update it.`,
    '',
    'Markup it lays out (inside one container per diagram):',
    '- Flow: <div data-od-diagram data-direction="right|down">. Nodes: any element with data-od-node="id" data-rank="1.." (step along the flow) data-lane="1.." (position across it), optional data-group="gid" and data-od-source="path/to/file". Links: <i data-od-link data-from="a" data-to="b" data-label="optional" data-style="dashed?" hidden></i>. Groups: <i data-od-group="gid" data-label="Backend" hidden></i>.',
    '- Sequence: <div data-od-diagram="sequence">. Participants: elements with data-od-participant="id", in order. Messages, in order: <i data-od-message data-from="a" data-to="b" data-label="GET /x" data-kind="return?" hidden></i>.',
    '- Style with CSS custom properties on the container (they default to the design-system tokens): --od-edge-color, --od-edge-width, --od-edge-label-bg, --od-edge-label-color, --od-group-border, --od-group-bg, --od-group-pad, --od-rank-gap, --od-lane-gap, --od-message-gap, --od-participant-gap. Style nodes and participants with your own CSS.',
    '- Keep connected nodes in neighbouring lanes and ranks; links jumping several ranks route through the gap next to the source lane. window.odDiagram.errors lists problems; check_open_design_artifact reports them.',
  ].join('\n');
}
