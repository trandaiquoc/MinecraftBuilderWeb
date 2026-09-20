import { Component, computed, inject, output, signal } from '@angular/core';
import { DialogService } from '../../../core/ui/dialog.service';
import { I18nService } from '../../../core/ui/i18n.service';
import { UiPreferences, UiPreferencesService, UiLocale, ThemePreset, UiFont, UiFontSize, BaseTheme } from '../../../core/ui/ui-preferences.service';
import { LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../../shared/ui/tooltip/ui-tooltip.directive';
import { ThemedSelectComponent, ThemedSelectOption } from '../../../shared/ui/themed-select/themed-select.component';
import { KEYBOARD_ACTIONS, KeyboardAction, bindingFromKeyboardEvent, findBindingConflicts, isModifierOnlyBinding } from '../../../core/editor/input/keyboard-bindings';
import { MOUSE_ACTIONS, MouseAction, findMouseBindingConflicts, mouseBindingFromEvent } from '../../../core/editor/input/mouse-bindings';
import { trapDialogFocus } from '../../../shared/ui/dialog/dialog-focus';

type SettingsSection = 'general' | 'appearance' | 'controls' | 'shortcuts' | 'accessibility';
type SettingsDraft = Pick<UiPreferences, 'locale'> & { readonly appearance: UiPreferences['appearance']; readonly controls: UiPreferences['controls']; readonly shortcuts: UiPreferences['shortcuts']; readonly mouseBindings: UiPreferences['mouseBindings'] };

@Component({
  selector: 'app-settings-dialog',
  imports: [LucideX, UiTooltipDirective, ThemedSelectComponent],
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.scss',
  host: { '(document:keydown.escape)': 'requestClose()', '(document:keydown)': 'handleShortcutKeydown($event)', '(document:pointerdown)': 'handleShortcutPointerdown($event)', '(document:wheel)': 'handleShortcutWheel($event)' },
})
export class SettingsDialogComponent {
  protected readonly i18n = inject(I18nService);
  private readonly preferences = inject(UiPreferencesService);
  private readonly dialogs = inject(DialogService);
  readonly closed = output<void>();
  protected readonly section = signal<SettingsSection>('general');
  protected readonly shortcutSearch = signal('');
  protected readonly mouseSearch = signal('');
  protected readonly shortcutTab = signal<'keyboard' | 'mouse'>('keyboard');
  protected readonly capturingAction = signal<KeyboardAction | undefined>(undefined);
  protected readonly capturingMouseAction = signal<MouseAction | undefined>(undefined);
  private readonly baseline = signal<SettingsDraft>(this.readDraft());
  protected readonly draft = signal<SettingsDraft>(this.readDraft());
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.baseline()));
  protected readonly sections: readonly SettingsSection[] = ['general', 'appearance', 'controls', 'shortcuts', 'accessibility'];
  protected readonly languageOptions = computed<readonly ThemedSelectOption[]>(() => [{ id: 'en', label: this.i18n.t('english') }, { id: 'vi', label: this.i18n.t('vietnamese') }]);
  protected readonly themeOptions = computed<readonly ThemedSelectOption[]>(() => [{ id: 'dark', label: this.i18n.t('dark') }, { id: 'light', label: this.i18n.t('light') }, { id: 'craft', label: this.i18n.t('craft') }]);
  protected readonly fontOptions = computed<readonly ThemedSelectOption[]>(() => [{ id: 'geist', label: this.i18n.t('geist') }, { id: 'minecraft-style', label: this.i18n.t('minecraftStyle') }]);
  protected readonly editorBackgroundOptions = computed<readonly ThemedSelectOption[]>(() => [{ id: 'dark', label: this.i18n.t('editorBackgroundDark') }, { id: 'light', label: this.i18n.t('editorBackgroundLight') }]);
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
    return groups.map((group) => ({ group, entries: KEYBOARD_ACTIONS.filter((entry) => entry.group === group && this.shortcutLabel(entry.action).toLocaleLowerCase().includes(query)) })).filter(({ entries }) => entries.length);
  });
  protected readonly mouseActions = computed(() => MOUSE_ACTIONS.filter(({ action }) => this.mouseActionLabel(action).toLocaleLowerCase().includes(this.mouseSearch().trim().toLocaleLowerCase())));
  protected readonly shortcutConflicts = computed(() => findBindingConflicts(this.draft().shortcuts));
  protected readonly mouseBindingConflicts = computed(() => findMouseBindingConflicts(this.draft().mouseBindings));

  protected setSection(section: SettingsSection): void { this.section.set(section); }
  protected trapFocus(event: KeyboardEvent): void { trapDialogFocus(event, event.currentTarget as HTMLElement); }
  protected setLocale(locale: UiLocale): void { this.updateDraft({ locale }); }
  protected setPreset(preset: ThemePreset): void {
    const base: BaseTheme = preset === 'light' ? 'light' : 'dark';
    this.updateDraft({ appearance: { ...this.draft().appearance, preset, base } });
  }
  protected setFont(font: UiFont): void { this.updateDraft({ appearance: { ...this.draft().appearance, font } }); }
  protected setFontSize(fontSize: UiFontSize): void { this.updateDraft({ appearance: { ...this.draft().appearance, fontSize } }); }
  protected fontSizeIndex(): number { return ({ small: 0, normal: 1, large: 2 } as const)[this.draft().appearance.fontSize]; }
  protected setFontSizeIndex(event: Event): void { this.setFontSize((['small', 'normal', 'large'] as const)[Math.min(2, Math.max(0, Math.round(Number((event.target as HTMLInputElement).value))))]); }
  protected setEditorBackground(editorBackground: BaseTheme): void { this.updateDraft({ appearance: { ...this.draft().appearance, editorBackground } }); }
  protected setControl(key: keyof UiPreferences['controls'], value: string): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    this.updateDraft({ controls: { ...this.draft().controls, [key]: numeric } });
  }
  protected setShortcutSearch(value: string): void { this.shortcutSearch.set(value); }
  protected setMouseSearch(value: string): void { this.mouseSearch.set(value); }
  protected beginShortcutCapture(action: KeyboardAction): void { this.capturingAction.set(action); }
  protected beginMouseCapture(action: MouseAction): void { this.capturingMouseAction.set(action); }
  protected cancelShortcutCapture(): void { this.capturingAction.set(undefined); this.capturingMouseAction.set(undefined); }
  protected handleShortcutKeydown(event: KeyboardEvent): void {
    const action = this.capturingAction();
    const mouseAction = this.capturingMouseAction();
    if (!action && !mouseAction) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') { this.cancelShortcutCapture(); return; }
    if (event.key === 'Backspace' || event.key === 'Delete') { if (action) this.setShortcut(action, ''); else if (mouseAction) this.setMouseShortcut(mouseAction, ''); this.cancelShortcutCapture(); return; }
    if (!action) return;
    const binding = bindingFromKeyboardEvent(event);
    if (binding && !isModifierOnlyBinding(binding)) { this.setShortcut(action, binding); this.cancelShortcutCapture(); }
  }
  protected handleShortcutPointerdown(event: PointerEvent): void {
    const action = this.capturingMouseAction();
    if (!action) return;
    event.preventDefault(); event.stopPropagation();
    const binding = mouseBindingFromEvent(event);
    if (binding) { this.setMouseShortcut(action, binding); this.cancelShortcutCapture(); }
  }
  protected handleShortcutWheel(event: WheelEvent): void {
    const action = this.capturingMouseAction();
    if (!action) return;
    event.preventDefault(); event.stopPropagation();
    const binding = mouseBindingFromEvent(event);
    if (binding) { this.setMouseShortcut(action, binding); this.cancelShortcutCapture(); }
  }
  protected bindingLabel(action: KeyboardAction): string { return this.displayBinding(this.draft().shortcuts[action]); }
  protected mouseBindingLabel(action: MouseAction): string { return this.displayBinding(this.draft().mouseBindings[action]); }
  protected shortcutLabel(action: KeyboardAction): string {
    const key = ({
      'move-forward': 'shortcutMoveForward', 'move-backward': 'shortcutMoveBackward', 'move-left': 'shortcutMoveLeft', 'move-right': 'shortcutMoveRight', 'move-up': 'shortcutMoveUp', 'move-down': 'shortcutMoveDown',
      'tool-place': 'toolPlace', 'tool-select': 'toolSelect', 'mode-3d': 'mode3d', 'mode-y-layer': 'modeYLayer', 'fit-structure': 'fitStructure', 'focus-selection': 'focusSelection', 'save-project': 'saveProjectMenu',
      undo: 'undo', redo: 'redo', 'select-all': 'selectAll', 'clear-selection': 'clearSelection', 'delete-selection': 'deleteSelection',
      'quick-slot-1': 'quickSlot1', 'quick-slot-2': 'quickSlot2', 'quick-slot-3': 'quickSlot3', 'quick-slot-4': 'quickSlot4', 'quick-slot-5': 'quickSlot5', 'quick-slot-6': 'quickSlot6', 'quick-slot-7': 'quickSlot7', 'quick-slot-8': 'quickSlot8', 'quick-slot-9': 'quickSlot9', 'quick-slot-10': 'quickSlot10',
    } as const)[action];
    return this.i18n.t(key);
  }
  protected shortcutGroupLabel(group: 'movement' | 'tools-view' | 'editing' | 'quickBar'): string { return ({ movement: this.i18n.t('movementSettingsGroup'), 'tools-view': this.i18n.t('toolsViewSettingsGroup'), editing: this.i18n.t('editingSettingsGroup'), quickBar: this.i18n.t('quickBarSettingsGroup') } as const)[group]; }
  protected mouseActionLabel(action: MouseAction): string { return ({ 'primary-action': this.i18n.t('mousePrimaryAction'), 'delete-target': this.i18n.t('mouseDeleteTarget'), 'pick-block': this.i18n.t('mousePickBlock'), 'orbit-camera': this.i18n.t('mouseOrbit'), 'pan-camera': this.i18n.t('mousePan'), 'zoom-in': this.i18n.t('mouseZoomIn'), 'zoom-out': this.i18n.t('mouseZoomOut') } as const)[action]; }
  protected restoreGeneralDefaults(): void { this.updateDraft({ locale: this.preferences.defaultPreferences().locale }); }
  protected restoreAppearanceDefaults(): void { this.updateDraft({ appearance: { ...this.preferences.defaultPreferences().appearance } }); }
  protected restoreControlsDefaults(): void { this.updateDraft({ controls: { ...this.preferences.defaultPreferences().controls } }); }
  protected restoreShortcutsDefaults(): void { this.updateDraft({ shortcuts: { ...this.preferences.defaultPreferences().shortcuts } }); this.cancelShortcutCapture(); }
  protected restoreMouseDefaults(): void { this.updateDraft({ mouseBindings: { ...this.preferences.defaultPreferences().mouseBindings } }); this.cancelShortcutCapture(); }
  protected clearShortcut(action: KeyboardAction): void { this.setShortcut(action, ''); this.cancelShortcutCapture(); }
  protected clearMouseBinding(action: MouseAction): void { this.setMouseShortcut(action, ''); this.cancelShortcutCapture(); }
  protected clearAllShortcuts(): void { this.updateDraft({ shortcuts: Object.fromEntries(KEYBOARD_ACTIONS.map(({ action }) => [action, ''])) as UiPreferences['shortcuts'] }); this.cancelShortcutCapture(); }
  protected clearAllMouseBindings(): void { this.updateDraft({ mouseBindings: Object.fromEntries(MOUSE_ACTIONS.map(({ action }) => [action, ''])) as UiPreferences['mouseBindings'] }); this.cancelShortcutCapture(); }
  protected async apply(): Promise<void> {
    if (this.shortcutConflicts().length || this.mouseBindingConflicts().length) return;
    const draft = this.draft();
    this.preferences.update({ locale: draft.locale, appearance: { ...this.preferences.preferences().appearance, ...draft.appearance }, controls: { ...draft.controls }, shortcuts: { ...draft.shortcuts }, mouseBindings: { ...draft.mouseBindings } });
    this.baseline.set(this.readDraft());
    this.draft.set(this.readDraft());
  }
  protected async saveAndClose(): Promise<void> { if (this.shortcutConflicts().length || this.mouseBindingConflicts().length) return; await this.apply(); this.closed.emit(); }
  protected async requestClose(): Promise<void> {
    if (this.capturingAction() || this.capturingMouseAction()) { this.cancelShortcutCapture(); return; }
    if (!this.dirty()) { this.closed.emit(); return; }
    const confirmed = await this.dialogs.confirm({ title: this.i18n.t('discardChangesTitle'), text: this.i18n.t('discardChangesText'), confirmButtonText: this.i18n.t('discardChanges'), cancelButtonText: this.i18n.t('cancel') });
    if (confirmed) this.closed.emit();
  }
  protected onBackdropClick(event: MouseEvent): void { if (event.target === event.currentTarget) void this.requestClose(); }
  protected sectionLabel(section: SettingsSection): string {
    return ({ general: this.i18n.t('generalSettings'), appearance: this.i18n.t('appearanceSettings'), controls: this.i18n.t('controlsSettings'), shortcuts: this.i18n.t('shortcutsSettings'), accessibility: this.i18n.t('accessibilitySettings') } as const)[section];
  }
  private setShortcut(action: KeyboardAction, binding: string): void { this.updateDraft({ shortcuts: { ...this.draft().shortcuts, [action]: binding } }); }
  private setMouseShortcut(action: MouseAction, binding: string): void { this.updateDraft({ mouseBindings: { ...this.draft().mouseBindings, [action]: binding } }); }
  private displayBinding(binding: string): string { return binding ? binding.split('|').map((alternative) => alternative.split('+').map((token) => this.displayBindingToken(token)).join(' + ')).join(' / ') : this.i18n.t('unassigned'); }
  private displayBindingToken(token: string): string { return ({ Ctrl: this.i18n.t('keyCtrl'), Shift: this.i18n.t('keyShift'), Alt: this.i18n.t('keyAlt'), Meta: this.i18n.t('keyMeta'), LeftClick: this.i18n.t('mouseLeftClick'), RightClick: this.i18n.t('mouseRightClick'), MiddleClick: this.i18n.t('mouseMiddleClick'), WheelUp: this.i18n.t('mouseWheelUp'), WheelDown: this.i18n.t('mouseWheelDown') } as Record<string, string>)[token] ?? token; }
  private updateDraft(patch: Partial<SettingsDraft>): void { this.draft.update((current) => ({ ...current, ...patch, appearance: { ...current.appearance, ...(patch.appearance ?? {}) }, controls: { ...current.controls, ...(patch.controls ?? {}) }, shortcuts: { ...current.shortcuts, ...(patch.shortcuts ?? {}) }, mouseBindings: { ...current.mouseBindings, ...(patch.mouseBindings ?? {}) } })); }
  private readDraft(): SettingsDraft { const current = this.preferences.preferences(); return { locale: current.locale, appearance: { ...current.appearance }, controls: { ...current.controls }, shortcuts: { ...current.shortcuts }, mouseBindings: { ...current.mouseBindings } }; }
}
