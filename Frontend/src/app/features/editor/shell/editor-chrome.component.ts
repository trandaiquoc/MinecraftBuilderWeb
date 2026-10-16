import { Component, ElementRef, effect, inject, input, output, signal } from '@angular/core';
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
    '[class.menu-open]': '!!activeMenu()',
    '(document:click)': 'handleDocumentClick($event)',
    '(document:keydown)': 'handleDocumentKeydown($event)',
    '(document:focusin)': 'handleDocumentFocusin($event)',
    '(window:resize)': 'alignActiveMenu()',
  },
})
export class EditorChromeComponent {
  protected readonly i18n = inject(I18nService);
  private readonly keyboard = inject(KeyboardBindingService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly state = input.required<EditorChromeState>();
  readonly action = output<EditorChromeAction>();
  protected readonly activeMenu = signal<EditorMenu | undefined>(undefined);
  private readonly alignActiveMenuEffect = effect(() => {
    if (!this.activeMenu()) return;
    this.i18n.locale();
    this.alignActiveMenu();
  });
  private segmentDrag: SegmentControl | undefined;
  private nextMenuFocus: 'first' | 'last' = 'first';
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
    const next = this.activeMenu() === menu ? undefined : menu;
    this.activeMenu.set(next);
    const initialFocus = this.nextMenuFocus;
    this.nextMenuFocus = 'first';
    if (next && event.currentTarget instanceof HTMLElement)
      this.focusMenuItem(next, event.currentTarget, initialFocus);
  }

  protected alignActiveMenu(): void {
    if (!this.activeMenu()) return;
    const view = this.host.nativeElement.ownerDocument.defaultView;
    view?.requestAnimationFrame(() => {
      const popover = this.host.nativeElement.querySelector<HTMLElement>('.menu-popover');
      const entry = popover?.closest<HTMLElement>('.menu-entry');
      if (!popover || !entry || !view) return;

      popover.style.removeProperty('left');
      popover.style.removeProperty('right');
      const entryBounds = entry.getBoundingClientRect();
      const style = view.getComputedStyle(popover);
      const width = popover.offsetWidth;
      const leftOffset = Number.parseFloat(style.left);
      const rightOffset = Number.parseFloat(style.right);
      const currentLeft = Number.isFinite(leftOffset)
        ? entryBounds.left + leftOffset
        : entryBounds.right - (Number.isFinite(rightOffset) ? rightOffset : 0) - width;
      const viewportWidth = this.host.nativeElement.ownerDocument.documentElement.clientWidth;
      const gutter = 8;
      const maximumLeft = Math.max(gutter, viewportWidth - gutter - width);
      const targetLeft = Math.min(maximumLeft, Math.max(gutter, currentLeft));
      if (targetLeft === currentLeft) return;

      popover.style.left = `${targetLeft - entryBounds.left}px`;
      popover.style.right = 'auto';
    });
  }

  protected emit(action: EditorChromeAction): void {
    if (this.activeMenu())
      this.host.nativeElement.querySelector<HTMLElement>('.menu-trigger.active')?.focus();
    this.activeMenu.set(undefined);
    this.action.emit(action);
  }

  protected emitWhenEnabled(action: EditorChromeAction, enabled: boolean): void {
    if (enabled) this.emit(action);
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

  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.activeMenu()) return;
    const menu = this.host.nativeElement.querySelector<HTMLElement>('.menu-popover[role="menu"]');
    if (event.target instanceof Node && menu?.contains(event.target)) return;
    this.closeMenus();
  }

  protected handleMenuKeydown(event: KeyboardEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const trigger = target?.closest<HTMLElement>('.menu-trigger') ?? null;
    if (event.key === 'Escape' && (trigger || this.activeMenu())) {
      event.preventDefault();
      event.stopPropagation();
      const activeTrigger =
        this.host.nativeElement.querySelector<HTMLElement>('.menu-trigger.active');
      this.closeMenus();
      (trigger ?? activeTrigger)?.focus();
      return;
    }
    if (trigger && !this.activeMenu() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      event.stopPropagation();
      this.nextMenuFocus = event.key === 'ArrowUp' ? 'last' : 'first';
      trigger.click();
      return;
    }

    const menu = target?.closest<HTMLElement>('[role="menu"]');
    if (!menu || !this.activeMenu()) return;

    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]'));
    const currentItem = target?.closest<HTMLButtonElement>('button[role^="menuitem"]');
    const currentIndex = currentItem ? items.indexOf(currentItem) : -1;
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown' && currentIndex >= 0)
      nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp' && currentIndex >= 0)
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === undefined || !items.length) return;

    event.preventDefault();
    event.stopPropagation();
    items[nextIndex]?.focus();
  }

  protected handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.activeMenu()) return;
    const activeTrigger =
      this.host.nativeElement.querySelector<HTMLElement>('.menu-trigger.active');
    this.closeMenus();
    activeTrigger?.focus();
  }

  protected handleDocumentFocusin(event: FocusEvent): void {
    if (!this.activeMenu()) return;
    const menu = this.host.nativeElement.querySelector<HTMLElement>('.menu-popover[role="menu"]');
    if (event.target instanceof Node && menu?.contains(event.target)) return;
    this.closeMenus();
  }

  private focusMenuItem(
    menuName: EditorMenu,
    trigger: HTMLElement,
    position: 'first' | 'last',
  ): void {
    const entry = trigger.closest<HTMLElement>('.menu-entry');
    const view = this.host.nativeElement.ownerDocument.defaultView;
    view?.requestAnimationFrame(() => {
      if (this.activeMenu() !== menuName || !entry) return;
      const items = entry.querySelectorAll<HTMLButtonElement>(
        '.menu-popover button[role^="menuitem"]',
      );
      const item = position === 'last' ? items[items.length - 1] : items[0];
      item?.focus();
    });
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
