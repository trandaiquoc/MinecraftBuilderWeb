import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { UiPreferencesService } from '../../../../core/ui/preferences/ui-preferences.service';
import { SettingsDialogSession } from './settings-dialog-session';

describe('SettingsDialogSession', () => {
  let session: SettingsDialogSession;
  let preferences: UiPreferencesService;
  const dialogs = { confirm: vi.fn(async () => false) };

  beforeEach(() => {
    dialogs.confirm.mockReset().mockResolvedValue(false);
    localStorage.removeItem('the-block-laundromat.ui-preferences');
    preferences = new UiPreferencesService();
    session = new SettingsDialogSession(
      preferences,
      dialogs as unknown as DialogService,
      { t: (key: string) => key } as I18nService,
    );
  });

  it('applies the dialog draft and resets its dirty baseline', () => {
    session.setLocale('vi');
    session.setPreset('light');
    expect(session.dirty()).toBe(true);
    expect(session.apply()).toBe(true);
    expect(preferences.preferences()).toMatchObject({
      locale: 'vi',
      appearance: { preset: 'light', base: 'light' },
    });
    expect(session.dirty()).toBe(false);
  });

  it('applies independent theme, font, size, and workspace choices; cancel discards later edits', async () => {
    session.setPreset('raccoon');
    session.setFont('pangolin');
    session.setFontSize('large');
    session.setEditorBackground('light');
    expect(session.apply()).toBe(true);
    expect(preferences.preferences().appearance).toMatchObject({
      preset: 'raccoon',
      font: 'pangolin',
      fontSize: 'large',
      editorBackground: 'light',
    });

    session.setPreset('dark');
    session.setFont('chakra-petch');
    expect(session.dirty()).toBe(true);
    dialogs.confirm.mockResolvedValueOnce(true);
    expect(await session.requestClose()).toBe(true);
    expect(preferences.preferences().appearance).toMatchObject({
      preset: 'raccoon',
      font: 'pangolin',
      fontSize: 'large',
      editorBackground: 'light',
    });
  });

  it('applies independent Reality presets and keeps the latest Apply as the cancel baseline', async () => {
    session.setEditorBackground('reality');
    session.setRealityGroundPreset('sand');
    session.setRealitySkyPreset('overworld-night');
    expect(session.apply()).toBe(true);
    expect(preferences.preferences().appearance).toMatchObject({
      editorBackground: 'reality',
      reality: { groundPreset: 'sand', skyPreset: 'overworld-night' },
    });

    session.setRealityGroundPreset('snow');
    session.setRealitySkyPreset('nether');
    dialogs.confirm.mockResolvedValueOnce(true);
    expect(await session.requestClose()).toBe(true);
    expect(preferences.preferences().appearance.reality).toEqual({
      groundPreset: 'sand',
      skyPreset: 'overworld-night',
    });
  });

  it('restores Interface defaults without changing Workspace Background choices', () => {
    session.setEditorBackground('reality');
    session.setRealityGroundPreset('end-stone');
    session.setRealitySkyPreset('end');
    session.setPreset('raccoon');
    session.setFont('pangolin');
    session.setFontSize('large');
    session.restoreInterfaceDefaults();
    expect(session.draft().appearance).toMatchObject({
      preset: 'craft',
      font: 'comfortaa',
      fontSize: 'normal',
      editorBackground: 'reality',
    });
    expect(session.draft().appearance.reality).toEqual({
      groundPreset: 'end-stone',
      skyPreset: 'end',
    });
  });

  it('restores Workspace Background defaults without changing Interface choices', () => {
    session.setPreset('raccoon');
    session.setFont('pangolin');
    session.setFontSize('large');
    session.setEditorBackground('reality');
    session.setRealityGroundPreset('snow');
    session.setRealitySkyPreset('nether');
    session.restoreWorkspaceBackgroundDefaults();
    expect(session.draft().appearance).toMatchObject({
      preset: 'raccoon',
      font: 'pangolin',
      fontSize: 'large',
      editorBackground: 'dark',
      reality: { groundPreset: 'plains-grass', skyPreset: 'overworld-day' },
    });
  });

  it('keeps scoped reset behavior after partial Apply and discards later edits on Cancel', async () => {
    session.setPreset('light');
    session.setFont('chakra-petch');
    expect(session.apply()).toBe(true);
    session.setPreset('dark');
    session.setEditorBackground('reality');
    session.setRealityGroundPreset('snow');
    session.restoreWorkspaceBackgroundDefaults();
    expect(session.draft().appearance).toMatchObject({
      preset: 'dark',
      font: 'chakra-petch',
      editorBackground: 'dark',
      reality: { groundPreset: 'plains-grass', skyPreset: 'overworld-day' },
    });
    expect(session.dirty()).toBe(true);
    dialogs.confirm.mockResolvedValueOnce(true);
    expect(await session.requestClose()).toBe(true);
    expect(preferences.preferences().appearance).toMatchObject({
      preset: 'light',
      font: 'chakra-petch',
      editorBackground: 'dark',
    });
  });

  it('saves an independently reset Interface draft with Save & Close semantics', () => {
    session.setPreset('dark');
    session.setFont('pangolin');
    expect(session.apply()).toBe(true);
    session.setPreset('light');
    session.restoreInterfaceDefaults();
    expect(session.draft().appearance).toMatchObject({ preset: 'craft', font: 'comfortaa' });
    expect(session.apply()).toBe(true);
    expect(session.dirty()).toBe(false);
    expect(preferences.preferences().appearance).toMatchObject({
      preset: 'craft',
      font: 'comfortaa',
      fontSize: 'normal',
    });
  });

  it('syncs persisted Reality fallbacks without overwriting an in-progress preset edit', () => {
    session.setRealityGroundPreset('sand');
    expect(session.draft().appearance.reality.groundPreset).toBe('sand');
    preferences.setAppearance({
      reality: { groundPreset: 'snow', skyPreset: 'nether' },
    });
    expect(session.draft().appearance.reality.groundPreset).toBe('sand');
    session.syncPersistedReality(preferences.preferences().appearance.reality);

    expect(session.draft().appearance.reality).toEqual({
      groundPreset: 'sand',
      skyPreset: 'nether',
    });
    expect(session.dirty()).toBe(true);
  });

  it('rejects Apply while keyboard or mouse bindings conflict', () => {
    const action = session.draft().shortcuts['tool-place'];
    session.beginShortcutCapture('tool-place');
    session.handleKeydown({
      key: 'z',
      ctrlKey: true,
      preventDefault() {},
      stopPropagation() {},
    } as KeyboardEvent);
    expect(session.shortcutConflicts().length).toBeGreaterThan(0);
    expect(session.apply()).toBe(false);
    expect(session.draft().shortcuts['tool-place']).not.toBe(action);

    session.clearShortcut('tool-place');
    session.beginMouseCapture('zoom-out');
    session.handlePointerdown({
      button: 0,
      preventDefault() {},
      stopPropagation() {},
    } as PointerEvent);
    expect(session.mouseBindingConflicts().length).toBeGreaterThan(0);
    expect(session.apply()).toBe(false);
  });

  it('keeps wheel capture and clearing inside the session', () => {
    session.beginMouseCapture('zoom-out');
    session.handleWheel({ deltaY: -1, preventDefault() {}, stopPropagation() {} } as WheelEvent);
    expect(session.draft().mouseBindings['zoom-out']).toBe('WheelUp');
    expect(session.capturingMouseAction()).toBeUndefined();
    session.clearMouseBinding('zoom-out');
    expect(session.draft().mouseBindings['zoom-out']).toBe('');
  });

  it('captures, persists, and restores the Backquote toggle binding', () => {
    session.beginShortcutCapture('tool-toggle');
    session.handleKeydown({
      key: '§',
      code: 'Backquote',
      preventDefault() {},
      stopPropagation() {},
    } as KeyboardEvent);
    expect(session.draft().shortcuts['tool-toggle']).toBe('Backquote');
    expect(session.apply()).toBe(true);
    expect(preferences.preferences().shortcuts['tool-toggle']).toBe('Backquote');

    session.restoreShortcutsDefaults();
    expect(session.draft().shortcuts['tool-toggle']).toBe('Backquote');
  });

  it('asks before discarding a dirty draft and preserves it when cancelled', async () => {
    session.setLocale(session.draft().locale === 'en' ? 'vi' : 'en');
    expect(await session.requestClose()).toBe(false);
    expect(session.dirty()).toBe(true);
    dialogs.confirm.mockResolvedValueOnce(true);
    expect(await session.requestClose()).toBe(true);
  });

  it('previews accessibility changes and clears the preview on confirmed close', async () => {
    const initial = preferences.effectivePreferences().accessibility.blockBrightness;
    session.setBlockBrightness(String(initial + 1));
    expect(preferences.effectivePreferences().accessibility.blockBrightness).toBe(initial + 1);
    dialogs.confirm.mockResolvedValueOnce(true);
    expect(await session.requestClose()).toBe(true);
    expect(preferences.effectivePreferences().accessibility.blockBrightness).toBe(initial);
  });
});
