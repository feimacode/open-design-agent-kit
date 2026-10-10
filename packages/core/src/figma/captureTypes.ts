// The ".od-figma.json" capture IR types (see workspace/figmaCapture.ts and
// figma-plugin/IR.md). Kept free of Node imports so the browser-side capture
// (figma/captureIr.ts, bundled into the VS Code webview) can import them.

export interface FigmaCaptureSource {
  url: string;
  title: string;
  capturedAt: number;
  viewport: { width: number; height: number };
  dpr: number;
}

export interface FigmaCaptureFont {
  family: string;
  styles: string[];
}

export interface FigmaCaptureSolidPaint {
  type: 'SOLID';
  color: { r: number; g: number; b: number };
  opacity?: number;
}

export interface FigmaCaptureImagePaint {
  type: 'IMAGE';
  scaleMode: string;
  /** Placeholder emitted by the capture step; resolved to dataUri before writing. */
  url?: string;
  dataUri?: string;
}

export type FigmaCapturePaint = FigmaCaptureSolidPaint | FigmaCaptureImagePaint;

export interface FigmaCaptureEffect {
  type: 'DROP_SHADOW';
  color: { r: number; g: number; b: number; a: number };
  offset: { x: number; y: number };
  radius: number;
  spread: number;
}

export interface FigmaCaptureCornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

interface FigmaCaptureBoxNode {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: FigmaCapturePaint[];
  strokes?: FigmaCapturePaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: FigmaCaptureCornerRadii;
  effects?: FigmaCaptureEffect[];
  opacity?: number;
}

export interface FigmaCaptureFrameNode extends FigmaCaptureBoxNode {
  type: 'FRAME';
  clipsContent?: boolean;
  children?: FigmaCaptureNode[];
}

export interface FigmaCaptureRectangleNode extends FigmaCaptureBoxNode {
  type: 'RECTANGLE';
}

export interface FigmaCaptureTextNode {
  type: 'TEXT';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  characters: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  color: { r: number; g: number; b: number };
  opacity?: number;
}

export type FigmaCaptureNode = FigmaCaptureFrameNode | FigmaCaptureRectangleNode | FigmaCaptureTextNode;

export interface FigmaCaptureDocument {
  version: 1;
  source: FigmaCaptureSource;
  fonts: FigmaCaptureFont[];
  root: FigmaCaptureFrameNode;
}
