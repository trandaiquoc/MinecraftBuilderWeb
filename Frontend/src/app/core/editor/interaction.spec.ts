import { describe, expect, it } from 'vitest';
import { isPointerClick, pointerAction } from './interaction';

describe('editor interaction', () => {
  it('suppresses edit actions after pointer drag', () => {
    expect(isPointerClick({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe(true);
    expect(isPointerClick({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(false);
  });

  it('separates Place and Select tools with modifier precedence', () => {
    expect(pointerAction('place', { ctrl: false, alt: false }, true, true)).toBe('place');
    expect(pointerAction('select', { ctrl: false, alt: false }, true, true)).toBe('select');
    expect(pointerAction('select', { ctrl: false, alt: false }, false, true)).toBe('clear-selection');
    expect(pointerAction('place', { ctrl: true, alt: false }, true, true)).toBe('delete');
    expect(pointerAction('place', { ctrl: false, alt: true }, true, true)).toBe('pick');
    expect(pointerAction('select', { ctrl: true, alt: false }, true, true)).toBe('delete');
  });
});
