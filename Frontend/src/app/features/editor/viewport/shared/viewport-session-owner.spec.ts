import { afterEach, describe, expect, it } from 'vitest';
import { UiPreferencesService } from '../../../../core/ui/preferences/ui-preferences.service';
import { synchronizeRealityPreferenceFallback } from './viewport-session-owner';

describe('viewport Reality preference fallback', () => {
  afterEach(() => localStorage.removeItem('the-block-laundromat.ui-preferences'));

  it('persists the actual fallback while preserving the independent sky choice', () => {
    const preferences = new UiPreferencesService();
    preferences.setAppearance({
      editorBackground: 'reality',
      reality: { groundPreset: 'sand', skyPreset: 'nether' },
    });

    synchronizeRealityPreferenceFallback(preferences, {
      kind: 'ground',
      requested: 'sand',
      fallback: 'plains-grass',
    });

    expect(preferences.preferences().appearance.reality).toEqual({
      groundPreset: 'plains-grass',
      skyPreset: 'nether',
    });
    expect(
      JSON.parse(localStorage.getItem('the-block-laundromat.ui-preferences') ?? '{}'),
    ).toMatchObject({
      appearance: { reality: { groundPreset: 'plains-grass', skyPreset: 'nether' } },
    });
  });

  it('ignores a stale asynchronous fallback after the user selects another preset', () => {
    const preferences = new UiPreferencesService();
    preferences.setAppearance({
      editorBackground: 'reality',
      reality: { groundPreset: 'snow', skyPreset: 'end' },
    });

    synchronizeRealityPreferenceFallback(preferences, {
      kind: 'ground',
      requested: 'sand',
      fallback: 'plains-grass',
    });
    synchronizeRealityPreferenceFallback(preferences, {
      kind: 'sky',
      requested: 'overworld-night',
      fallback: 'overworld-day',
    });

    expect(preferences.preferences().appearance.reality).toEqual({
      groundPreset: 'snow',
      skyPreset: 'end',
    });
  });

  it('synchronizes a sky fallback without changing the ground preset', () => {
    const preferences = new UiPreferencesService();
    preferences.setAppearance({
      editorBackground: 'reality',
      reality: { groundPreset: 'end-stone', skyPreset: 'overworld-night' },
    });

    synchronizeRealityPreferenceFallback(preferences, {
      kind: 'sky',
      requested: 'overworld-night',
      fallback: 'overworld-day',
    });

    expect(preferences.preferences().appearance.reality).toEqual({
      groundPreset: 'end-stone',
      skyPreset: 'overworld-day',
    });
  });
});
