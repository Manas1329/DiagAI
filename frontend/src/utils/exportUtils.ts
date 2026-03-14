import { toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Node, getRectOfNodes, getTransformForBounds } from 'reactflow';

const EXPORT_W = 1400;
const EXPORT_H = 900;

function getViewport(): HTMLElement | null {
  return document.querySelector('.react-flow__viewport');
}

function buildStyle(transform: number[]): Partial<CSSStyleDeclaration> {
  return {
    width:     `${EXPORT_W}px`,
    height:    `${EXPORT_H}px`,
    transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
  };
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function exportPng(rfNodes: Node[]): Promise<void> {
  const viewport = getViewport();
  if (!viewport || rfNodes.length === 0) return;

  const bounds    = getRectOfNodes(rfNodes);
  const transform = getTransformForBounds(bounds, EXPORT_W, EXPORT_H, 0.5, 2);
  const dataUrl   = await toPng(viewport, {
    backgroundColor: '#ffffff',
    width:  EXPORT_W,
    height: EXPORT_H,
    style: buildStyle(transform) as Record<string, string>,
  });
  download(dataUrl, 'diagram.png');
}

export async function exportSvg(rfNodes: Node[]): Promise<void> {
  const viewport = getViewport();
  if (!viewport || rfNodes.length === 0) return;

  const bounds    = getRectOfNodes(rfNodes);
  const transform = getTransformForBounds(bounds, EXPORT_W, EXPORT_H, 0.5, 2);
  const dataUrl   = await toSvg(viewport, {
    backgroundColor: '#ffffff',
    width:  EXPORT_W,
    height: EXPORT_H,
    style: buildStyle(transform) as Record<string, string>,
  });
  download(dataUrl, 'diagram.svg');
}

export async function exportPdf(rfNodes: Node[]): Promise<void> {
  const viewport = getViewport();
  if (!viewport || rfNodes.length === 0) return;

  const bounds    = getRectOfNodes(rfNodes);
  const transform = getTransformForBounds(bounds, EXPORT_W, EXPORT_H, 0.5, 2);
  const dataUrl   = await toPng(viewport, {
    backgroundColor: '#ffffff',
    width:  EXPORT_W,
    height: EXPORT_H,
    style: buildStyle(transform) as Record<string, string>,
  });

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [EXPORT_W, EXPORT_H] });
  pdf.addImage(dataUrl, 'PNG', 0, 0, EXPORT_W, EXPORT_H);
  pdf.save('diagram.pdf');
}
