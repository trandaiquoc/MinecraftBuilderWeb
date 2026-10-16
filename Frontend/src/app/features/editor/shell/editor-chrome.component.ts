import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../../core/ui/localization/i18n.service';
import { KeyboardBindingService } from '../../../core/editor/input/keyboard-binding.service';
import type { EditorChromeAction, EditorChromeState } from './editor-chrome.contracts';
import {
  LucideCamera,
  LucideActivity,
  LucideCheck,
  LucideChevronDown,
  LucideCuboid,
  LucideDownload,
  LucideFileInput,
  LucideFileOutput,
  LucideFocus,
  LucideInfo,
  LucideFolderOpen,
  LucideFolderPlus,
  LucideKeyboard,
  LucideLayers,
  LucideListChecks,
  LucideMaximize2,
  LucideMousePointer2,
  LucideMousePointerClick,
  LucidePackageOpen,
  LucidePanelsTopLeft,
  LucideRedo2,
  LucideRotateCcw,
  LucideSave,
  LucideTrash,
  LucideTrash2,
  LucideUndo2,
  LucideX,
} from '@lucide/angular';

type EditorMenu = 'file' | 'edit' | 'view' | 'tools' | 'settings' | 'help' | 'camera';
type SegmentControl = 'mode' | 'tool';

@Component({
  selector: 'app-editor-chrome',
  imports: [
    LucideActivity,
    LucideCamera,
    LucideCheck,
    RouterLink,
    LucideChevronDown,
    LucideCuboid,
    LucideDownload,
    LucideFileInput,
    LucideFileOutput,
    LucideFocus,
    LucideInfo,
    LucideFolderOpen,
    LucideFolderPlus,
    LucideKeyboard,
    LucideLayers,
    LucideListChecks,
    LucideMaximize2,
    LucideMousePointer2,
    LucideMousePointerClick,
    LucidePackageOpen,
    LucidePanelsTopLeft,
    LucideRedo2,
    LucideRotateCcw,
    LucideSave,
    LucideTrash,
    LucideTrash2,
    LucideUndo2,
    LucideX,
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
  private segmentDrag: SegmentControl | undefined;
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

  focusSettingsTrigger(): void {
    this.host.nativeElement
      .querySelector<HTMLButtonElement>('.settings-entry > .app-menu-trigger')
      ?.focus();
  }

  protected beginSegmentDrag(control: SegmentControl, event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary) return;
    const track = event.currentTarget;
    if (!(track instanceof HTMLElement)) return;

    this.segmentDrag = control;
    track.setPointerCapture?.(event.pointerId);
    this.selectSegmentAt(control, event.clientX, track);
  }

  protected moveSegmentDrag(control: SegmentControl, event: PointerEvent): void {
    if (this.segmentDrag !== control || !(event.currentTarget instanceof HTMLElement)) return;
    this.selectSegmentAt(control, event.clientX, event.currentTarget);
  }

  protected endSegmentDrag(control: SegmentControl): void {
    if (this.segmentDrag === control) this.segmentDrag = undefined;
  }

  protected isSegmentDragging(control: SegmentControl): boolean {
    return this.segmentDrag === control;
  }

  protected selectSegment(control: SegmentControl, index: 0 | 1): void {
    if (control === 'mode') {
      const mode = index === 0 ? '3d' : 'y-layer';
      if (this.state().mode !== mode) this.emit({ type: 'set-mode', mode });
      return;
    }

    const tool = index === 0 ? 'place' : 'select';
    if (this.state().tool !== tool) this.emit({ type: 'set-tool', tool });
  }

  protected handleSegmentKeydown(
    control: SegmentControl,
    selectedIndex: 0 | 1,
    event: KeyboardEvent,
  ): void {
    let nextIndex: 0 | 1 | undefined;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      nextIndex = selectedIndex === 0 ? 1 : 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      nextIndex = selectedIndex === 0 ? 1 : 0;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    event.stopPropagation();
    const track =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget.closest<HTMLElement>('[role="radiogroup"]')
        : null;
    const option = track?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex];
    option?.focus();
    this.selectSegment(control, nextIndex);
  }

  private selectSegmentAt(control: SegmentControl, clientX: number, track: HTMLElement): void {
    const bounds = track.getBoundingClientRect();
    const index: 0 | 1 = clientX < bounds.left + bounds.width / 2 ? 0 : 1;
    this.selectSegment(control, index);
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
