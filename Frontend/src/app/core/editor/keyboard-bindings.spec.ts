import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDINGS, bindingFromKeyboardEvent, findBindingConflicts, isModifierOnlyBinding, keyboardActionForEvent, normalizeBinding, normalizeBindings } from './keyboard-bindings';

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
  });

  it('normalizes missing bindings to defaults and detects conflicts', () => {
    const bindings = normalizeBindings({ 'quick-slot-1': 'Ctrl+K', 'quick-slot-2': 'Ctrl+K' });
    expect(bindings['move-forward']).toBe('W');
    expect(bindings['delete-selection']).toBe('Delete|Backspace');
    expect(findBindingConflicts(bindings)).toEqual([['quick-slot-1', 'quick-slot-2']]);
  });
});
