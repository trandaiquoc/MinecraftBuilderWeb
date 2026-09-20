import { EditorTool } from '../state/tool.service';

export type EditorPointerAction = 'place' | 'delete' | 'pick' | 'select' | 'clear-selection' | 'none';
export interface PointerModifiers { readonly ctrl: boolean; readonly alt: boolean; }

export function isPointerClick(start: { readonly x: number; readonly y: number } | undefined, end: { readonly x: number; readonly y: number }, threshold = 5): boolean {
  return !!start && Math.hypot(end.x - start.x, end.y - start.y) <= threshold;
}

export function pointerAction(tool: EditorTool, modifiers: PointerModifiers, hasBlock: boolean, hasTarget: boolean): EditorPointerAction {
  if (modifiers.alt) return hasBlock ? 'pick' : 'none';
  if (modifiers.ctrl) return hasBlock ? 'delete' : 'none';
  if (tool === 'select') return hasBlock ? 'select' : 'clear-selection';
  return hasTarget ? 'place' : 'none';
}
