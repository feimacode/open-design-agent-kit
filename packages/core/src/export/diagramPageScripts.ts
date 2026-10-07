// In-page geometry checks for diagrams (openspec add-codebase-diagrams,
// "Diagram Checks"), run by the visual check after the diagram runtime is
// ready. Serialized by puppeteer's page.evaluate(fn, ...args), so each
// function is SELF-CONTAINED (see ../poster/pageScripts.ts); types are `any`
// because core compiles without DOM lib types.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const document: any;
declare const window: any;

export interface DiagramPageFinding {
  check: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  selector?: string;
}

/** Resolves once every diagram runtime on the page is ready, or after `timeoutMs`; returns whether one was found. */
export function waitForDiagrams(timeoutMs: number): Promise<boolean> {
  const api = window.odDiagram;
  if (!api || !api.ready) return Promise.resolve(false);
  return Promise.race([
    api.ready.then(() => true),
    new Promise<boolean>((resolve) => window.setTimeout(() => resolve(true), timeoutMs)),
  ]);
}

/** node-overlap, edge-through-node, group-overlap and diagram-error for every [data-od-diagram] on the page. */
export function collectDiagramFindings(): DiagramPageFinding[] {
  const findings: DiagramPageFinding[] = [];
  const api = window.odDiagram;
  if (api && Array.isArray(api.errors)) {
    for (const e of api.errors) findings.push({ check: 'diagram-error', severity: 'error', message: 'The diagram runtime reported: ' + e + '.' });
  }
  const MAX = 8;
  const count: Record<string, number> = {};
  const add = (f: DiagramPageFinding): void => {
    count[f.check] = (count[f.check] || 0) + 1;
    if (count[f.check] <= MAX) findings.push(f);
  };
  const roots = Array.prototype.slice.call(document.querySelectorAll('[data-od-diagram]'));
  for (const root of roots) {
    const rr = root.getBoundingClientRect();
    const local = (el: any): any => {
      const r = el.getBoundingClientRect();
      const x = r.left - rr.left - root.clientLeft;
      const y = r.top - rr.top - root.clientTop;
      return { x0: x, y0: y, x1: x + r.width, y1: y + r.height };
    };
    const nodes = Array.prototype.slice
      .call(root.querySelectorAll('[data-od-node]'))
      .filter((el: any) => el.closest('[data-od-diagram]') === root)
      .map((el: any) => ({ id: el.getAttribute('data-od-node'), group: el.getAttribute('data-group') || '', b: local(el) }));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].b;
        const c = nodes[j].b;
        const w = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0);
        const h = Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0);
        if (w > 2 && h > 2) add({ check: 'node-overlap', severity: 'warning', message: 'Nodes "' + nodes[i].id + '" and "' + nodes[j].id + '" overlap. Give them different data-lane or data-rank values.', selector: nodes[i].id });
      }
    }

    // A horizontal or vertical segment crosses a box when it passes through the box's interior (1px inset).
    const crosses = (p: number[], q: number[], b: any): boolean => {
      const x0 = b.x0 + 1, x1 = b.x1 - 1, y0 = b.y0 + 1, y1 = b.y1 - 1;
      if (Math.abs(p[1] - q[1]) < 0.5) {
        const y = p[1];
        return y > y0 && y < y1 && Math.max(p[0], q[0]) > x0 && Math.min(p[0], q[0]) < x1;
      }
      if (Math.abs(p[0] - q[0]) < 0.5) {
        const x = p[0];
        return x > x0 && x < x1 && Math.max(p[1], q[1]) > y0 && Math.min(p[1], q[1]) < y1;
      }
      return false;
    };
    const edges = Array.prototype.slice.call(root.querySelectorAll('path[data-od-edge]')).filter((el: any) => el.closest('[data-od-diagram]') === root);
    for (const edge of edges) {
      const name = String(edge.getAttribute('data-od-edge'));
      const ends = name.split('->');
      let pts: number[][] = [];
      try {
        pts = JSON.parse(edge.getAttribute('data-points') || '[]');
      } catch {
        continue;
      }
      const hit = nodes.find((n: any) => n.id !== ends[0] && n.id !== ends[1] && pts.some((p: number[], k: number) => k > 0 && crosses(pts[k - 1], p, n.b)));
      if (hit) add({ check: 'edge-through-node', severity: 'warning', message: 'The link ' + name + ' passes through node "' + hit.id + '". Move "' + hit.id + '" to another lane, or reorder lanes so linked nodes sit next to each other.', selector: name });
    }

    const groups = Array.prototype.slice.call(root.querySelectorAll('[data-od-group-box]')).filter((el: any) => el.closest('[data-od-diagram]') === root);
    for (const g of groups) {
      const id = g.getAttribute('data-od-group-box');
      const b = local(g);
      const intruder = nodes.find((n: any) => {
        if (n.group === id) return false;
        const w = Math.min(b.x1, n.b.x1) - Math.max(b.x0, n.b.x0);
        const h = Math.min(b.y1, n.b.y1) - Math.max(b.y0, n.b.y0);
        return w > 2 && h > 2;
      });
      if (intruder) add({ check: 'group-overlap', severity: 'warning', message: 'The "' + id + '" group box covers node "' + intruder.id + '", which isn\'t a member. Move it out of the group\'s ranks and lanes, or add data-group="' + id + '".', selector: id });
    }
  }
  return findings;
}
