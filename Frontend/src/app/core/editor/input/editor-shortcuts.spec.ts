import { describe, expect, it } from 'vitest';
import { editorShortcutAction, historyShortcutAction } from './editor-shortcuts';

describe('history keyboard shortcuts', () => {
  it('maps Ctrl/Meta undo and redo variants', () => {
    expect(historyShortcutAction({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, target: document.body })).toBe('undo');
    expect(historyShortcutAction({ key: 'y', ctrlKey: true, metaKey: false, shiftKey: false, target: document.body })).toBe('redo');
    expect(historyShortcutAction({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: true, target: document.body })).toBe('redo');
    expect(historyShortcutAction({ key: 'z', ctrlKey: false, metaKey: true, shiftKey: false, target: document.body })).toBe('undo');
  });

  it.each(['input', 'textarea', 'select'])('does not intercept %s editing', (tag) => {
    expect(historyShortcutAction({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, target: document.createElement(tag) })).toBeUndefined();
  });

  it('does not intercept contenteditable editing', () => {
    const element = document.createElement('div'); element.contentEditable = 'true'; document.body.appendChild(element);
    expect(historyShortcutAction({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, target: element })).toBeUndefined(); element.remove();
  });

  it('maps Select All and selection delete only outside editable controls', () => {
    expect(editorShortcutAction({ key: 'a', ctrlKey: true, metaKey: false, shiftKey: false, target: document.body })).toBe('select-all');
    expect(editorShortcutAction({ key: 'Delete', ctrlKey: false, metaKey: false, shiftKey: false, target: document.body })).toBe('delete-selection');
    expect(editorShortcutAction({ key: 'Backspace', ctrlKey: false, metaKey: false, shiftKey: false, target: document.createElement('textarea') })).toBeUndefined();
  });
});
