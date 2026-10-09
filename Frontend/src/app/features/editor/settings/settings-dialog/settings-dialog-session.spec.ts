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
