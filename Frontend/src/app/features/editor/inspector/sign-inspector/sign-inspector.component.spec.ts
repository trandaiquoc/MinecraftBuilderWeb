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

describe('SignInspectorComponent tabs', () => {
  let injector: EnvironmentInjector;
  let component: SignInspectorComponent;
  let side: ReturnType<typeof signal<'front' | 'back'>>;
  let setSide: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    side = signal<'front' | 'back'>('front');
    setSide = vi.fn((next: 'front' | 'back') => side.set(next));
    injector = createEnvironmentInjector(
      [
        { provide: WorkspaceStateService, useValue: { project: () => undefined } },
        { provide: SelectionService, useValue: { single: () => undefined } },
        { provide: StructureEditorService, useValue: {} },
        { provide: BlockLibraryService, useValue: {} },
        { provide: ProjectBlockRuntimeIndex, useValue: {} },
        { provide: I18nService, useValue: {} },
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
});
