import { signal, type WritableSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { AssetManagerDialogComponent } from './asset-manager-dialog.component';

type AssetManagerTab = 'vanilla' | 'mods';

interface AssetManagerTabState {
  readonly tab: WritableSignal<AssetManagerTab>;
  readonly tabIndex: (tab: AssetManagerTab) => 0 | -1;
  readonly onTabKeydown: (event: KeyboardEvent, currentTab: AssetManagerTab) => void;
}

interface AssetManagerHelpState {
  readonly helpOpen: WritableSignal<boolean>;
  readonly openHelp: () => void;
  readonly closeHelp: () => void;
  readonly closeHelpFromEscape: (event: Event) => void;
}

describe('AssetManagerDialogComponent tabs', () => {
  it('keeps one tab stop and moves focus with arrow, Home, and End keys', () => {
    const state = Object.create(AssetManagerDialogComponent.prototype) as AssetManagerTabState;
    Object.defineProperty(state, 'tab', { value: signal<AssetManagerTab>('vanilla') });
    const tablist = document.createElement('div');
    tablist.setAttribute('role', 'tablist');
    const tabs = (['vanilla', 'mods'] as const).map((tab) => {
      const button = document.createElement('button');
      button.setAttribute('role', 'tab');
      button.addEventListener('keydown', (event) => state.onTabKeydown(event, tab));
      tablist.append(button);
      return button;
    });
    document.body.append(tablist);

    tabs[0].focus();
    const arrowRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    tabs[0].dispatchEvent(arrowRight);

    expect(arrowRight.defaultPrevented).toBe(true);
    expect(state.tab()).toBe('mods');
    expect(document.activeElement).toBe(tabs[1]);
    expect(state.tabIndex('vanilla')).toBe(-1);
    expect(state.tabIndex('mods')).toBe(0);

    const wrapRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    tabs[1].dispatchEvent(wrapRight);
    expect(state.tab()).toBe('vanilla');
    expect(document.activeElement).toBe(tabs[0]);

    const end = new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
    tabs[0].dispatchEvent(end);
    expect(state.tab()).toBe('mods');
    expect(document.activeElement).toBe(tabs[1]);

    const home = new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true });
    tabs[1].dispatchEvent(home);
    expect(state.tab()).toBe('vanilla');
    expect(document.activeElement).toBe(tabs[0]);

    const wrapLeft = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });
    tabs[0].dispatchEvent(wrapLeft);
    expect(state.tab()).toBe('mods');
    expect(document.activeElement).toBe(tabs[1]);
    tablist.remove();
  });
});

describe('AssetManagerDialogComponent help', () => {
  it('keeps help open when both focus and click request it', () => {
    const state = Object.create(AssetManagerDialogComponent.prototype) as AssetManagerHelpState;
    Object.defineProperty(state, 'helpOpen', { value: signal(false) });

    state.openHelp();
    state.openHelp();

    expect(state.helpOpen()).toBe(true);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    state.closeHelpFromEscape(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(escape.cancelBubble).toBe(true);
    expect(state.helpOpen()).toBe(false);
  });
});
