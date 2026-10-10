import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import type { EditorLayoutPreferences } from '../../../../core/ui/preferences/editor-layout-preferences.service';
import { GroupMovePanelSession } from './group-move-panel-session';

function setup() {
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
    setGroupMovePanelPosition: (x: number, y: number) =>
      preferences.update((current) => ({ ...current, groupMovePanelX: x, groupMovePanelY: y })),
  };
  return {
    preferences,
    session: new GroupMovePanelSession(
      layout as never,
      () => ({ width: 640, height: 480 }),
      () => ({ width: 300, height: 280 }),
    ),
  };
}

describe('GroupMovePanelSession', () => {
  it('moves and clamps the panel within the viewport, persisting its position', () => {
    const { preferences, session } = setup();
    const event = {
      button: 0,
      pointerId: 4,
      clientX: 100,
      clientY: 100,
      target: document.createElement('header'),
      currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent;
    session.begin(event);
    session.move({
      pointerId: 4,
      clientX: 5000,
      clientY: 5000,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent);
    expect(preferences().groupMovePanelX).toBe(592);
    expect(preferences().groupMovePanelY).toBe(432);
  });

  it('ignores pointer events outside the active drag and controls inside the header', () => {
    const { session, preferences } = setup();
    const control = document.createElement('button');
    const event = {
      button: 0,
      pointerId: 2,
      clientX: 0,
      clientY: 0,
      target: control,
      currentTarget: {},
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent;
    session.begin(event);
    session.move({
      pointerId: 2,
      clientX: 50,
      clientY: 50,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent);
    expect(preferences().groupMovePanelX).toBeUndefined();
    session.begin({ ...event, target: document.createElement('header') } as PointerEvent);
    session.move({
      pointerId: 9,
      clientX: 50,
      clientY: 50,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent);
    expect(preferences().groupMovePanelX).toBeUndefined();
  });
});
