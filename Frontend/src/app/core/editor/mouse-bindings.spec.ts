import { describe, expect, it } from 'vitest';
import { DEFAULT_MOUSE_BINDINGS, findMouseBindingConflicts, mouseActionForEvent, mouseBindingFromEvent, normalizeMouseBinding, normalizeMouseBindings } from './mouse-bindings';

describe('mouse binding model', () => {
  it('normalizes mouse tokens and modifier order', () => {
    expect(normalizeMouseBinding('left click + shift + ctrl')).toBe('Ctrl+Shift+LeftClick');
    expect(mouseBindingFromEvent({ button: 0, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false })).toBe('Ctrl+LeftClick');
    expect(mouseBindingFromEvent({ deltaY: -1, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false })).toBe('WheelUp');
  });

  it('resolves the exact modifier gesture without falling back to plain click', () => {
    expect(mouseActionForEvent({ button: 0 }, DEFAULT_MOUSE_BINDINGS)).toBe('primary-action');
    expect(mouseActionForEvent({ button: 0, ctrlKey: true }, DEFAULT_MOUSE_BINDINGS)).toBe('delete-target');
    expect(mouseActionForEvent({ button: 0, altKey: true }, DEFAULT_MOUSE_BINDINGS)).toBe('pick-block');
  });

  it('migrates missing defaults and reports conflicts', () => {
    const bindings = normalizeMouseBindings({ 'primary-action': 'Right Click', 'delete-target': 'RightClick', 'orbit-camera': '' });
    expect(bindings['primary-action']).toBe('RightClick');
    expect(findMouseBindingConflicts(bindings)).toEqual([['primary-action', 'delete-target']]);
    expect(bindings['orbit-camera']).toBe('');
  });
});
