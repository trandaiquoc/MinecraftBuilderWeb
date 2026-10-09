import { Component, computed, inject, OnDestroy, output, signal } from '@angular/core';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import {
  UiPreferences,
  UiLocale,
  ThemePreset,
  UiFont,
  UiFontSize,
  BaseTheme,
} from '../../../../core/ui/preferences/ui-preferences.service';
import { LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../../shared/ui/tooltip/ui-tooltip.directive';
import {
  ThemedSelectComponent,
  ThemedSelectOption,
} from '../../../../shared/ui/themed-select/themed-select.component';
import { KEYBOARD_ACTIONS, KeyboardAction } from '../../../../core/editor/input/keyboard-bindings';
import { MOUSE_ACTIONS, MouseAction } from '../../../../core/editor/input/mouse-bindings';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { SettingsDialogSession } from './settings-dialog-session';

type SettingsSection = 'general' | 'appearance' | 'controls' | 'shortcuts' | 'accessibility';

@Component({
  selector: 'app-settings-dialog',
  imports: [LucideX, UiTooltipDirective, ThemedSelectComponent, CdkTrapFocus],
  providers: [SettingsDialogSession],
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.scss',
  host: {
    '(document:keydown.escape)': 'requestClose()',
    '(document:keydown)': 'handleShortcutKeydown($event)',
    '(document:pointerdown)': 'handleShortcutPointerdown($event)',
    '(document:wheel)': 'handleShortcutWheel($event)',
  },
})
export class SettingsDialogComponent implements OnDestroy {
  protected readonly i18n = inject(I18nService);
  protected readonly session = inject(SettingsDialogSession);
  readonly closed = output<void>();
  protected readonly section = signal<SettingsSection>('general');
  protected readonly shortcutSearch = signal('');
  protected readonly mouseSearch = signal('');
  protected readonly shortcutTab = signal<'keyboard' | 'mouse'>('keyboard');
  protected readonly draft = this.session.draft;
  protected readonly dirty = this.session.dirty;
  protected readonly capturingAction = this.session.capturingAction;
  protected readonly capturingMouseAction = this.session.capturingMouseAction;
  protected readonly shortcutConflicts = this.session.shortcutConflicts;
  protected readonly mouseBindingConflicts = this.session.mouseBindingConflicts;
  protected readonly sections: readonly SettingsSection[] = [
    'general',
    'appearance',
    'controls',
    'shortcuts',
    'accessibility',
  ];
  protected readonly languageOptions = computed<readonly ThemedSelectOption[]>(() => [
    { id: 'en', label: this.i18n.t('english') },
    { id: 'vi', label: this.i18n.t('vietnamese') },
  ]);
  protected readonly themeOptions = computed<readonly ThemedSelectOption[]>(() => [
    { id: 'dark', label: this.i18n.t('dark') },
    { id: 'light', label: this.i18n.t('light') },
    { id: 'craft', label: this.i18n.t('craft') },
  ]);
  protected readonly fontOptions = computed<readonly ThemedSelectOption[]>(() => [
    { id: 'geist', label: this.i18n.t('geist') },
    { id: 'minecraft-style', label: this.i18n.t('minecraftStyle') },
  ]);
  protected readonly editorBackgroundOptions = computed<readonly ThemedSelectOption[]>(() => [
    { id: 'dark', label: this.i18n.t('editorBackgroundDark') },
    { id: 'light', label: this.i18n.t('editorBackgroundLight') },
  ]);
  protected readonly controlFields = [
    { key: 'orbitSensitivity', min: 0.1, max: 3, step: 0.1, label: 'orbitSensitivity' },
    { key: 'panSensitivity', min: 0.1, max: 3, step: 0.1, label: 'panSensitivity' },
    { key: 'zoomSensitivity', min: 0.1, max: 3, step: 0.1, label: 'zoomSensitivity' },
    { key: 'cameraMoveSpeed', min: 1, max: 30, step: 1, label: 'cameraMoveSpeed' },
    { key: 'verticalMoveSpeed', min: 1, max: 30, step: 1, label: 'verticalMoveSpeed' },
    { key: 'clickDragThreshold', min: 1, max: 20, step: 1, label: 'clickDragThreshold' },
  ] as const;
  protected readonly shortcutGroups = computed(() => {
    const query = this.shortcutSearch().trim().toLocaleLowerCase();
    const groups = ['movement', 'tools-view', 'editing', 'quickBar'] as const;
    return groups
      .map((group) => ({
        group,
        entries: KEYBOARD_ACTIONS.filter(
          (entry) =>
            entry.group === group &&
            this.shortcutLabel(entry.action).toLocaleLowerCase().includes(query),
        ),
      }))
      .filter(({ entries }) => entries.length);
  });
  protected readonly mouseActions = computed(() =>
    MOUSE_ACTIONS.filter(({ action }) =>
      this.mouseActionLabel(action)
        .toLocaleLowerCase()
        .includes(this.mouseSearch().trim().toLocaleLowerCase()),
    ),
  );

  protected setSection(section: SettingsSection): void {
    this.section.set(section);
  }
  protected setLocale(locale: UiLocale): void {
    this.session.setLocale(locale);
  }
  protected setAutoUseHugeStructureBlocks(enabled: boolean): void {
    this.session.setAutoUseHugeStructureBlocks(enabled);
  }
  protected setShowStructureBlockGuide(enabled: boolean): void {
    this.session.setShowStructureBlockGuide(enabled);
  }
  protected setPreset(preset: ThemePreset): void {
    this.session.setPreset(preset);
  }
  protected setFont(font: UiFont): void {
    this.session.setFont(font);
  }
  protected setFontSize(fontSize: UiFontSize): void {
    this.session.setFontSize(fontSize);
  }
  protected fontSizeIndex(): number {
    return ({ small: 0, normal: 1, large: 2 } as const)[this.draft().appearance.fontSize];
  }
  protected setFontSizeIndex(event: Event): void {
    this.setFontSize(
      (['small', 'normal', 'large'] as const)[
        Math.min(2, Math.max(0, Math.round(Number((event.target as HTMLInputElement).value))))
      ],
    );
  }
  protected setEditorBackground(editorBackground: BaseTheme): void {
    this.session.setEditorBackground(editorBackground);
  }
  protected setBlockBrightness(value: string): void {
    this.session.setBlockBrightness(value);
  }
  protected brightnessDefaultStop(): string {
    return this.session.defaultBrightnessStop();
  }
  protected defaultBlockBrightness(): number {
    return this.session.defaultBlockBrightness();
  }
  protected setControl(key: keyof UiPreferences['controls'], value: string): void {
    this.session.setControl(key, value);
  }
  protected setShortcutSearch(value: string): void {
    this.shortcutSearch.set(value);
  }
  protected setMouseSearch(value: string): void {
    this.mouseSearch.set(value);
  }
  protected beginShortcutCapture(action: KeyboardAction): void {
    this.session.beginShortcutCapture(action);
  }
  protected beginMouseCapture(action: MouseAction): void {
    this.session.beginMouseCapture(action);
  }
  protected cancelShortcutCapture(): void {
    this.session.cancelCapture();
  }
  protected handleShortcutKeydown(event: KeyboardEvent): void {
    this.session.handleKeydown(event);
  }
  protected handleShortcutPointerdown(event: PointerEvent): void {
    this.session.handlePointerdown(event);
  }
  protected handleShortcutWheel(event: WheelEvent): void {
    this.session.handleWheel(event);
  }
  protected bindingLabel(action: KeyboardAction): string {
    return this.displayBinding(this.draft().shortcuts[action]);
  }
  protected mouseBindingLabel(action: MouseAction): string {
    return this.displayBinding(this.draft().mouseBindings[action]);
  }

  protected shortcutLabel(action: KeyboardAction): string {
    const key = (
      {
        'move-forward': 'shortcutMoveForward',
        'move-backward': 'shortcutMoveBackward',
        'move-left': 'shortcutMoveLeft',
        'move-right': 'shortcutMoveRight',
        'move-up': 'shortcutMoveUp',
        'move-down': 'shortcutMoveDown',
        'tool-place': 'toolPlace',
        'tool-select': 'toolSelect',
        'mode-3d': 'mode3d',
        'mode-y-layer': 'modeYLayer',
        'fit-structure': 'fitStructure',
        'focus-selection': 'focusSelection',
        'save-project': 'saveProjectMenu',
        undo: 'undo',
        redo: 'redo',
        'select-all': 'selectAll',
        'clear-selection': 'clearSelection',
        'delete-selection': 'deleteSelection',
        'quick-slot-1': 'quickSlot1',
        'quick-slot-2': 'quickSlot2',
        'quick-slot-3': 'quickSlot3',
        'quick-slot-4': 'quickSlot4',
        'quick-slot-5': 'quickSlot5',
        'quick-slot-6': 'quickSlot6',
        'quick-slot-7': 'quickSlot7',
        'quick-slot-8': 'quickSlot8',
        'quick-slot-9': 'quickSlot9',
        'quick-slot-10': 'quickSlot10',
      } as const
    )[action];
    return this.i18n.t(key);
  }

  protected shortcutGroupLabel(group: 'movement' | 'tools-view' | 'editing' | 'quickBar'): string {
    return (
      {
        movement: this.i18n.t('movementSettingsGroup'),
        'tools-view': this.i18n.t('toolsViewSettingsGroup'),
        editing: this.i18n.t('editingSettingsGroup'),
        quickBar: this.i18n.t('quickBarSettingsGroup'),
      } as const
    )[group];
  }
  protected mouseActionLabel(action: MouseAction): string {
    return (
      {
        'primary-action': this.i18n.t('mousePrimaryAction'),
        'delete-target': this.i18n.t('mouseDeleteTarget'),
        'pick-block': this.i18n.t('mousePickBlock'),
        'orbit-camera': this.i18n.t('mouseOrbit'),
        'pan-camera': this.i18n.t('mousePan'),
        'zoom-in': this.i18n.t('mouseZoomIn'),
        'zoom-out': this.i18n.t('mouseZoomOut'),
      } as const
    )[action];
  }
  protected restoreGeneralDefaults(): void {
    this.session.restoreGeneralDefaults();
  }
  protected restoreAppearanceDefaults(): void {
    this.session.restoreAppearanceDefaults();
  }
  protected restoreControlsDefaults(): void {
    this.session.restoreControlsDefaults();
  }
  protected restoreShortcutsDefaults(): void {
    this.session.restoreShortcutsDefaults();
  }
  protected restoreMouseDefaults(): void {
    this.session.restoreMouseDefaults();
  }
  protected restoreAccessibilityDefaults(): void {
    this.session.restoreAccessibilityDefaults();
  }
  protected clearShortcut(action: KeyboardAction): void {
    this.session.clearShortcut(action);
  }
  protected clearMouseBinding(action: MouseAction): void {
    this.session.clearMouseBinding(action);
  }
  protected clearAllShortcuts(): void {
    this.session.clearAllShortcuts();
  }
  protected clearAllMouseBindings(): void {
    this.session.clearAllMouseBindings();
  }
  protected apply(): void {
    this.session.apply();
  }
  protected saveAndClose(): void {
    if (this.session.apply()) this.closed.emit();
  }
  protected async requestClose(): Promise<void> {
    if (await this.session.requestClose()) this.closed.emit();
  }
  protected sectionLabel(section: SettingsSection): string {
    return (
      {
        general: this.i18n.t('generalSettings'),
        appearance: this.i18n.t('appearanceSettings'),
        controls: this.i18n.t('controlsSettings'),
        shortcuts: this.i18n.t('shortcutsSettings'),
        accessibility: this.i18n.t('accessibilitySettings'),
      } as const
    )[section];
  }

  ngOnDestroy(): void {
    this.session.clearAccessibilityPreview();
  }

  private displayBinding(binding: string): string {
    return binding
      ? binding
          .split('|')
          .map((alternative) =>
            alternative
              .split('+')
              .map((token) => this.displayBindingToken(token))
              .join(' + '),
          )
          .join(' / ')
      : this.i18n.t('unassigned');
  }
  private displayBindingToken(token: string): string {
    return (
      (
        {
          Ctrl: this.i18n.t('keyCtrl'),
          Shift: this.i18n.t('keyShift'),
          Alt: this.i18n.t('keyAlt'),
          Meta: this.i18n.t('keyMeta'),
          LeftClick: this.i18n.t('mouseLeftClick'),
          RightClick: this.i18n.t('mouseRightClick'),
          MiddleClick: this.i18n.t('mouseMiddleClick'),
          WheelUp: this.i18n.t('mouseWheelUp'),
          WheelDown: this.i18n.t('mouseWheelDown'),
        } as Record<string, string>
      )[token] ?? token
    );
  }
}
