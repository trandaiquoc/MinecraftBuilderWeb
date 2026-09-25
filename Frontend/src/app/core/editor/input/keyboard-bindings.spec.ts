import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDINGS, bindingFromKeyboardEvent, findBindingConflicts, isModifierOnlyBinding, isMovementAction, keyboardActionForEvent, keyboardRouteOwner, keyboardRouteTrace, normalizeBinding, normalizeBindings } from './keyboard-bindings';

describe('keyboard binding model', () => {
  it('normalizes modifier order and supports up to three tokens', () => {
    expect(normalizeBinding('shift+ctrl+z')).toBe('Ctrl+Shift+Z');
    expect(normalizeBinding('Ctrl+Alt+K')).toBe('Ctrl+Alt+K');
    expect(normalizeBinding('Ctrl+Alt+Shift+K')).toBeUndefined();
    expect(bindingFromKeyboardEvent({ key: 'z', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe('Ctrl+Shift+Z');
    expect(isModifierOnlyBinding(bindingFromKeyboardEvent({ key: 'Control', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }))).toBe(true);
    expect(isModifierOnlyBinding('Ctrl+Z')).toBe(false);
  });

  it('matches Cmd as the platform alias for Ctrl defaults and supports redo aliases', () => {
    expect(keyboardActionForEvent({ key: 'z', ctrlKey: false, altKey: false, shiftKey: false, metaKey: true, target: null }, DEFAULT_KEYBINDINGS)).toBe('undo');
    expect(keyboardActionForEvent({ key: 'z', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false, target: null }, DEFAULT_KEYBINDINGS)).toBe('redo');
    expect(keyboardActionForEvent({ key: 'Backspace', target: null }, DEFAULT_KEYBINDINGS)).toBe('delete-selection');
    expect(DEFAULT_KEYBINDINGS['save-project']).toBe('Ctrl+S');
    expect(keyboardActionForEvent({ key: 's', ctrlKey: false, altKey: false, shiftKey: false, metaKey: true, target: null }, DEFAULT_KEYBINDINGS)).toBe('save-project');
  });

  it('keeps D mapped to camera move-right rather than a structure mutation', () => {
    for (const [key, action] of [['w', 'move-forward'], ['a', 'move-left'], ['s', 'move-backward'], ['d', 'move-right']] as const) {
      expect(keyboardActionForEvent({ key, code: `Key${key.toUpperCase()}`, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, target: null }, DEFAULT_KEYBINDINGS)).toBe(action);
    }
    expect(keyboardActionForEvent({ key: 'Delete', code: 'Delete', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, target: null }, DEFAULT_KEYBINDINGS)).toBe('delete-selection');
    expect(isMovementAction('move-right')).toBe(true);
    expect(isMovementAction('delete-selection')).toBe(false);
  });

  it('routes each resolved action to exactly one owner and exposes a compact trace', () => {
    expect(keyboardRouteOwner('move-forward')).toBe('camera');
    expect(keyboardRouteOwner('delete-selection')).toBe('editor');
    expect(keyboardRouteOwner(undefined)).toBeUndefined();
    expect(keyboardRouteTrace({ code: 'KeyW', key: 'w' }, 'move-forward')).toEqual({ code: 'KeyW', action: 'move-forward', owner: 'camera' });
    expect(keyboardRouteTrace({ key: 'Delete' }, 'delete-selection', 'Delete selection')).toEqual({ code: 'Delete', action: 'delete-selection', owner: 'editor', mutation: 'Delete selection' });
  });

  it('resolves a deliberately conflicting saved binding deterministically once', () => {
    const bindings = normalizeBindings({ ...DEFAULT_KEYBINDINGS, 'delete-selection': 'W' });
    const action = keyboardActionForEvent({ key: 'w', code: 'KeyW', target: null }, bindings);
    expect(action).toBe('move-forward');
    expect(keyboardRouteOwner(action)).toBe('camera');
  });

  it('normalizes missing bindings to defaults and detects conflicts', () => {
    const bindings = normalizeBindings({ 'quick-slot-1': 'Ctrl+K', 'quick-slot-2': 'Ctrl+K' });
    expect(bindings['move-forward']).toBe('W');
    expect(bindings['delete-selection']).toBe('Delete|Backspace');
    expect(findBindingConflicts(bindings)).toEqual([['quick-slot-1', 'quick-slot-2']]);
    expect(normalizeBindings({ 'save-project': 'Alt+S' })['save-project']).toBe('Alt+S');
    expect(normalizeBindings({ 'save-project': '' })['save-project']).toBe('');
  });

  it('does not treat cleared bindings as conflicts', () => {
    expect(findBindingConflicts({ ...DEFAULT_KEYBINDINGS, undo: '', redo: '' })).toEqual([]);
  });
});
