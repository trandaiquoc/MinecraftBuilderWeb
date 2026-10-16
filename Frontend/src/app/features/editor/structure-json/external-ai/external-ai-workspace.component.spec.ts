import {
  createEnvironmentInjector,
  ElementRef,
  EnvironmentInjector,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalAiPromptContextService } from '../../../../core/persistence/structure-json/external-ai/external-ai-prompt-context.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { UiPreferencesService } from '../../../../core/ui/preferences/ui-preferences.service';
import { ItemCatalogService } from '../../../../core/items/catalog/item-catalog.service';
import { PaintingVariantCatalogService } from '../../../../core/decorations/catalog/painting-variant-catalog.service';
import { ExternalAiWorkspaceComponent } from './external-ai-workspace.component';

describe('ExternalAiWorkspaceComponent copy feedback', () => {
  let injector: EnvironmentInjector;
  let component: ExternalAiWorkspaceComponent;

  beforeEach(() => {
    vi.useFakeTimers();
    injector = createEnvironmentInjector(
      [
        { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
        { provide: ExternalAiPromptContextService, useValue: {} },
        { provide: I18nService, useValue: {} },
        { provide: ItemCatalogService, useValue: {} },
        { provide: PaintingVariantCatalogService, useValue: {} },
        { provide: UiPreferencesService, useValue: {} },
      ],
      TestBed.inject(EnvironmentInjector),
    );
    component = runInInjectionContext(injector, () => new ExternalAiWorkspaceComponent());
  });

  afterEach(() => {
    if (!injector.destroyed) injector.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears copy feedback after a short confirmation period', async () => {
    const state = component as unknown as {
      showCopyFeedback: (status: 'copied' | 'failed', target: 'prompt' | 'example') => void;
      aiCopyStatus: () => string;
      aiCopyTarget: () => string | undefined;
    };

    state.showCopyFeedback('copied', 'prompt');
    expect(state.aiCopyStatus()).toBe('copied');
    expect(state.aiCopyTarget()).toBe('prompt');

    await vi.advanceTimersByTimeAsync(1400);

    expect(state.aiCopyStatus()).toBe('idle');
    expect(state.aiCopyTarget()).toBeUndefined();
  });

  it('clears pending feedback on destroy and ignores late clipboard results', () => {
    const state = component as unknown as {
      showCopyFeedback: (status: 'copied' | 'failed', target: 'prompt' | 'example') => void;
      aiCopyStatus: () => string;
      copyFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
    };
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    state.showCopyFeedback('copied', 'example');
    const timer = state.copyFeedbackTimer;
    injector.destroy();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    expect(vi.getTimerCount()).toBe(0);
    state.showCopyFeedback('failed', 'prompt');
    expect(state.aiCopyStatus()).toBe('copied');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps one tab stop and moves selection and focus with tab navigation keys', () => {
    const state = component as unknown as {
      aiTabs: readonly string[];
      activeAiTab: () => string;
      aiTabIndex: (tab: string) => 0 | -1;
      onAiTabKeydown: (event: KeyboardEvent) => void;
    };
    const tablist = document.createElement('div');
    const tabs = state.aiTabs.map((tab) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.textContent = tab;
      button.tabIndex = state.aiTabIndex(tab);
      tablist.append(button);
      return button;
    });
    document.body.append(tablist);
    tablist.addEventListener('keydown', (event) => state.onAiTabKeydown(event as KeyboardEvent));

    tabs[0].focus();
    const arrowRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    tabs[0].dispatchEvent(arrowRight);

    expect(state.activeAiTab()).toBe('content');
    expect(document.activeElement).toBe(tabs[1]);
    expect(state.aiTabs.map((tab) => state.aiTabIndex(tab))).toEqual([-1, 0, -1, -1, -1]);

    const end = new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
    tabs[1].dispatchEvent(end);
    expect(state.activeAiTab()).toBe('example');
    expect(document.activeElement).toBe(tabs[4]);

    const home = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
    tabs[4].dispatchEvent(home);
    expect(state.activeAiTab()).toBe('description');
    expect(document.activeElement).toBe(tabs[0]);
    tablist.remove();
  });
});
