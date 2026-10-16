import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { EditorLayoutPreferences } from '../../../core/ui/preferences/editor-layout-preferences.service';
import { EditorSidebarResizeSession } from './editor-sidebar-resize-session';

function setup(width = 1000) {
  const viewportWidth = signal(width);
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
  const session = new EditorSidebarResizeSession(layout as never, () => viewportWidth());
  return { session, preferences, layout, viewportWidth };
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

  it('reports the current allowed resize range for each sidebar', () => {
    const { session } = setup(1000);

    expect(session.resizeRange('left')).toEqual({ min: 180, max: 450, value: 260 });
    expect(session.resizeRange('right')).toEqual({ min: 200, max: 420, value: 230 });
  });

  it('constrains sidebar columns to the viewport without changing saved widths', () => {
    const { session, preferences, viewportWidth } = setup(1600);
    preferences.update((current) => ({
      ...current,
      leftSidebarWidth: 520,
      rightSidebarWidth: 520,
    }));

    viewportWidth.set(900);
    session.clampToViewport();
    expect(session.gridTemplate()).toBe('180px minmax(0, 1fr) 400px');
    expect(preferences()).toMatchObject({ leftSidebarWidth: 520, rightSidebarWidth: 520 });

    preferences.update((current) => ({
      ...current,
      leftSidebarWidth: 260,
      rightSidebarWidth: 230,
    }));
    expect(session.gridTemplate()).toBe('260px minmax(0, 1fr) 230px');

    preferences.update((current) => ({
      ...current,
      leftSidebarWidth: 520,
      rightSidebarWidth: 520,
    }));
    viewportWidth.set(1600);
    session.clampToViewport();
    expect(session.gridTemplate()).toBe('520px minmax(0, 1fr) 520px');
    expect(preferences()).toMatchObject({ leftSidebarWidth: 520, rightSidebarWidth: 520 });
  });

  it('does not persist a viewport-constrained width when a divider is released without moving', () => {
    const { session, preferences, viewportWidth } = setup(900);
    preferences.update((current) => ({
      ...current,
      leftSidebarWidth: 520,
      rightSidebarWidth: 520,
    }));
    session.clampToViewport();
    const event = {
      button: 0,
      pointerId: 9,
      clientX: 100,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: { setPointerCapture: vi.fn() },
    } as unknown as PointerEvent;

    session.begin('left', event);
    session.end({ pointerId: 9 } as PointerEvent);

    expect(preferences()).toMatchObject({ leftSidebarWidth: 520, rightSidebarWidth: 520 });
    viewportWidth.set(1600);
    session.clampToViewport();
    expect(session.gridTemplate()).toBe('520px minmax(0, 1fr) 520px');
  });
});
