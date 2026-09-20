import { DEFAULT_KEYBINDINGS, keyboardActionForEvent, isEditableKeyboardTarget } from './keyboard-bindings';

export type HistoryShortcutAction = 'undo' | 'redo';
export type EditorShortcutAction = HistoryShortcutAction | 'select-all' | 'delete-selection';
type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'> & { readonly altKey?: boolean };

/** Compatibility exports for callers/tests; matching is owned by keyboard-bindings. */
export function historyShortcutAction(event: ShortcutEvent): HistoryShortcutAction | undefined {
  const action = keyboardActionForEvent(event, DEFAULT_KEYBINDINGS);
  return action === 'undo' || action === 'redo' ? action : undefined;
}

export function editorShortcutAction(event: ShortcutEvent): EditorShortcutAction | undefined {
  const action = keyboardActionForEvent(event, DEFAULT_KEYBINDINGS);
  return action === 'undo' || action === 'redo' || action === 'select-all' || action === 'delete-selection' ? action : undefined;
}

export const isEditableTarget = isEditableKeyboardTarget;
