export type KeyboardAction =
  | 'move-forward' | 'move-backward' | 'move-left' | 'move-right' | 'move-up' | 'move-down'
  | 'undo' | 'redo' | 'select-all' | 'clear-selection' | 'delete-selection'
  | 'tool-place' | 'tool-select' | 'mode-3d' | 'mode-y-layer' | 'fit-structure' | 'focus-selection' | 'save-project'
  | `quick-slot-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;
export type MovementAction = Extract<KeyboardAction, `move-${string}`>;
export type KeyboardRouteOwner = 'camera' | 'editor';

export interface KeyboardRouteTrace {
  readonly code: string;
  readonly action?: KeyboardAction;
  readonly owner?: KeyboardRouteOwner;
  readonly mutation?: string;
}

export function isMovementAction(action: KeyboardAction | undefined): action is MovementAction {
  return !!action && action.startsWith('move-');
}

export function keyboardRouteOwner(action: KeyboardAction | undefined): KeyboardRouteOwner | undefined {
  return action ? (isMovementAction(action) ? 'camera' : 'editor') : undefined;
}

/** Small dev/test-only description of the single owner selected for an input event. */
export function keyboardRouteTrace(event: { readonly code?: string; readonly key: string }, action: KeyboardAction | undefined, mutation?: string): KeyboardRouteTrace {
  return { code: event.code || event.key, action, owner: keyboardRouteOwner(action), ...(mutation ? { mutation } : {}) };
}

export const DEFAULT_KEYBINDINGS: Readonly<Record<KeyboardAction, string>> = {
  'move-forward': 'W', 'move-backward': 'S', 'move-left': 'A', 'move-right': 'D', 'move-up': 'Space', 'move-down': 'Shift',
  undo: 'Ctrl+Z', redo: 'Ctrl+Y|Ctrl+Shift+Z', 'select-all': 'Ctrl+A', 'clear-selection': '', 'delete-selection': 'Delete|Backspace',
  'tool-place': '', 'tool-select': '', 'mode-3d': '', 'mode-y-layer': '', 'fit-structure': '', 'focus-selection': '', 'save-project': 'Ctrl+S',
  'quick-slot-1': '1', 'quick-slot-2': '2', 'quick-slot-3': '3', 'quick-slot-4': '4', 'quick-slot-5': '5',
  'quick-slot-6': '6', 'quick-slot-7': '7', 'quick-slot-8': '8', 'quick-slot-9': '9', 'quick-slot-10': '0',
};

export const KEYBOARD_ACTIONS: readonly { readonly action: KeyboardAction; readonly group: 'movement' | 'tools-view' | 'editing' | 'quickBar'; }[] = [
  { action: 'move-forward', group: 'movement' }, { action: 'move-backward', group: 'movement' }, { action: 'move-left', group: 'movement' }, { action: 'move-right', group: 'movement' }, { action: 'move-up', group: 'movement' }, { action: 'move-down', group: 'movement' },
  { action: 'tool-place', group: 'tools-view' }, { action: 'tool-select', group: 'tools-view' }, { action: 'mode-3d', group: 'tools-view' }, { action: 'mode-y-layer', group: 'tools-view' }, { action: 'fit-structure', group: 'tools-view' }, { action: 'focus-selection', group: 'tools-view' }, { action: 'save-project', group: 'tools-view' },
  { action: 'undo', group: 'editing' }, { action: 'redo', group: 'editing' }, { action: 'select-all', group: 'editing' }, { action: 'clear-selection', group: 'editing' }, { action: 'delete-selection', group: 'editing' },
  ...Array.from({ length: 10 }, (_, index) => ({ action: `quick-slot-${index + 1}` as KeyboardAction, group: 'quickBar' as const })),
];

const modifiers = new Set(['Ctrl', 'Alt', 'Shift', 'Meta']);
const modifierOrder = ['Ctrl', 'Alt', 'Shift', 'Meta'];

export function normalizeBinding(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value.split('+').map((part) => normalizeToken(part)).filter((part): part is string => !!part);
  if (!parts.length || parts.length > 3) return undefined;
  const unique = [...new Set(parts)];
  const nonModifiers = unique.filter((part) => !modifiers.has(part));
  if (unique.length !== parts.length || unique.length > 1 && nonModifiers.length !== 1) return undefined;
  if (unique.length === 1 && modifiers.has(unique[0])) return unique[0];
  return [...modifierOrder.filter((modifier) => unique.includes(modifier)), nonModifiers[0]].join('+');
}

export function normalizeBindings(value: unknown): Readonly<Record<KeyboardAction, string>> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_KEYBINDINGS } as Record<KeyboardAction, string>;
  for (const { action } of KEYBOARD_ACTIONS) result[action] = source[action] === '' ? '' : normalizeBindingSet(source[action]) ?? DEFAULT_KEYBINDINGS[action];
  return result;
}

export function bindingFromKeyboardEvent(event: { readonly key: string; readonly code?: string; readonly ctrlKey?: boolean; readonly altKey?: boolean; readonly shiftKey?: boolean; readonly metaKey?: boolean }): string | undefined {
  const primary = normalizeToken(codeToken(event.code) ?? event.key);
  if (!primary) return undefined;
  const activeModifiers = [...event.ctrlKey ? ['Ctrl'] : [], ...event.altKey ? ['Alt'] : [], ...event.shiftKey ? ['Shift'] : [], ...event.metaKey ? ['Meta'] : []];
  if (modifiers.has(primary) && activeModifiers.length === 1 && activeModifiers[0] === primary) return primary;
  return normalizeBinding([...activeModifiers, primary].join('+'));
}

export function isModifierOnlyBinding(binding: string | undefined): boolean {
  return !!binding && modifiers.has(binding);
}

export function keyboardActionForEvent(event: { readonly key: string; readonly code?: string; readonly ctrlKey?: boolean; readonly altKey?: boolean; readonly shiftKey?: boolean; readonly metaKey?: boolean; readonly target: EventTarget | null }, bindings: Readonly<Record<KeyboardAction, string>>): KeyboardAction | undefined {
  if (isEditableKeyboardTarget(event.target)) return undefined;
  const binding = bindingFromKeyboardEvent(event);
  if (!binding) return undefined;
  const aliases = [binding];
  if (binding.startsWith('Meta+')) aliases.push(`Ctrl+${binding.slice(5)}`);
  if (binding.startsWith('Ctrl+')) aliases.push(`Meta+${binding.slice(5)}`);
  return KEYBOARD_ACTIONS.find(({ action }) => bindings[action].split('|').some((configured) => aliases.includes(configured)))?.action;
}

export function findBindingConflicts(bindings: Readonly<Record<KeyboardAction, string>>): readonly KeyboardAction[][] {
  const groups = new Map<string, KeyboardAction[]>();
  for (const { action } of KEYBOARD_ACTIONS) { for (const binding of bindings[action].split('|').map(normalizeBinding).filter((value): value is string => !!value)) { const conflictKey = binding.startsWith('Meta+') ? `Ctrl+${binding.slice(5)}` : binding; groups.set(conflictKey, [...(groups.get(conflictKey) ?? []), action]); } }
  return [...groups.values()].filter((actions) => actions.length > 1);
}

function normalizeBindingSet(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.split('|').map((binding) => normalizeBinding(binding)).filter((binding): binding is string => !!binding);
  return normalized.length ? [...new Set(normalized)].join('|') : undefined;
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || element.contentEditable === 'true' || element.closest('[contenteditable]:not([contenteditable="false"])') !== null || element.matches('input, textarea, select'));
}

function normalizeToken(value: string): string | undefined {
  if (value === ' ') return 'Space';
  const token = value.trim();
  if (!token) return undefined;
  const lower = token.toLocaleLowerCase();
  if (lower === 'control' || lower === 'ctrl') return 'Ctrl';
  if (lower === 'option' || lower === 'alt') return 'Alt';
  if (lower === 'shift') return 'Shift';
  if (lower === 'cmd' || lower === 'command' || lower === 'meta') return 'Meta';
  if (lower === 'spacebar') return 'Space';
  if (lower === 'esc') return 'Escape';
  if (lower === 'del') return 'Delete';
  return token.length === 1 ? token.toLocaleUpperCase() : token[0].toLocaleUpperCase() + token.slice(1);
}

function codeToken(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (code === 'Space') return 'Space';
  if (code === 'Delete') return 'Delete';
  if (code === 'Backspace') return 'Backspace';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return undefined;
}
