export type HistoryShortcutAction = 'undo' | 'redo';
export type EditorShortcutAction = HistoryShortcutAction | 'select-all' | 'delete-selection';

export function historyShortcutAction(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'>): HistoryShortcutAction | undefined {
  if ((!event.ctrlKey && !event.metaKey) || isEditableTarget(event.target)) return undefined;
  const key = event.key.toLocaleLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return undefined;
}

export function editorShortcutAction(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'>): EditorShortcutAction | undefined {
  const history = historyShortcutAction(event);
  if (history) return history;
  if (isEditableTarget(event.target)) return undefined;
  const key = event.key.toLocaleLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'a') return 'select-all';
  return key === 'delete' || key === 'backspace' ? 'delete-selection' : undefined;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.contentEditable === 'true' || target.closest('[contenteditable]:not([contenteditable="false"])') !== null || target.matches('input, textarea, select'));
}
