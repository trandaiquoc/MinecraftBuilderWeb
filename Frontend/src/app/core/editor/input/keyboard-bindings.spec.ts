import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDINGS, MovementKeyOwnership, bindingFromKeyboardEvent, findBindingConflicts, isModifierOnlyBinding, isMovementAction, keyboardActionForEvent, movementPhysicalKey, normalizeBinding, normalizeBindings, physicalKeyboardIdentity, shouldSuppressEditorActionDuringMovement } from './keyboard-bindings';

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
    expect(keyboardActionForEvent({ key: 'a', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, target: null }, DEFAULT_KEYBINDINGS)).toBe('move-left');
    expect(keyboardActionForEvent({ key: 'a', code: '', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, target: null }, DEFAULT_KEYBINDINGS)).toBe('select-all');
  });

  it('resolves a deliberately conflicting saved binding deterministically once', () => {
    const bindings = normalizeBindings({ ...DEFAULT_KEYBINDINGS, 'delete-selection': 'W' });
    const action = keyboardActionForEvent({ key: 'w', code: 'KeyW', target: null }, bindings);
    expect(action).toBe('move-forward');
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

  it('normalizes coded and missing-code movement events to one physical owner', () => {
    expect(movementPhysicalKey({ code: 'KeyA', key: 'a' })).toBe(movementPhysicalKey({ code: '', key: 'a' }));
    expect(movementPhysicalKey({ code: 'KeyA', key: 'a', shiftKey: true })).toBe('KeyA');
    expect(movementPhysicalKey({ code: 'KeyA', key: 'a', ctrlKey: true, altKey: true, metaKey: true })).toBe('KeyA');
    expect(movementPhysicalKey({ code: 'KeyW', key: 'w' })).not.toBe(movementPhysicalKey({ code: 'KeyA', key: 'a' }));
    expect(movementPhysicalKey({ code: 'Space', key: ' ' })).toBe(movementPhysicalKey({ code: '', key: ' ' }));
    expect(movementPhysicalKey({ code: '', key: 'Spacebar' })).toBe('Space');
    expect(movementPhysicalKey({ code: 'ShiftLeft', key: 'Shift' })).toBe(movementPhysicalKey({ code: '', key: 'Shift' }));
    expect(movementPhysicalKey({ code: '', key: 'SHIFT' })).toBe('Shift');
    expect(movementPhysicalKey({ code: 'ShiftRight', key: 'Shift' })).toBe(movementPhysicalKey({ code: 'ShiftLeft', key: 'Shift' }));
    expect(physicalKeyboardIdentity({ code: '', key: 'Unidentified' })).toBeUndefined();
    expect(physicalKeyboardIdentity({ code: '', key: 'Process' })).toBeUndefined();
    expect(physicalKeyboardIdentity({ code: '', key: 'Dead' })).toBeUndefined();
    expect(physicalKeyboardIdentity({ code: 'KeyA', key: 'Unidentified' })).toBe('KeyA');
  });

  it('keeps repeated and multi-owner action transitions deterministic', () => {
    const ownership = new MovementKeyOwnership();
    expect(ownership.press('KeyW', 'move-forward')).toBeUndefined();
    expect(ownership.press('KeyW', 'move-forward')).toBe('move-forward');
    expect(ownership.press('KeyA', 'move-forward')).toBeUndefined();
    expect(ownership.actions()).toEqual(['move-forward']);
    expect(ownership.release('KeyW')).toBe('move-forward');
    expect(ownership.hasAction('move-forward')).toBe(true);
    expect(ownership.release('KeyA')).toBe('move-forward');
    expect(ownership.hasAction('move-forward')).toBe(false);
    ownership.press('KeyD', 'move-right'); ownership.press('Space', 'move-up');
    expect(ownership.clear()).toEqual(['move-right', 'move-up']);
    expect(ownership.ownerCount()).toBe(0);
  });

  it('suppresses only destructive editor actions while any movement owner remains active', () => {
    const ownership = new MovementKeyOwnership();
    expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(false);
    ownership.press('KeyA', 'move-left');
    expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(true);
    expect(shouldSuppressEditorActionDuringMovement('undo', ownership)).toBe(false);
    ownership.press('KeyW', 'move-forward');
    ownership.release('KeyA');
    expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(true);
    ownership.release('KeyW');
    expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(false);
  });

  it('keeps the movement/delete policy independent from the physical key label', () => {
    const ownership = new MovementKeyOwnership();
    ownership.press('ArrowLeft', 'move-left');
    expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(true);
    expect(shouldSuppressEditorActionDuringMovement('select-all', ownership)).toBe(false);
  });

  it('keeps suppression active across repeat, alternate movement owners, and remapped movement keys', () => {
    const ownership = new MovementKeyOwnership();
    for (const [owner, action] of [['KeyD', 'move-right'], ['KeyW', 'move-forward'], ['KeyS', 'move-backward']] as const) {
      expect(ownership.press(owner, action)).toBeUndefined();
      expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(true);
      expect(ownership.press(owner, action)).toBe(action);
    }
    expect(keyboardActionForEvent({ key: 'ArrowLeft', code: 'ArrowLeft', target: null }, { ...DEFAULT_KEYBINDINGS, 'move-left': 'ArrowLeft' })).toBe('move-left');
    expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(true);
    ownership.release('KeyD'); ownership.release('KeyW'); ownership.release('KeyS');
    expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(false);
  });

  it('does not suppress an unknown key or Ctrl+A and allows Delete after the final release', () => {
    const ownership = new MovementKeyOwnership();
    ownership.press('KeyA', 'move-left');
    expect(keyboardActionForEvent({ key: 'Unidentified', code: '', target: null }, DEFAULT_KEYBINDINGS)).toBeUndefined();
    expect(keyboardActionForEvent({ key: 'a', code: 'KeyA', ctrlKey: true, target: null }, DEFAULT_KEYBINDINGS)).toBe('select-all');
    expect(shouldSuppressEditorActionDuringMovement('select-all', ownership)).toBe(false);
    expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(true);
    ownership.release('KeyA');
    expect(shouldSuppressEditorActionDuringMovement('delete-selection', ownership)).toBe(false);
    expect(keyboardActionForEvent({ key: 'Delete', code: 'Delete', target: null }, DEFAULT_KEYBINDINGS)).toBe('delete-selection');
  });
});
