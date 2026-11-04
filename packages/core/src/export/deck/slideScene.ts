// Editable PPTX (openspec add-editable-pptx-export, design D2): what one slide
// looks like as plain data, read from the browser's layout by readSlideScene
// (./pageScripts) and written by ./assembleEditable. Every position is in CSS
// px relative to the pinned slide stage. Kept free of any PowerPoint library so
// a later writer (say, into a customer's own .potx master) can reuse it.

/** A colour as the browser computes it, split into hex and alpha. */
export interface SceneColor {
  /** Six hex digits, no '#'. */
  hex: string;
  /** 0 (transparent) to 1 (opaque). */
  alpha: number;
}

export interface SceneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneRun {
  text: string;
  /** Starts a new line (a <br>, or a new list item in the same block). */
  breakBefore?: boolean;
  /** The first usable family of the computed font stack. */
  font: string;
  /** CSS px. */
  size: number;
  weight: number;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: SceneColor;
  /** CSS px; 0 for normal. */
  letterSpacing: number;
}

export interface SceneText {
  /** Where the text box goes. */
  rect: SceneRect;
  runs: SceneRun[];
  align: 'left' | 'center' | 'right' | 'justify';
  /** CSS px. */
  lineHeight: number;
  /** Lines the browser laid the text out on. */
  lines: number;
  /** A list item's marker, written as a PowerPoint bullet hanging `indent` px left of the text. */
  bullet?: { kind: 'char'; char: string; indent: number } | { kind: 'number'; style: 'arabicPeriod' | 'alphaLcPeriod' | 'alphaUcPeriod' | 'romanLcPeriod' | 'romanUcPeriod'; start: number; indent: number };
}

export interface SceneBox {
  /** Paint order among boxes and pictures (document order of their elements). */
  z: number;
  rect: SceneRect;
  fill?: SceneColor;
  /** Uniform corner radius, CSS px. */
  radius: number;
  line?: { width: number; color: SceneColor; dash: 'solid' | 'dash' | 'dot' };
}

export interface ScenePicture {
  /** Paint order among boxes and pictures (document order of their elements). */
  z: number;
  rect: SceneRect;
  /** A data: URL (image/png or image/jpeg), already cropped and clipped to what the slide shows. */
  data: string;
}

export type FlattenReason = 'svg' | 'canvas' | 'transformed' | 'opacity' | 'filter' | 'clipped' | 'blend' | 'gradient-text' | 'image' | 'other';

export interface SceneFlattened {
  reason: FlattenReason;
  /** A short label: the element and the start of its text. */
  label: string;
}

export interface SlideScene {
  /** The slide's own solid background (or the first one behind it), used when there is no background picture. */
  background: SceneColor;
  boxes: SceneBox[];
  pictures: ScenePicture[];
  texts: SceneText[];
  flattened: SceneFlattened[];
  /** Visible text that is neither in a text box nor flattened (should be empty). */
  uncovered: string[];
  /** Font families used, and which of them the page loaded as web fonts. */
  fonts: Array<{ name: string; webFont: boolean }>;
}

/** A scene ready to write: the scene, its background picture (if any), and its notes. */
export interface EditableSlide {
  number: number;
  scene: SlideScene;
  /** PNG or JPEG of everything not made native; absent when it was one flat colour. */
  plate?: { buffer: Buffer; jpeg: boolean };
  notes?: string;
}
