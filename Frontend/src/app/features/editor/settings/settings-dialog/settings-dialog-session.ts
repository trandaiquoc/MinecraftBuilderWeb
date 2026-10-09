import { Injectable, Signal, WritableSignal, computed, signal } from '@angular/core';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import {
  UiPreferences,
  UiPreferencesService,
  UiLocale,
  ThemePreset,
  UiFont,
  UiFontSize,
  BaseTheme,
  blockBrightnessStopPercent,
} from '../../../../core/ui/preferences/ui-preferences.service';
import {
  KEYBOARD_ACTIONS,
  KeyboardAction,
  bindingFromKeyboardEvent,
  findBindingConflicts,
  isModifierOnlyBinding,
} from '../../../../core/editor/input/keyboard-bindings';
import {
  MOUSE_ACTIONS,
  MouseAction,
  findMouseBindingConflicts,
  mouseBindingFromEvent,
} from '../../../../core/editor/input/mouse-bindings';

export type SettingsDraft = Pick<
  UiPreferences,
  'locale' | 'autoUseHugeStructureBlocks' | 'showStructureBlockGuide'
> & {
  readonly appearance: UiPreferences['appearance'];
  readonly accessibility: UiPreferences['accessibility'];
  readonly controls: UiPreferences['controls'];
  readonly shortcuts: UiPreferences['shortcuts'];
  readonly mouseBindings: UiPreferences['mouseBindings'];
};

@Injectable()
export class SettingsDialogSession {
  constructor(
    private readonly preferences: UiPreferencesService,
    private readonly dialogs: DialogService,
    private readonly i18n: I18nService,
  ) {
    const initial = this.readDraft();
    this.baseline = signal(initial);
    this.draft = signal(initial);
    this.dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.baseline()));
    this.shortcutConflicts = computed(() => findBindingConflicts(this.draft().shortcuts));
    this.mouseBindingConflicts = computed(() =>
      findMouseBindingConflicts(this.draft().mouseBindings),
    );
  }

  private readonly baseline: WritableSignal<SettingsDraft>;
  readonly draft: WritableSignal<SettingsDraft>;
  readonly dirty: Signal<boolean>;
  readonly shortcutConflicts: Signal<ReturnType<typeof findBindingConflicts>>;
  readonly mouseBindingConflicts: Signal<ReturnType<typeof findMouseBindingConflicts>>;
  readonly capturingAction = signal<KeyboardAction | undefined>(undefined);
  readonly capturingMouseAction = signal<MouseAction | undefined>(undefined);

  setLocale(locale: UiLocale): void {
    this.updateDraft({ locale });
  }
  setAutoUseHugeStructureBlocks(enabled: boolean): void {
    this.updateDraft({ autoUseHugeStructureBlocks: enabled });
  }
  setShowStructureBlockGuide(enabled: boolean): void {
    this.updateDraft({ showStructureBlockGuide: enabled });
  }

  setPreset(preset: ThemePreset): void {
    const base: BaseTheme = preset === 'light' ? 'light' : 'dark';
    this.updateDraft({ appearance: { ...this.draft().appearance, preset, base } });
  }

  setFont(font: UiFont): void {
    this.updateDraft({ appearance: { ...this.draft().appearance, font } });
  }
  setFontSize(fontSize: UiFontSize): void {
    this.updateDraft({ appearance: { ...this.draft().appearance, fontSize } });
  }
  setEditorBackground(editorBackground: BaseTheme): void {
    this.updateDraft({ appearance: { ...this.draft().appearance, editorBackground } });
  }

  setBlockBrightness(value: string): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const blockBrightness = Math.min(10, Math.max(0, Math.round(numeric)));
    this.updateDraft({ accessibility: { blockBrightness } });
    this.preferences.previewAccessibility({ blockBrightness });
  }

  defaultBrightnessStop(): string {
    return `${blockBrightnessStopPercent(this.preferences.defaultPreferences().accessibility.blockBrightness)}%`;
  }
  defaultBlockBrightness(): number {
    return this.preferences.defaultPreferences().accessibility.blockBrightness;
  }

  setControl(key: keyof UiPreferences['controls'], value: string): void {
    const numeric = Number(value);
    if (Number.isFinite(numeric))
      this.updateDraft({ controls: { ...this.draft().controls, [key]: numeric } });
  }

  beginShortcutCapture(action: KeyboardAction): void {
    this.capturingAction.set(action);
    this.capturingMouseAction.set(undefined);
  }
  beginMouseCapture(action: MouseAction): void {
    this.capturingMouseAction.set(action);
    this.capturingAction.set(undefined);
  }
  cancelCapture(): void {
    this.capturingAction.set(undefined);
    this.capturingMouseAction.set(undefined);
  }

  handleKeydown(event: KeyboardEvent): void {
    const action = this.capturingAction();
    const mouseAction = this.capturingMouseAction();
    if (!action && !mouseAction) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.cancelCapture();
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      if (action) this.setShortcut(action, '');
      else if (mouseAction) this.setMouseBinding(mouseAction, '');
      this.cancelCapture();
      return;
    }
    if (!action) return;
    const binding = bindingFromKeyboardEvent(event);
    if (binding && !isModifierOnlyBinding(binding)) {
      this.setShortcut(action, binding);
      this.cancelCapture();
    }
  }

  handlePointerdown(event: PointerEvent): void {
    const action = this.capturingMouseAction();
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const binding = mouseBindingFromEvent(event);
    if (binding) {
      this.setMouseBinding(action, binding);
      this.cancelCapture();
    }
  }

  handleWheel(event: WheelEvent): void {
    const action = this.capturingMouseAction();
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const binding = mouseBindingFromEvent(event);
    if (binding) {
      this.setMouseBinding(action, binding);
      this.cancelCapture();
    }
  }

  restoreGeneralDefaults(): void {
    const defaults = this.preferences.defaultPreferences();
    this.updateDraft({
      locale: defaults.locale,
      autoUseHugeStructureBlocks: defaults.autoUseHugeStructureBlocks,
      showStructureBlockGuide: defaults.showStructureBlockGuide,
    });
  }
  restoreAppearanceDefaults(): void {
    this.updateDraft({ appearance: { ...this.preferences.defaultPreferences().appearance } });
  }
  restoreControlsDefaults(): void {
    this.updateDraft({ controls: { ...this.preferences.defaultPreferences().controls } });
  }
  restoreShortcutsDefaults(): void {
    this.updateDraft({ shortcuts: { ...this.preferences.defaultPreferences().shortcuts } });
    this.cancelCapture();
  }
  restoreMouseDefaults(): void {
    this.updateDraft({ mouseBindings: { ...this.preferences.defaultPreferences().mouseBindings } });
    this.cancelCapture();
  }
  restoreAccessibilityDefaults(): void {
    const accessibility = { ...this.preferences.defaultPreferences().accessibility };
    this.updateDraft({ accessibility });
    this.preferences.previewAccessibility(accessibility);
  }

  clearShortcut(action: KeyboardAction): void {
    this.setShortcut(action, '');
    this.cancelCapture();
  }
  clearMouseBinding(action: MouseAction): void {
    this.setMouseBinding(action, '');
    this.cancelCapture();
  }
  clearAllShortcuts(): void {
    this.updateDraft({
      shortcuts: Object.fromEntries(
        KEYBOARD_ACTIONS.map(({ action }) => [action, '']),
      ) as UiPreferences['shortcuts'],
    });
    this.cancelCapture();
  }
  clearAllMouseBindings(): void {
    this.updateDraft({
      mouseBindings: Object.fromEntries(
        MOUSE_ACTIONS.map(({ action }) => [action, '']),
      ) as UiPreferences['mouseBindings'],
    });
    this.cancelCapture();
  }

  apply(): boolean {
    if (this.shortcutConflicts().length || this.mouseBindingConflicts().length) return false;
    const draft = this.draft();
    this.preferences.update({
      locale: draft.locale,
      autoUseHugeStructureBlocks: draft.autoUseHugeStructureBlocks,
      showStructureBlockGuide: draft.showStructureBlockGuide,
      appearance: { ...this.preferences.preferences().appearance, ...draft.appearance },
      accessibility: { ...draft.accessibility },
      controls: { ...draft.controls },
      shortcuts: { ...draft.shortcuts },
      mouseBindings: { ...draft.mouseBindings },
    });
    this.preferences.clearAccessibilityPreview();
    this.resetDraftFromPreferences();
    return true;
  }

  async requestClose(): Promise<boolean> {
    if (this.capturingAction() || this.capturingMouseAction()) {
      this.cancelCapture();
      return false;
    }
    if (!this.dirty()) {
      this.preferences.clearAccessibilityPreview();
      return true;
    }
    const confirmed = await this.dialogs.confirm({
      title: this.i18n.t('discardChangesTitle'),
      text: this.i18n.t('discardChangesText'),
      confirmButtonText: this.i18n.t('discardChanges'),
      cancelButtonText: this.i18n.t('cancel'),
    });
    if (confirmed) this.preferences.clearAccessibilityPreview();
    return confirmed;
  }

  clearAccessibilityPreview(): void {
    this.preferences.clearAccessibilityPreview();
  }

  private setShortcut(action: KeyboardAction, binding: string): void {
    this.updateDraft({ shortcuts: { ...this.draft().shortcuts, [action]: binding } });
  }
  private setMouseBinding(action: MouseAction, binding: string): void {
    this.updateDraft({ mouseBindings: { ...this.draft().mouseBindings, [action]: binding } });
  }

  private updateDraft(patch: Partial<SettingsDraft>): void {
    this.draft.update((current) => ({
      ...current,
      ...patch,
      appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
      accessibility: { ...current.accessibility, ...(patch.accessibility ?? {}) },
      controls: { ...current.controls, ...(patch.controls ?? {}) },
      shortcuts: { ...current.shortcuts, ...(patch.shortcuts ?? {}) },
      mouseBindings: { ...current.mouseBindings, ...(patch.mouseBindings ?? {}) },
    }));
  }

  private resetDraftFromPreferences(): void {
    const current = this.readDraft();
    this.baseline.set(current);
    this.draft.set(current);
  }

  private readDraft(): SettingsDraft {
    const current = this.preferences.preferences();
    return {
      locale: current.locale,
      autoUseHugeStructureBlocks: current.autoUseHugeStructureBlocks,
      showStructureBlockGuide: current.showStructureBlockGuide,
      appearance: { ...current.appearance },
      accessibility: { ...current.accessibility },
      controls: { ...current.controls },
      shortcuts: { ...current.shortcuts },
      mouseBindings: { ...current.mouseBindings },
    };
  }
}
