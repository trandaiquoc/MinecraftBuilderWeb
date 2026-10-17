import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { KeyboardBindingService } from '../../../core/editor/input/keyboard-binding.service';
import type { EditorChromeState } from './editor-chrome.contracts';
import { EditorChromeComponent } from './editor-chrome.component';

const state: EditorChromeState = {
  theme: 'dark',
  locale: 'en',
  background: 'dark',
  layout: {
    editorToolbarVisible: true,
    leftSidebarVisible: true,
    rightSidebarVisible: true,
    quickBarVisible: true,
    statusBarVisible: true,
    leftSidebarWidth: 360,
    rightSidebarWidth: 400,
  },
  mode: '3d',
  tool: 'place',
  canUndo: true,
  canRedo: true,
  hasSelection: true,
  canFocusSelection: true,
  deletingProject: false,
  projectName: 'Workspace UI audit',
  saveStatusLabel: 'Saved',
};

describe('EditorChromeComponent menu keyboard navigation', () => {
  let frameCallbacks: FrameRequestCallback[];

  beforeEach(async () => {
    frameCallbacks = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    await TestBed.configureTestingModule({
      imports: [EditorChromeComponent],
      providers: [
        {
          provide: I18nService,
          useValue: { locale: signal('en'), t: (key: string) => key },
        },
        {
          provide: KeyboardBindingService,
          useValue: { bindings: signal({ undo: 'Ctrl+Z', redo: 'Ctrl+Y' }) },
        },
        provideRouter([]),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the active project name visible when the save status is in the footer', () => {
    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.chrome-project-name')?.textContent?.trim()).toBe(
      'Workspace UI audit',
    );
    expect(
      root.querySelector('.chrome-project-context .chrome-project-status')?.textContent?.trim(),
    ).toBe('Saved');
    expect(
      root
        .querySelector('.chrome-project-context .chrome-project-status')
        ?.classList.contains('chrome-project-status--redundant'),
    ).toBe(true);
    fixture.destroy();
  });

  it('moves an open menu below the project chip when their narrow header bounds overlap', () => {
    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const toolsTrigger = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.app-menu-trigger'),
    ).find((button) => button.textContent?.trim() === 'toolsMenu')!;
    toolsTrigger.click();
    fixture.detectChanges();

    const entry = toolsTrigger.closest<HTMLElement>('.menu-entry')!;
    const popover = entry.querySelector<HTMLElement>('.menu-popover')!;
    const projectContext = root.querySelector<HTMLElement>('.chrome-project-context')!;
    vi.spyOn(entry, 'getBoundingClientRect').mockReturnValue(rect(169, 5, 31, 29));
    vi.spyOn(popover, 'getBoundingClientRect').mockReturnValue(rect(169, 42, 213, 122));
    vi.spyOn(projectContext, 'getBoundingClientRect').mockReturnValue(rect(267, 43, 115, 25));
    Object.defineProperty(popover, 'offsetWidth', { configurable: true, value: 213 });

    flushAnimationFrames(fixture, frameCallbacks);

    expect(popover.style.top).toBe('71px');
    fixture.destroy();
  });

  it('keeps narrow toolbar actions named when their visible labels are compacted', () => {
    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const controls = [...root.querySelectorAll<HTMLButtonElement>('.ui-button--toolbar')];
    expect(controls.map((button) => button.getAttribute('aria-label'))).toEqual([
      'undo',
      'redo',
      'fitStructure',
      'focusSelection',
      'camera',
    ]);
    expect(controls[0].title).toBe('undo (Ctrl+Z)');
    expect(controls[2].title).toBe('fitStructure');
    expect(controls[4].title).toBe('camera');
    expect(controls[2].querySelector('.toolbar-button-label')?.textContent?.trim()).toBe(
      'fitStructure',
    );

    fixture.destroy();
  });

  it('opens a menu from its trigger and moves focus through menu items', () => {
    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const helpTrigger = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.menu-trigger'),
    ).find((button) => button.textContent?.trim() === 'helpMenu');
    expect(helpTrigger).toBeDefined();
    helpTrigger?.focus();

    press(helpTrigger!, 'ArrowDown');
    fixture.detectChanges();
    flushAnimationFrames(fixture, frameCallbacks);

    const root = fixture.nativeElement as HTMLElement;
    const menu = root.querySelector<HTMLElement>('[role="menu"]');
    let items = menu?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]');
    expect(items?.length).toBe(2);
    expect([...items!].every((item) => item.tabIndex === -1)).toBe(true);
    expect(document.activeElement).toBe(items?.[0]);

    press(items![0], 'ArrowDown');
    expect(document.activeElement).toBe(items?.[1]);
    press(items![1], 'ArrowDown');
    expect(document.activeElement).toBe(items?.[0]);
    press(items![0], 'ArrowUp');
    expect(document.activeElement).toBe(items?.[1]);
    press(items![1], 'Home');
    expect(document.activeElement).toBe(items?.[0]);
    press(items![0], 'End');
    expect(document.activeElement).toBe(items?.[1]);

    press(items![1], 'Escape');
    fixture.detectChanges();
    expect(root.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(helpTrigger);

    fixture.destroy();
  });

  it('keeps a newly opened menu active while the previous menu exits', () => {
    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const trigger = (name: string) =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('.app-menu-trigger')).find(
        (button) => button.textContent?.trim() === `${name}Menu`,
      )!;
    const fileTrigger = trigger('file');
    const viewTrigger = trigger('view');

    fileTrigger.click();
    fixture.detectChanges();
    flushAnimationFrames(fixture, frameCallbacks);

    const filePopover = fileTrigger
      .closest('.menu-entry')!
      .querySelector<HTMLElement>('.menu-popover');
    expect(filePopover).not.toBeNull();
    const leavingPopover = document.createElement('div');
    leavingPopover.className = 'menu-popover workspace-popover-exit';
    leavingPopover.setAttribute('role', 'menu');
    leavingPopover.innerHTML = filePopover!.innerHTML;
    fileTrigger.closest('.menu-entry')!.append(leavingPopover);

    viewTrigger.focus();
    fixture.detectChanges();
    viewTrigger.click();
    fixture.detectChanges();
    flushAnimationFrames(fixture, frameCallbacks);

    const viewPopover = viewTrigger
      .closest('.menu-entry')!
      .querySelector<HTMLElement>('.menu-popover');
    expect(leavingPopover.isConnected).toBe(true);
    expect(viewTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(viewPopover).not.toBeNull();
    expect(document.activeElement).toBe(
      viewPopover?.querySelector<HTMLButtonElement>('button[role^="menuitem"]'),
    );

    fileTrigger.focus();
    fixture.detectChanges();
    fileTrigger.click();
    fixture.detectChanges();
    flushAnimationFrames(fixture, frameCallbacks);

    const reopenedFilePopover = fileTrigger
      .closest('.menu-entry')!
      .querySelector<HTMLElement>('.menu-popover:not(.workspace-popover-exit)');
    expect(fileTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(
      reopenedFilePopover?.querySelector<HTMLButtonElement>('button[role^="menuitem"]'),
    );

    fixture.destroy();
  });

  it('routes the Mod JAR Import menu item to its dedicated action', () => {
    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const actions: unknown[] = [];
    fixture.componentInstance.action.subscribe((action) => actions.push(action));
    const root = fixture.nativeElement as HTMLElement;
    const toolsTrigger = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.app-menu-trigger'),
    ).find((button) => button.textContent?.trim() === 'toolsMenu')!;
    toolsTrigger.click();
    fixture.detectChanges();
    const importButton = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.menu-popover [role="menuitem"]'),
    ).find((button) => button.textContent?.includes('modJarImport'))!;
    importButton.click();

    expect(actions).toEqual([{ type: 'open-mod-jar-import' }]);
    fixture.destroy();
  });

  it('opens at the last item with ArrowUp and closes when focus leaves the menu', () => {
    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const helpTrigger = Array.from(root.querySelectorAll<HTMLButtonElement>('.menu-trigger')).find(
      (button) => button.textContent?.trim() === 'helpMenu',
    )!;
    helpTrigger.focus();
    press(helpTrigger, 'ArrowUp');
    fixture.detectChanges();
    flushAnimationFrames(fixture, frameCallbacks);

    const items = root.querySelectorAll<HTMLButtonElement>(
      '[role="menu"] button[role^="menuitem"]',
    );
    expect(document.activeElement).toBe(items[items.length - 1]);

    root.querySelector<HTMLButtonElement>('.app-menu-trigger')?.focus();
    fixture.detectChanges();
    expect(root.querySelector('[role="menu"]')).toBeNull();
    fixture.destroy();
  });

  it('returns focus to the Camera trigger after Escape', () => {
    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const cameraTrigger = root.querySelector<HTMLButtonElement>(
      '.camera-actions-menu .menu-trigger',
    )!;
    cameraTrigger.focus();
    press(cameraTrigger, 'ArrowDown');
    fixture.detectChanges();
    flushAnimationFrames(fixture, frameCallbacks);

    const items = root.querySelectorAll<HTMLButtonElement>(
      '.camera-popover button[role^="menuitem"]',
    );
    expect(document.activeElement).toBe(items[0]);
    press(items[0], 'Escape');
    fixture.detectChanges();

    expect(root.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(cameraTrigger);
    fixture.destroy();
  });

  it('keeps disabled menu actions focusable without activating them', () => {
    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', {
      ...state,
      canUndo: false,
      canRedo: false,
      hasSelection: false,
    });
    fixture.detectChanges();

    const actions: string[] = [];
    fixture.componentInstance.action.subscribe((action) => actions.push(action.type));
    const root = fixture.nativeElement as HTMLElement;
    const editTrigger = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.app-menu-trigger'),
    ).find((button) => button.textContent?.trim() === 'editMenu')!;
    editTrigger.focus();
    press(editTrigger, 'ArrowDown');
    fixture.detectChanges();
    flushAnimationFrames(fixture, frameCallbacks);

    const items = root.querySelectorAll<HTMLButtonElement>(
      '[role="menu"] button[role^="menuitem"]',
    );
    expect(items[0].getAttribute('aria-disabled')).toBe('true');
    expect(items[1].getAttribute('aria-disabled')).toBe('true');
    expect(items[0].tabIndex).toBe(-1);
    expect(document.activeElement).toBe(items[0]);

    press(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    items[1].click();
    fixture.detectChanges();
    expect(actions).toEqual([]);
    expect(root.querySelector('[role="menu"]')).not.toBeNull();

    fixture.destroy();
  });
});

describe('EditorChromeComponent save status announcements', () => {
  it('uses the header as the live source only when the status bar is hidden', async () => {
    await TestBed.configureTestingModule({
      imports: [EditorChromeComponent],
      providers: [
        {
          provide: I18nService,
          useValue: { locale: signal('en'), t: (key: string) => key },
        },
        {
          provide: KeyboardBindingService,
          useValue: { bindings: signal({ undo: 'Ctrl+Z', redo: 'Ctrl+Y' }) },
        },
        provideRouter([]),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(EditorChromeComponent);
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();

    let status = (fixture.nativeElement as HTMLElement).querySelector(
      '.chrome-project-status',
    ) as HTMLElement;
    expect(status.getAttribute('role')).toBeNull();
    expect(status.getAttribute('aria-live')).toBeNull();
    expect(status.classList.contains('chrome-project-status--redundant')).toBe(true);

    fixture.componentRef.setInput('state', {
      ...state,
      layout: { ...state.layout, statusBarVisible: false },
    });
    fixture.detectChanges();

    status = (fixture.nativeElement as HTMLElement).querySelector(
      '.chrome-project-status',
    ) as HTMLElement;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.classList.contains('chrome-project-status--redundant')).toBe(false);
    expect(status.classList.contains('chrome-project-status--standalone')).toBe(true);
    fixture.destroy();
  });
});

function press(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function flushAnimationFrames(
  fixture: ComponentFixture<EditorChromeComponent>,
  callbacks: FrameRequestCallback[],
): void {
  const pending = callbacks.splice(0);
  pending.forEach((callback) => callback(0));
  fixture.detectChanges();
}
