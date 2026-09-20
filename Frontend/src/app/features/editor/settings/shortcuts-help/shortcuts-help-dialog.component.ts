import { Component, computed, inject, output } from '@angular/core';
import { KEYBOARD_ACTIONS, KeyboardAction } from '../../../../core/editor/input/keyboard-bindings';
import { MOUSE_ACTIONS, MouseAction, mouseBindingTokens } from '../../../../core/editor/input/mouse-bindings';
import { KeyboardBindingService } from '../../../../core/editor/input/keyboard-binding.service';
import { I18nService } from '../../../../core/ui/i18n.service';
import { LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../../shared/ui/tooltip/ui-tooltip.directive';
import { trapDialogFocus } from '../../../../shared/ui/dialog/dialog-focus';

@Component({
  selector: 'app-shortcuts-help-dialog',
  imports: [LucideX, UiTooltipDirective],
  templateUrl: './shortcuts-help-dialog.component.html',
  styleUrl: './shortcuts-help-dialog.component.scss',
  host: { '(document:keydown.escape)': 'close()' },
})
export class ShortcutsHelpDialogComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly bindings = inject(KeyboardBindingService);
  readonly closed = output<void>();
  protected trapFocus(event: KeyboardEvent): void { trapDialogFocus(event, event.currentTarget as HTMLElement); }
  protected readonly keyboardGroups = computed(() => {
    const groups = ['movement', 'tools-view', 'editing', 'quickBar'] as const;
    return groups.map((group) => ({ group, entries: KEYBOARD_ACTIONS.filter((entry) => entry.group === group) }));
  });

  protected close(): void { this.closed.emit(); }
  protected onBackdropClick(event: MouseEvent): void { if (event.target === event.currentTarget) this.close(); }
  protected keyboardLabel(action: KeyboardAction): string {
    const key = ({
      'move-forward': 'shortcutMoveForward', 'move-backward': 'shortcutMoveBackward', 'move-left': 'shortcutMoveLeft', 'move-right': 'shortcutMoveRight', 'move-up': 'shortcutMoveUp', 'move-down': 'shortcutMoveDown',
      'tool-place': 'toolPlace', 'tool-select': 'toolSelect', 'mode-3d': 'mode3d', 'mode-y-layer': 'modeYLayer', 'fit-structure': 'fitStructure', 'focus-selection': 'focusSelection', 'save-project': 'saveProjectMenu',
      undo: 'undo', redo: 'redo', 'select-all': 'selectAll', 'clear-selection': 'clearSelection', 'delete-selection': 'deleteSelection',
      'quick-slot-1': 'quickSlot1', 'quick-slot-2': 'quickSlot2', 'quick-slot-3': 'quickSlot3', 'quick-slot-4': 'quickSlot4', 'quick-slot-5': 'quickSlot5', 'quick-slot-6': 'quickSlot6', 'quick-slot-7': 'quickSlot7', 'quick-slot-8': 'quickSlot8', 'quick-slot-9': 'quickSlot9', 'quick-slot-10': 'quickSlot10',
    } as const)[action];
    return this.i18n.t(key);
  }
  protected keyboardGroupLabel(group: 'movement' | 'tools-view' | 'editing' | 'quickBar'): string { return ({ movement: this.i18n.t('movementSettingsGroup'), 'tools-view': this.i18n.t('toolsViewSettingsGroup'), editing: this.i18n.t('editingSettingsGroup'), quickBar: this.i18n.t('quickBarSettingsGroup') } as const)[group]; }
  protected mouseLabel(action: MouseAction): string { return ({ 'primary-action': this.i18n.t('mousePrimaryAction'), 'delete-target': this.i18n.t('mouseDeleteTarget'), 'pick-block': this.i18n.t('mousePickBlock'), 'orbit-camera': this.i18n.t('mouseOrbit'), 'pan-camera': this.i18n.t('mousePan'), 'zoom-in': this.i18n.t('mouseZoomIn'), 'zoom-out': this.i18n.t('mouseZoomOut') } as const)[action]; }
  protected mouseEntries(): readonly { readonly action: MouseAction }[] { return MOUSE_ACTIONS; }
  protected displayTokens(binding: string): readonly string[] { return binding ? binding.split('|').flatMap((alternative, index) => [...(index ? ['/'] : []), ...mouseBindingTokens(alternative).map((token) => this.displayToken(token))]) : [this.i18n.t('unassigned')]; }
  protected displayMouseBinding(action: MouseAction): string { return this.displayBinding(this.bindings.mouseBindings()[action]); }
  protected displayKeyboardBinding(action: KeyboardAction): string { return this.displayBinding(this.bindings.bindings()[action]); }
  private displayBinding(binding: string): string { return binding ? binding.replaceAll('|', ' / ').replaceAll('LeftClick', this.i18n.t('mouseLeftClick')).replaceAll('RightClick', this.i18n.t('mouseRightClick')).replaceAll('MiddleClick', this.i18n.t('mouseMiddleClick')).replaceAll('WheelUp', this.i18n.t('mouseWheelUp')).replaceAll('WheelDown', this.i18n.t('mouseWheelDown')) : this.i18n.t('unassigned'); }
  private displayToken(token: string): string { return ({ Ctrl: this.i18n.t('keyCtrl'), Shift: this.i18n.t('keyShift'), Alt: this.i18n.t('keyAlt'), Meta: this.i18n.t('keyMeta'), LeftClick: this.i18n.t('mouseLeftClick'), RightClick: this.i18n.t('mouseRightClick'), MiddleClick: this.i18n.t('mouseMiddleClick'), WheelUp: this.i18n.t('mouseWheelUp'), WheelDown: this.i18n.t('mouseWheelDown') } as Record<string, string>)[token] ?? token; }
}
