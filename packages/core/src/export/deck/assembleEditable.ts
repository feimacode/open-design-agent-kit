// Editable PPTX writer (openspec add-editable-pptx-export, design D2/D5): turns
// SlideScenes (./slideScene) into native PowerPoint text boxes, shapes and
// pictures with pptxgenjs. The kit's own code. Positions come in CSS px of the
// slide stage and go out in inches on a slide 13.333 in wide (PowerPoint's
// widescreen size), so font sizes land at the sizes people expect to edit.
import * as PptxGenJSModule from 'pptxgenjs';
import { resolvePptxConstructor } from './assemble';
import type { EditableSlide, SceneBox, SceneColor, ScenePicture, SceneText, SlideScene } from './slideScene';

/** PowerPoint's widescreen slide width. */
export const EDITABLE_SLIDE_WIDTH_IN = 13.333;

/** Single lines get room to breathe: PowerPoint's font measurements often run wider than the browser's. */
const SINGLE_LINE_GROW = 1.12;
const SINGLE_LINE_PAD_PX = 8;

type Pptx = InstanceType<typeof import('pptxgenjs').default>;
type PptxSlide = ReturnType<Pptx['addSlide']>;

export interface EditableAssembleOptions {
  title?: string;
  stage: { w: number; h: number };
}

function transparency(c: SceneColor): number | undefined {
  return c.alpha < 0.999 ? Math.round((1 - c.alpha) * 100) : undefined;
}

/** pt per CSS px, and inches per CSS px, for a stage `stageW` px wide. */
export function editableUnits(stageW: number): { inch: number; pt: number } {
  const inch = EDITABLE_SLIDE_WIDTH_IN / stageW;
  return { inch, pt: inch * 72 };
}

/** Where a text box goes, in px: single lines widened and re-anchored by alignment. */
export function textBoxRect(t: SceneText): { x: number; y: number; w: number; h: number } {
  if (t.lines > 1) return { x: t.rect.x, y: t.rect.y, w: t.rect.w + 2, h: t.rect.h };
  const w = t.rect.w * SINGLE_LINE_GROW + SINGLE_LINE_PAD_PX;
  const extra = w - t.rect.w;
  const x = t.align === 'center' ? t.rect.x - extra / 2 : t.align === 'right' ? t.rect.x - extra : t.rect.x;
  return { x, y: t.rect.y, w, h: t.rect.h };
}

function addBox(pptx: Pptx, slide: PptxSlide, b: SceneBox, inch: number, pt: number): void {
  const { x, y, w, h } = b.rect;
  if (w < 0.5 || h < 0.5) return;
  const min = Math.min(w, h);
  const circle = b.radius >= min / 2 - 0.5 && Math.abs(w - h) < 1;
  const shape = circle ? pptx.ShapeType.ellipse : b.radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
  slide.addShape(shape, {
    x: x * inch,
    y: y * inch,
    w: w * inch,
    h: h * inch,
    fill: b.fill ? { type: 'solid', color: b.fill.hex, transparency: transparency(b.fill) } : { type: 'none' },
    line: b.line
      ? { color: b.line.color.hex, width: Math.max(0.25, b.line.width * pt), dashType: b.line.dash === 'solid' ? 'solid' : b.line.dash === 'dash' ? 'dash' : 'sysDot', transparency: transparency(b.line.color) }
      : { type: 'none' },
    ...(shape === pptx.ShapeType.roundRect ? { rectRadius: Math.min(b.radius, min / 2) * inch } : {}),
  });
}

function addPicture(slide: PptxSlide, p: ScenePicture, inch: number): void {
  if (p.rect.w < 0.5 || p.rect.h < 0.5) return;
  slide.addImage({ data: p.data, x: p.rect.x * inch, y: p.rect.y * inch, w: p.rect.w * inch, h: p.rect.h * inch });
}

function addText(slide: PptxSlide, t: SceneText, inch: number, pt: number): void {
  const r = textBoxRect(t);
  // A break starts a new paragraph (the previous run ends its line). pptxgenjs's soft breaks write a paragraph's
  // properties after the break, which PowerPoint reports as needing repair.
  const parts = t.runs.filter((run, i) => run.text !== '' || (run.breakBefore && t.runs[i + 1]?.breakBefore));
  const runs = parts.map((run, i) => ({
    text: run.text,
    options: {
      fontFace: run.font,
      fontSize: Math.max(1, Math.round(run.size * pt * 2) / 2),
      bold: run.weight >= 600,
      italic: run.italic || undefined,
      underline: run.underline ? { style: 'sng' as const } : undefined,
      strike: run.strike ? ('sngStrike' as const) : undefined,
      color: run.color.hex,
      transparency: transparency(run.color),
      charSpacing: run.letterSpacing ? Math.round(run.letterSpacing * pt * 100) / 100 : undefined,
      breakLine: parts[i + 1]?.breakBefore || undefined,
    },
  }));
  const b = t.bullet;
  const bullet = b
    ? b.kind === 'char'
      ? { characterCode: b.char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'), indent: Math.round(b.indent * pt) }
      : { type: 'number' as const, numberType: b.style, numberStartAt: b.start, indent: Math.round(b.indent * pt) }
    : undefined;
  if (bullet) runs[0].options = { ...runs[0].options, bullet } as typeof runs[0]['options'];
  slide.addText(runs, {
    x: r.x * inch,
    y: r.y * inch,
    w: r.w * inch,
    h: r.h * inch,
    margin: 0,
    valign: 'top',
    align: t.align,
    wrap: t.lines > 1,
    fit: 'none',
    lineSpacing: Math.round(t.lineHeight * pt * 10) / 10,
    paraSpaceBefore: 0,
    paraSpaceAfter: 0,
  });
}

/** Writes one slide's scene (background, background picture, shapes and pictures in paint order, text on top, notes). */
export function writeEditableSlide(pptx: Pptx, s: EditableSlide, stage: { w: number; h: number }): void {
  const { inch, pt } = editableUnits(stage.w);
  const slide = pptx.addSlide();
  const scene: SlideScene = s.scene;
  slide.background = { color: scene.background.hex };
  if (s.plate) {
    slide.addImage({
      data: `data:image/${s.plate.jpeg ? 'jpeg' : 'png'};base64,${s.plate.buffer.toString('base64')}`,
      x: 0,
      y: 0,
      w: stage.w * inch,
      h: stage.h * inch,
    });
  }
  const layered: Array<{ z: number; box?: SceneBox; picture?: ScenePicture }> = [
    ...scene.boxes.map((box) => ({ z: box.z, box })),
    ...scene.pictures.map((picture) => ({ z: picture.z, picture })),
  ].sort((a, b) => a.z - b.z);
  for (const item of layered) {
    if (item.box) addBox(pptx, slide, item.box, inch, pt);
    else if (item.picture) addPicture(slide, item.picture, inch);
  }
  for (const t of scene.texts) addText(slide, t, inch, pt);
  if (s.notes) slide.addNotes(s.notes);
}

export async function assembleEditablePptx(slides: EditableSlide[], opts: EditableAssembleOptions): Promise<Buffer> {
  if (slides.length === 0) throw new Error('no slides to export');
  const PptxGenJS = resolvePptxConstructor(PptxGenJSModule);
  const pptx = new PptxGenJS();
  const aspect = opts.stage.w / opts.stage.h;
  if (Math.abs(aspect - 16 / 9) < 0.01) {
    pptx.layout = 'LAYOUT_WIDE';
  } else {
    pptx.defineLayout({ name: 'OD_DECK', width: EDITABLE_SLIDE_WIDTH_IN, height: Number((EDITABLE_SLIDE_WIDTH_IN / aspect).toFixed(3)) });
    pptx.layout = 'OD_DECK';
  }
  pptx.author = 'Open Design';
  if (opts.title) pptx.title = opts.title;
  pptx.subject = 'Editable PPTX';
  for (const s of slides) writeEditableSlide(pptx, s, opts.stage);
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

export interface EditableReport {
  slides: Array<{ number: number; texts: number; boxes: number; pictures: number; backgroundPicture: boolean; flattened: string[]; uncovered: string[] }>;
  fonts: Array<{ name: string; webFont: boolean }>;
}

/** The per-slide counts, flattened parts and fonts (design D7). */
export function editableReport(slides: EditableSlide[]): EditableReport {
  const fonts = new Map<string, { name: string; webFont: boolean }>();
  for (const s of slides) for (const f of s.scene.fonts) if (!fonts.has(f.name.toLowerCase())) fonts.set(f.name.toLowerCase(), f);
  return {
    slides: slides.map((s) => ({
      number: s.number,
      texts: s.scene.texts.length,
      boxes: s.scene.boxes.length,
      pictures: s.scene.pictures.length,
      backgroundPicture: !!s.plate,
      flattened: s.scene.flattened.map((f) => `${f.label} (${f.reason})`),
      uncovered: s.scene.uncovered,
    })),
    fonts: [...fonts.values()],
  };
}

/** Text lines for the export result. */
export function formatEditableReport(report: EditableReport): string[] {
  const t = report.slides.reduce((a, s) => ({ texts: a.texts + s.texts, boxes: a.boxes + s.boxes, pictures: a.pictures + s.pictures }), { texts: 0, boxes: 0, pictures: 0 });
  const lines = [`Editable: ${t.texts} text box(es), ${t.boxes} shape(s) and ${t.pictures} picture(s) across ${report.slides.length} slide(s).`];
  const flat = report.slides.filter((s) => s.flattened.length > 0);
  if (flat.length > 0) {
    lines.push('On each slide\'s background picture (not editable):');
    for (const s of flat) {
      const shown = s.flattened.slice(0, 4);
      lines.push(`- slide ${s.number}: ${shown.join('; ')}${s.flattened.length > shown.length ? `; and ${s.flattened.length - shown.length} more` : ''}`);
    }
  }
  const web = report.fonts.filter((f) => f.webFont).map((f) => f.name);
  const other = report.fonts.filter((f) => !f.webFont).map((f) => f.name);
  if (report.fonts.length > 0) {
    lines.push(
      `Fonts: ${[...web.map((n) => `${n} (web font)`), ...other].join(', ')}.` +
        (web.length > 0 ? ' PowerPoint shows a substitute for a web font unless it is installed; fonts aren\'t embedded.' : ''),
    );
  }
  return lines;
}
