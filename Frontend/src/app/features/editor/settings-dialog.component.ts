import { Component, computed, inject, output, signal } from '@angular/core';
import { DialogService } from '../../core/ui/dialog.service';
import { I18nService } from '../../core/ui/i18n.service';
import { UiPreferences, UiPreferencesService, UiLocale, ThemePreset, UiFont, BaseTheme } from '../../core/ui/ui-preferences.service';
import { LucideX } from '@lucide/angular';
import { UiTooltipDirective } from '../../shared/ui-tooltip.directive';
import { ThemedSelectComponent, ThemedSelectOption } from '../../shared/themed-select.component';

type SettingsSection = 'general' | 'appearance' | 'controls' | 'shortcuts' | 'accessibility';
type SettingsDraft = Pick<UiPreferences, 'locale'> & { readonly appearance: UiPreferences['appearance']; readonly controls: UiPreferences['controls'] };

@Component({
  selector: 'app-settings-dialog',
  imports: [LucideX, UiTooltipDirective, ThemedSelectComponent],
  templateUrl: './settings-dialog.component.html',
  styleUrl: './settings-dialog.component.scss',
  host: { '(document:keydown.escape)': 'requestClose()' },
})
export class SettingsDialogComponent {
  protected readonly i18n = inject(I18nService);
  private readonly preferences = inject(UiPreferencesService);
  private readonly dialogs = inject(DialogService);
  readonly closed = output<void>();
  protected readonly section = signal<SettingsSection>('general');
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

  protected setSection(section: SettingsSection): void { this.section.set(section); }
  protected setLocale(locale: UiLocale): void { this.updateDraft({ locale }); }
  protected setPreset(preset: ThemePreset): void {
    const base: BaseTheme = preset === 'light' ? 'light' : 'dark';
    this.updateDraft({ appearance: { ...this.draft().appearance, preset, base } });
  }
  protected setFont(font: UiFont): void { this.updateDraft({ appearance: { ...this.draft().appearance, font } }); }
  protected setEditorBackground(editorBackground: BaseTheme): void { this.updateDraft({ appearance: { ...this.draft().appearance, editorBackground } }); }
  protected setControl(key: keyof UiPreferences['controls'], value: string): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    this.updateDraft({ controls: { ...this.draft().controls, [key]: numeric } });
  }
  protected restoreGeneralDefaults(): void { this.updateDraft({ locale: this.preferences.defaultPreferences().locale }); }
  protected restoreAppearanceDefaults(): void { this.updateDraft({ appearance: { ...this.preferences.defaultPreferences().appearance } }); }
  protected restoreControlsDefaults(): void { this.updateDraft({ controls: { ...this.preferences.defaultPreferences().controls } }); }
  protected async apply(): Promise<void> {
    const draft = this.draft();
    this.preferences.update({ locale: draft.locale, appearance: { ...this.preferences.preferences().appearance, ...draft.appearance }, controls: { ...draft.controls } });
    this.baseline.set(this.readDraft());
    this.draft.set(this.readDraft());
  }
  protected async saveAndClose(): Promise<void> { await this.apply(); this.closed.emit(); }
  protected async requestClose(): Promise<void> {
    if (!this.dirty()) { this.closed.emit(); return; }
    const confirmed = await this.dialogs.confirm({ title: this.i18n.t('discardChangesTitle'), text: this.i18n.t('discardChangesText'), confirmButtonText: this.i18n.t('discardChanges'), cancelButtonText: this.i18n.t('cancel') });
    if (confirmed) this.closed.emit();
  }
  protected onBackdropClick(event: MouseEvent): void { if (event.target === event.currentTarget) void this.requestClose(); }
  protected sectionLabel(section: SettingsSection): string {
    return ({ general: this.i18n.t('generalSettings'), appearance: this.i18n.t('appearanceSettings'), controls: this.i18n.t('controlsSettings'), shortcuts: this.i18n.t('shortcutsSettings'), accessibility: this.i18n.t('accessibilitySettings') } as const)[section];
  }
  private updateDraft(patch: Partial<SettingsDraft>): void { this.draft.update((current) => ({ ...current, ...patch, appearance: { ...current.appearance, ...(patch.appearance ?? {}) } })); }
  private readDraft(): SettingsDraft { const current = this.preferences.preferences(); return { locale: current.locale, appearance: { ...current.appearance }, controls: { ...current.controls } }; }
}
