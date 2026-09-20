export type MouseAction =
  | 'primary-action'
  | 'delete-target'
  | 'pick-block'
  | 'orbit-camera'
  | 'pan-camera'
  | 'zoom-in'
  | 'zoom-out';

export const DEFAULT_MOUSE_BINDINGS: Readonly<Record<MouseAction, string>> = {
  'primary-action': 'LeftClick',
  'delete-target': 'Ctrl+LeftClick',
  'pick-block': 'Alt+LeftClick',
  'orbit-camera': 'RightClick',
  'pan-camera': 'MiddleClick',
  'zoom-in': 'WheelUp',
  'zoom-out': 'WheelDown',
};

export const MOUSE_ACTIONS: readonly { readonly action: MouseAction; readonly group: 'viewport'; }[] = [
  { action: 'primary-action', group: 'viewport' },
  { action: 'delete-target', group: 'viewport' },
  { action: 'pick-block', group: 'viewport' },
  { action: 'orbit-camera', group: 'viewport' },
  { action: 'pan-camera', group: 'viewport' },
  { action: 'zoom-in', group: 'viewport' },
  { action: 'zoom-out', group: 'viewport' },
];

const modifiers = new Set(['Ctrl', 'Alt', 'Shift', 'Meta']);
const modifierOrder = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const mouseTokens = new Set(['LeftClick', 'RightClick', 'MiddleClick', 'WheelUp', 'WheelDown']);

export function normalizeMouseBinding(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value.split('+').map(normalizeMouseToken).filter((part): part is string => !!part);
  if (!parts.length || parts.length > 3) return undefined;
  const unique = [...new Set(parts)];
  const buttons = unique.filter((part) => mouseTokens.has(part));
  if (unique.length !== parts.length || buttons.length !== 1) return undefined;
  return [...modifierOrder.filter((modifier) => unique.includes(modifier)), buttons[0]].join('+');
}

export function normalizeMouseBindings(value: unknown): Readonly<Record<MouseAction, string>> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_MOUSE_BINDINGS } as Record<MouseAction, string>;
  for (const { action } of MOUSE_ACTIONS) {
    result[action] = source[action] === '' ? '' : normalizeMouseBinding(source[action]) ?? DEFAULT_MOUSE_BINDINGS[action];
  }
  return result;
}

export function mouseBindingFromEvent(event: { readonly button?: number; readonly deltaY?: number; readonly ctrlKey?: boolean; readonly altKey?: boolean; readonly shiftKey?: boolean; readonly metaKey?: boolean }): string | undefined {
  const token = typeof event.deltaY === 'number' ? event.deltaY < 0 ? 'WheelUp' : event.deltaY > 0 ? 'WheelDown' : undefined : pointerToken(event.button);
  if (!token) return undefined;
  const activeModifiers = [
    ...(event.ctrlKey ? ['Ctrl'] : []),
    ...(event.altKey ? ['Alt'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    ...(event.metaKey ? ['Meta'] : []),
  ];
  return normalizeMouseBinding([...activeModifiers, token].join('+'));
}

export function mouseActionForEvent(event: { readonly button?: number; readonly deltaY?: number; readonly ctrlKey?: boolean; readonly altKey?: boolean; readonly shiftKey?: boolean; readonly metaKey?: boolean }, bindings: Readonly<Record<MouseAction, string>>): MouseAction | undefined {
  const binding = mouseBindingFromEvent(event);
  if (!binding) return undefined;
  return MOUSE_ACTIONS.find(({ action }) => bindings[action].split('|').some((configured) => normalizeMouseBinding(configured) === binding))?.action;
}

export function findMouseBindingConflicts(bindings: Readonly<Record<MouseAction, string>>): readonly MouseAction[][] {
  const groups = new Map<string, MouseAction[]>();
  for (const { action } of MOUSE_ACTIONS) {
    for (const binding of bindings[action].split('|').map(normalizeMouseBinding).filter((value): value is string => !!value)) {
      groups.set(binding, [...(groups.get(binding) ?? []), action]);
    }
  }
  return [...groups.values()].filter((actions) => actions.length > 1);
}

export function mouseBindingTokens(binding: string): readonly string[] {
  return binding.split('+').map((token) => token.trim()).filter(Boolean);
}

function pointerToken(button: number | undefined): string | undefined {
  return button === 0 ? 'LeftClick' : button === 1 ? 'MiddleClick' : button === 2 ? 'RightClick' : undefined;
}

function normalizeMouseToken(value: string): string | undefined {
  const normalized = value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) return undefined;
  if (normalized === 'ctrl' || normalized === 'control') return 'Ctrl';
  if (normalized === 'alt' || normalized === 'option') return 'Alt';
  if (normalized === 'shift') return 'Shift';
  if (normalized === 'meta' || normalized === 'cmd' || normalized === 'command') return 'Meta';
  if (normalized === 'left' || normalized === 'leftclick' || normalized === 'button0') return 'LeftClick';
  if (normalized === 'right' || normalized === 'rightclick' || normalized === 'button2') return 'RightClick';
  if (normalized === 'middle' || normalized === 'middleclick' || normalized === 'button1') return 'MiddleClick';
  if (normalized === 'wheelup' || normalized === 'scrollup') return 'WheelUp';
  if (normalized === 'wheeldown' || normalized === 'scrolldown') return 'WheelDown';
  return undefined;
}
