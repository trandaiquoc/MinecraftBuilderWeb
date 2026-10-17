import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockLibraryService } from '../../../../core/blocks/catalog/block-library.service';
import { ProjectBlockRuntimeIndex } from '../../../../core/editor/runtime/project-block-runtime-index';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { StructureEditorService } from '../../../../core/editor/structure/structure-editor.service';
import { SignTextSideService } from '../../../../core/block-entities/sign/sign-text-side.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { SignInspectorComponent } from './sign-inspector.component';

describe('SignInspectorComponent', () => {
  let injector: EnvironmentInjector;
  let component: SignInspectorComponent;
  let side: ReturnType<typeof signal<'front' | 'back'>>;
  let setSide: ReturnType<typeof vi.fn>;
  let selectedPosition: { x: number; y: number; z: number } | undefined;

  beforeEach(() => {
    side = signal<'front' | 'back'>('front');
    setSide = vi.fn((next: 'front' | 'back') => side.set(next));
    selectedPosition = undefined;
    const position = { x: 0, y: 0, z: 0 };
    injector = createEnvironmentInjector(
      [
        { provide: WorkspaceStateService, useValue: { project: () => ({ id: 'project' }) } },
        { provide: SelectionService, useValue: { single: () => selectedPosition } },
        { provide: StructureEditorService, useValue: {} },
        { provide: BlockLibraryService, useValue: { get: vi.fn(() => undefined) } },
        {
          provide: ProjectBlockRuntimeIndex,
          useValue: {
            ensure: vi.fn(),
            get: vi.fn(() => ({ id: 'minecraft:oak_sign', position })),
          },
        },
        {
          provide: I18nService,
          useValue: {
            t: (key: string) => (key === 'signLineTooWide' ? 'Line {line} may be too wide' : key),
          },
        },
        {
          provide: SignTextSideService,
          useValue: { side: side.asReadonly(), set: setSide },
        },
      ],
      TestBed.inject(EnvironmentInjector),
    );
    component = runInInjectionContext(injector, () => new SignInspectorComponent());
  });

  afterEach(() => {
    if (!injector.destroyed) injector.destroy();
  });

  it('moves focus and selection with arrows, Home, and End', () => {
    const state = component as unknown as {
      onTabKeydown: (event: KeyboardEvent, current: 'front' | 'back') => void;
    };
    const tablist = document.createElement('div');
    const frontTab = document.createElement('button');
    frontTab.id = 'sign-front-tab';
    const backTab = document.createElement('button');
    backTab.id = 'sign-back-tab';
    tablist.append(frontTab, backTab);
    document.body.append(tablist);
    frontTab.addEventListener('keydown', (event) => state.onTabKeydown(event, 'front'));
    backTab.addEventListener('keydown', (event) => state.onTabKeydown(event, 'back'));

    frontTab.focus();
    const arrowRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    frontTab.dispatchEvent(arrowRight);
    expect(arrowRight.defaultPrevented).toBe(true);
    expect(side()).toBe('back');
    expect(setSide).toHaveBeenLastCalledWith('back');
    expect(document.activeElement).toBe(backTab);

    const home = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
    backTab.dispatchEvent(home);
    expect(side()).toBe('front');
    expect(document.activeElement).toBe(frontTab);

    const end = new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
    frontTab.dispatchEvent(end);
    expect(side()).toBe('back');
    expect(document.activeElement).toBe(backTab);

    const arrowLeft = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });
    backTab.dispatchEvent(arrowLeft);
    expect(side()).toBe('front');
    expect(document.activeElement).toBe(frontTab);
    tablist.remove();
  });

  it('updates width feedback from the current sign draft while typing', () => {
    selectedPosition = { x: 0, y: 0, z: 0 };
    const state = component as unknown as {
      beginEdit: () => void;
      updateLine: (index: number, event: Event) => void;
      lineWarning: (index: number) => string | undefined;
    };

    state.beginEdit();
    state.updateLine(1, { target: { value: 'W'.repeat(20) } } as unknown as Event);
    expect(state.lineWarning(1)).toBe('Line 2 may be too wide');
    expect(state.lineWarning(0)).toBeUndefined();

    state.updateLine(1, { target: { value: 'Fixed' } } as unknown as Event);
    expect(state.lineWarning(1)).toBeUndefined();
  });
});
