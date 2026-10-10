import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { EditorLayoutPreferences } from '../../../core/ui/preferences/editor-layout-preferences.service';
import { EditorSidebarResizeSession } from './editor-sidebar-resize-session';

function setup(width = 1000) {
  const preferences = signal<EditorLayoutPreferences>({
    editorToolbarVisible: true,
    leftSidebarVisible: true,
    rightSidebarVisible: true,
    quickBarVisible: true,
    statusBarVisible: true,
    leftSidebarWidth: 260,
    rightSidebarWidth: 230,
  });
  const layout = {
    preferences,
    setSidebarWidth: (side: 'left' | 'right', value: number) =>
      preferences.update((current) => ({
        ...current,
        [side === 'left' ? 'leftSidebarWidth' : 'rightSidebarWidth']: value,
      })),
  };
  const session = new EditorSidebarResizeSession(layout as never, () => width);
  return { session, preferences, layout };
}

describe('EditorSidebarResizeSession', () => {
  it('keeps drag width transient until release, then persists the final width', () => {
    const { session, preferences } = setup();
    const event = {
      button: 0,
      pointerId: 3,
      clientX: 100,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: { setPointerCapture: vi.fn() },
    } as unknown as PointerEvent;
    session.begin('left', event);
    session.move({
      pointerId: 3,
      clientX: 140,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);
    expect(session.effectiveWidth('left')).toBe(300);
    expect(preferences().leftSidebarWidth).toBe(260);
    session.end({ pointerId: 3 } as PointerEvent);
    expect(preferences().leftSidebarWidth).toBe(300);
    expect(session.effectiveWidth('left')).toBe(300);
  });

  it('clamps against minimum widths and the usable center viewport', () => {
    const { session } = setup(850);
    const event = {
      button: 0,
      pointerId: 1,
      clientX: 10,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: {},
    } as unknown as PointerEvent;
    session.begin('left', event);
    session.move({
      pointerId: 1,
      clientX: 500,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);
    expect(session.effectiveWidth('left')).toBe(300);
    session.reset();
    const shrink = { ...event, pointerId: 2, clientX: 200 } as PointerEvent;
    session.begin('right', shrink);
    session.move({
      pointerId: 2,
      clientX: 900,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);
    expect(session.effectiveWidth('right')).toBe(200);
  });

  it('supports keyboard resizing and recomputes columns when a sidebar is hidden', () => {
    const { session, preferences } = setup();
    const keyEvent = { key: 'ArrowRight', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    session.adjust('left', keyEvent);
    expect(preferences().leftSidebarWidth).toBe(276);
    preferences.update((current) => ({ ...current, rightSidebarVisible: false }));
    expect(session.gridTemplate()).toBe('276px minmax(0, 1fr)');
  });
});
