import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { KeyboardBindingService } from '../../../core/editor/input/keyboard-binding.service';
import type { EditorChromeAction, EditorChromeState } from './editor-chrome.contracts';
import {
  LucideCamera,
  LucideCheck,
  LucideChevronDown,
  LucideCuboid,
  LucideDownload,
  LucideFileInput,
  LucideFileOutput,
  LucideFocus,
  LucideFolderOpen,
  LucideFolderPlus,
  LucideLayers,
  LucideMaximize2,
  LucideMousePointer2,
  LucideMousePointerClick,
  LucideRedo2,
  LucideSave,
  LucideTrash,
  LucideUndo2,
} from '@lucide/angular';

type EditorMenu = 'file' | 'edit' | 'view' | 'tools' | 'settings' | 'help' | 'camera';

@Component({
  selector: 'app-editor-chrome',
  imports: [
    LucideCamera,
    LucideCheck,
    RouterLink,
    LucideChevronDown,
    LucideCuboid,
    LucideDownload,
    LucideFileInput,
    LucideFileOutput,
    LucideFocus,
    LucideFolderOpen,
    LucideFolderPlus,
    LucideLayers,
    LucideMaximize2,
    LucideMousePointer2,
    LucideMousePointerClick,
    LucideRedo2,
    LucideSave,
    LucideTrash,
    LucideUndo2,
  ],
  templateUrl: './editor-chrome.component.html',
  styleUrl: './editor-chrome.component.scss',
  host: {
    '(document:click)': 'closeMenus()',
    '(document:keydown)': 'handleDocumentKeydown($event)',
  },
})
export class EditorChromeComponent {
  protected readonly i18n = inject(I18nService);
  private readonly keyboard = inject(KeyboardBindingService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly state = input.required<EditorChromeState>();
  readonly action = output<EditorChromeAction>();
  protected readonly activeMenu = signal<EditorMenu | undefined>(undefined);
  protected readonly cameraPresets = [
    'perspective',
    'top',
    'front',
    'back',
    'left',
    'right',
  ] as const;

  protected toggleMenu(menu: EditorMenu, event: Event): void {
    event.stopPropagation();
    this.activeMenu.update((current) => (current === menu ? undefined : menu));
  }

  protected emit(action: EditorChromeAction): void {
    this.activeMenu.set(undefined);
    this.action.emit(action);
  }

  protected closeMenus(): void {
    this.activeMenu.set(undefined);
  }

  protected handleMenuKeydown(event: KeyboardEvent): void {
    const trigger =
      event.target instanceof HTMLElement ? event.target.closest('.menu-trigger') : null;
    if (event.key === 'Escape' && (trigger || this.activeMenu())) {
      event.preventDefault();
      const focusedTrigger = trigger as HTMLElement | null;
      const activeTrigger =
        this.host.nativeElement.querySelector<HTMLElement>('.menu-trigger.active');
      this.closeMenus();
      (focusedTrigger ?? activeTrigger)?.focus();
      return;
    }
    if (!this.activeMenu() || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;

    const entry =
      (trigger as HTMLElement | null)?.closest('.menu-entry') ??
      this.host.nativeElement.querySelector('.menu-popover')?.parentElement;
    const items = entry?.querySelectorAll<HTMLButtonElement>('.menu-popover button:not(:disabled)');
    if (!items?.length) return;
    event.preventDefault();
    (event.key === 'ArrowUp' ? items[items.length - 1] : items[0]).focus();
  }

  protected handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.activeMenu()) return;
    const activeTrigger =
      this.host.nativeElement.querySelector<HTMLElement>('.menu-trigger.active');
    this.closeMenus();
    activeTrigger?.focus();
  }

  protected shortcutTitle(action: 'undo' | 'redo'): string {
    return `${this.i18n.t(action)} (${this.keyboard.bindings()[action].replaceAll('|', ' / ')})`;
  }

  protected cameraPresetLabel(preset: (typeof this.cameraPresets)[number]): string {
    const keys = {
      perspective: 'cameraPerspective',
      top: 'cameraTop',
      front: 'cameraFront',
      back: 'cameraBack',
      left: 'cameraLeft',
      right: 'cameraRight',
    } as const;
    return this.i18n.t(keys[preset]);
  }
}
