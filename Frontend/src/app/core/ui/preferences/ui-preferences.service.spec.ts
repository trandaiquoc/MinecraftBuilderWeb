import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blockBrightnessStopPercent,
  LEGACY_LAYOUT_KEY,
  LEGACY_UI_PREFERENCES_KEY,
  UI_PREFERENCES_KEY,
  UiPreferencesService,
} from './ui-preferences.service';
import { DEFAULT_EXTERNAL_AI_CONTENT_LIMITS } from '../../persistence/structure-json/external-ai/external-ai-content-limits';

const key = UI_PREFERENCES_KEY;
const legacyKey = LEGACY_LAYOUT_KEY;

describe('UiPreferencesService', () => {
  afterEach(() => {
    localStorage.removeItem(key);
    localStorage.removeItem(legacyKey);
    localStorage.removeItem(LEGACY_UI_PREFERENCES_KEY);
  });

  it('exposes persisted preferences as read-only state', () => {
    const preferences = new UiPreferencesService();

    expect(preferences.preferences).not.toHaveProperty('set');
    expect(preferences.preferences).not.toHaveProperty('update');
  });

  it('uses safe defaults and persists updates', () => {
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().locale).toBe('en');
    expect(preferences.preferences().autoUseHugeStructureBlocks).toBe(false);
    expect(preferences.preferences().showStructureBlockGuide).toBe(true);
    expect(preferences.preferences().accessibility.blockBrightness).toBe(3);
    expect(preferences.preferences().appearance.font).toBe('comfortaa');
    expect(preferences.preferences().appearance.reality).toEqual({
      groundPreset: 'plains-grass',
      skyPreset: 'overworld-day',
    });
    expect(preferences.preferences().layout).toMatchObject({
      leftSidebarWidth: 360,
      rightSidebarWidth: 400,
    });
    expect(preferences.preferences().controls.zoomSensitivity).toBe(2);
    expect(preferences.preferences().controls.cameraMoveSpeed).toBe(15);
    expect(preferences.preferences().controls.verticalMoveSpeed).toBe(9);
    expect(preferences.preferences().structureExport.namespace).toBe('theblocklaundromat');
    preferences.setAppearance({ preset: 'craft', base: 'dark' });
    preferences.setAppearance({ editorBackground: 'light' });
    preferences.setLocale('vi');
    expect(preferences.preferences().appearance.editorBackground).toBe('light');
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({
      locale: 'vi',
      appearance: { preset: 'craft', editorBackground: 'light' },
    });
  });

  it('preserves legacy editor backgrounds and normalizes Reality presets independently', () => {
    localStorage.setItem(key, JSON.stringify({ appearance: { editorBackground: 'dark' } }));
    expect(new UiPreferencesService().preferences().appearance.editorBackground).toBe('dark');

    localStorage.setItem(key, JSON.stringify({ appearance: { editorBackground: 'light' } }));
    const legacy = new UiPreferencesService();
    expect(legacy.preferences().appearance.editorBackground).toBe('light');
    expect(legacy.preferences().appearance.reality).toEqual({
      groundPreset: 'plains-grass',
      skyPreset: 'overworld-day',
    });

    legacy.setAppearance({
      editorBackground: 'reality',
      reality: { groundPreset: 'warped-nylium', skyPreset: 'nether' },
    });
    const restored = new UiPreferencesService();
    expect(restored.preferences().appearance).toMatchObject({
      editorBackground: 'reality',
      reality: { groundPreset: 'warped-nylium', skyPreset: 'nether' },
    });

    localStorage.setItem(
      key,
      JSON.stringify({
        appearance: {
          editorBackground: 'reality',
          reality: { groundPreset: 'missing', skyPreset: 'void' },
        },
      }),
    );
    expect(new UiPreferencesService().preferences().appearance).toMatchObject({
      editorBackground: 'reality',
      reality: { groundPreset: 'plains-grass', skyPreset: 'overworld-day' },
    });
  });

  it('migrates and normalizes block brightness without changing other preferences', () => {
    localStorage.setItem(key, JSON.stringify({ locale: 'vi', appearance: { preset: 'light' } }));
    expect(new UiPreferencesService().preferences().accessibility.blockBrightness).toBe(3);
    localStorage.setItem(
      key,
      JSON.stringify({
        locale: 'vi',
        appearance: { preset: 'light' },
        accessibility: { blockBrightness: 7.6 },
      }),
    );
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().locale).toBe('vi');
    expect(preferences.preferences().appearance.preset).toBe('light');
    expect(preferences.preferences().accessibility.blockBrightness).toBe(8);
    localStorage.setItem(key, JSON.stringify({ accessibility: { blockBrightness: -1 } }));
    expect(new UiPreferencesService().preferences().accessibility.blockBrightness).toBe(0);
    localStorage.setItem(key, JSON.stringify({ accessibility: { blockBrightness: 11 } }));
    expect(new UiPreferencesService().preferences().accessibility.blockBrightness).toBe(10);
    localStorage.setItem(key, JSON.stringify({ accessibility: { blockBrightness: 'bright' } }));
    expect(new UiPreferencesService().preferences().accessibility.blockBrightness).toBe(3);
  });

  it('positions the default brightness marker from its numeric value', () => {
    expect(blockBrightnessStopPercent(0)).toBe(0);
    expect(blockBrightnessStopPercent(3)).toBe(30);
    expect(blockBrightnessStopPercent(10)).toBe(100);
  });

  it('persists accessibility updates and restores its defaults independently', () => {
    const preferences = new UiPreferencesService();
    preferences.setAppearance({ preset: 'light' });
    preferences.setAccessibility({ blockBrightness: 6.4 });
    expect(preferences.preferences().accessibility.blockBrightness).toBe(6);
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').accessibility.blockBrightness).toBe(6);
    preferences.reset();
    expect(preferences.preferences().accessibility.blockBrightness).toBe(3);
    expect(preferences.preferences().appearance.preset).toBe('craft');
  });

  it('keeps accessibility previews ephemeral and exposes them to viewport consumers', () => {
    const preferences = new UiPreferencesService();
    preferences.previewAccessibility({ blockBrightness: 10 });
    expect(preferences.effectivePreferences().accessibility.blockBrightness).toBe(10);
    expect(preferences.preferences().accessibility.blockBrightness).toBe(3);
    preferences.clearAccessibilityPreview();
    expect(preferences.effectivePreferences().accessibility.blockBrightness).toBe(3);
  });

  it('persists resizable sidebar widths and clamps invalid stored values', () => {
    const preferences = new UiPreferencesService();
    preferences.setLayout({ leftSidebarWidth: 340, rightSidebarWidth: 300 });
    expect(preferences.preferences().layout).toMatchObject({
      leftSidebarWidth: 340,
      rightSidebarWidth: 300,
    });
    localStorage.setItem(
      key,
      JSON.stringify({ layout: { leftSidebarWidth: 20, rightSidebarWidth: 900 } }),
    );
    expect(new UiPreferencesService().preferences().layout).toMatchObject({
      leftSidebarWidth: 180,
      rightSidebarWidth: 520,
    });
  });

  it('migrates the legacy layout key', () => {
    localStorage.setItem(legacyKey, JSON.stringify({ leftSidebarVisible: false }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().layout.leftSidebarVisible).toBe(false);
    expect(preferences.preferences().layout.rightSidebarVisible).toBe(true);
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').layout.leftSidebarVisible).toBe(false);
    expect(localStorage.getItem(legacyKey)).not.toBeNull();
  });

  it('copies legacy preferences once, preserves custom export settings, and prefers canonical conflicts', () => {
    localStorage.setItem(
      LEGACY_UI_PREFERENCES_KEY,
      JSON.stringify({
        locale: 'vi',
        appearance: { preset: 'light', font: 'minecraft-style' },
        layout: { leftSidebarWidth: 330 },
        shortcuts: { undo: 'Ctrl+Shift+Z' },
        structureExport: { namespace: 'minecraftbuilder', archiveName: 'mine', description: '' },
      }),
    );
    const migrated = new UiPreferencesService();
    expect(migrated.preferences()).toMatchObject({
      locale: 'vi',
      appearance: { preset: 'light', font: 'chakra-petch' },
      layout: { leftSidebarWidth: 330 },
      shortcuts: { undo: 'Ctrl+Shift+Z' },
      structureExport: { namespace: 'minecraftbuilder', archiveName: 'mine' },
    });
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_UI_PREFERENCES_KEY)).not.toBeNull();

    localStorage.setItem(key, JSON.stringify({ locale: 'en' }));
    expect(new UiPreferencesService().preferences().locale).toBe('en');
  });

  it('keeps legacy preferences usable when canonical-key migration storage fails', () => {
    localStorage.setItem(LEGACY_UI_PREFERENCES_KEY, JSON.stringify({ locale: 'vi' }));
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      expect(new UiPreferencesService().preferences().locale).toBe('vi');
    } finally {
      setItem.mockRestore();
    }
  });

  it('recovers when a legacy preference copy is interrupted after the canonical write', () => {
    localStorage.setItem(LEGACY_UI_PREFERENCES_KEY, JSON.stringify({ locale: 'vi' }));
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      storageKey: string,
      value: string,
    ) {
      originalSetItem.call(this, storageKey, value);
      if (storageKey === key) throw new Error('interrupted after write');
    });
    try {
      expect(new UiPreferencesService().preferences().locale).toBe('vi');
      expect(new UiPreferencesService().preferences().locale).toBe('vi');
      expect(localStorage.getItem(LEGACY_UI_PREFERENCES_KEY)).not.toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });

  it('falls back to intact legacy preferences without overwriting an invalid canonical value', () => {
    localStorage.setItem(LEGACY_UI_PREFERENCES_KEY, JSON.stringify({ locale: 'vi' }));
    localStorage.setItem(key, '{invalid');
    expect(new UiPreferencesService().preferences().locale).toBe('vi');
    expect(localStorage.getItem(key)).toBe('{invalid');
  });

  it('persists and safely normalizes Structure NBT export defaults without storing project paths', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        structureExport: {
          namespace: 'example_mod',
          archiveName: 'shared-pack',
          description: 'Shared export',
        },
      }),
    );
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().structureExport).toEqual({
      namespace: 'example_mod',
      archiveName: 'shared-pack',
      description: 'Shared export',
    });
    preferences.setStructureExport({ namespace: 'minecraftbuilder' });
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').structureExport).toMatchObject({
      namespace: 'minecraftbuilder',
      archiveName: 'shared-pack',
    });
    localStorage.setItem(
      key,
      JSON.stringify({ structureExport: { namespace: 4, archiveName: null, description: false } }),
    );
    expect(new UiPreferencesService().preferences().structureExport).toEqual({
      namespace: 'theblocklaundromat',
      archiveName: '',
      description: '',
    });
  });

  it('normalizes corrupt enum and numeric values', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        locale: 'fr',
        appearance: { preset: 'neon', font: 'comic' },
        controls: { orbitSensitivity: 99, clickDragThreshold: -2 },
      }),
    );
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().locale).toBe('en');
    expect(preferences.preferences().appearance.preset).toBe('craft');
    expect(preferences.preferences().appearance.font).toBe('comfortaa');
    expect(preferences.preferences().controls.orbitSensitivity).toBe(3);
    expect(preferences.preferences().controls.clickDragThreshold).toBe(1);
  });

  it('keeps font choice independent from theme and restores an explicit Minecraft font', () => {
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().appearance.font).toBe('comfortaa');
    preferences.setAppearance({ preset: 'light' });
    expect(preferences.preferences().appearance.font).toBe('comfortaa');
    preferences.setAppearance({ font: 'chakra-petch' });
    preferences.setAppearance({ preset: 'craft' });
    expect(preferences.preferences().appearance.font).toBe('chakra-petch');
    expect(new UiPreferencesService().preferences().appearance.font).toBe('chakra-petch');
  });

  it('keeps saved control values while reset restores the new defaults', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        controls: { zoomSensitivity: 1.4, cameraMoveSpeed: 6, verticalMoveSpeed: 12 },
      }),
    );
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().controls).toMatchObject({
      zoomSensitivity: 1.4,
      cameraMoveSpeed: 6,
      verticalMoveSpeed: 12,
    });
    preferences.reset();
    expect(preferences.preferences().controls).toMatchObject({
      zoomSensitivity: 2,
      cameraMoveSpeed: 15,
      verticalMoveSpeed: 9,
    });
  });

  it('migrates a missing font size to normal without resetting appearance', () => {
    localStorage.setItem(key, JSON.stringify({ appearance: { preset: 'light', font: 'geist' } }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().appearance.fontSize).toBe('normal');
    expect(preferences.preferences().appearance.preset).toBe('light');
    preferences.setAppearance({ fontSize: 'large' });
    expect(new UiPreferencesService().preferences().appearance.fontSize).toBe('large');
  });

  it('migrates legacy font values idempotently while preserving independent appearance choices', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        appearance: {
          preset: 'raccoon',
          base: 'light',
          font: 'minecraft-style',
          fontSize: 'large',
          editorBackground: 'light',
        },
      }),
    );

    const migrated = new UiPreferencesService();
    expect(migrated.preferences().appearance).toEqual({
      preset: 'raccoon',
      base: 'light',
      font: 'chakra-petch',
      fontSize: 'large',
      editorBackground: 'light',
      reality: { groundPreset: 'plains-grass', skyPreset: 'overworld-day' },
    });
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').appearance.font).toBe('chakra-petch');
    expect(new UiPreferencesService().preferences().appearance.font).toBe('chakra-petch');

    localStorage.setItem(key, JSON.stringify({ appearance: { font: 'geist' } }));
    expect(new UiPreferencesService().preferences().appearance.font).toBe('comfortaa');
  });

  it('uses the official appearance defaults without changing existing saved choices until reset', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        appearance: { preset: 'dark', font: 'pangolin', editorBackground: 'light' },
      }),
    );
    const saved = new UiPreferencesService();
    expect(saved.preferences().appearance).toMatchObject({
      preset: 'dark',
      font: 'pangolin',
      editorBackground: 'light',
    });
    saved.reset();
    expect(saved.preferences().appearance).toMatchObject({
      preset: 'craft',
      font: 'comfortaa',
      editorBackground: 'dark',
      fontSize: 'normal',
    });
  });

  it('normalizes, persists and resets the automatic Huge Structure Blocks preference', () => {
    localStorage.setItem(key, JSON.stringify({ locale: 'vi' }));
    expect(new UiPreferencesService().preferences().autoUseHugeStructureBlocks).toBe(false);
    const preferences = new UiPreferencesService();
    preferences.update({ autoUseHugeStructureBlocks: true });
    expect(preferences.preferences().autoUseHugeStructureBlocks).toBe(true);
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').autoUseHugeStructureBlocks).toBe(true);
    preferences.reset();
    expect(preferences.preferences().autoUseHugeStructureBlocks).toBe(false);
  });

  it('normalizes, persists and resets the Structure Block guide preference', () => {
    localStorage.setItem(key, JSON.stringify({ showStructureBlockGuide: 'yes' }));
    expect(new UiPreferencesService().preferences().showStructureBlockGuide).toBe(true);
    const preferences = new UiPreferencesService();
    preferences.update({ showStructureBlockGuide: false });
    expect(preferences.preferences().showStructureBlockGuide).toBe(false);
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').showStructureBlockGuide).toBe(false);
    preferences.reset();
    expect(preferences.preferences().showStructureBlockGuide).toBe(true);
  });

  it('migrates mouse defaults without losing saved keyboard overrides', () => {
    localStorage.setItem(key, JSON.stringify({ shortcuts: { 'move-forward': 'E' } }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().shortcuts['move-forward']).toBe('E');
    expect(preferences.preferences().mouseBindings['primary-action']).toBe('LeftClick');
  });

  it('seeds exactly the rare content-limit defaults only when the field is missing', () => {
    localStorage.setItem(key, JSON.stringify({ locale: 'vi' }));
    expect(new UiPreferencesService().preferences().externalAiContentLimits).toEqual(
      DEFAULT_EXTERNAL_AI_CONTENT_LIMITS,
    );
    localStorage.setItem(
      key,
      JSON.stringify({ externalAiContentLimits: { blocks: [], items: [], decorations: [] } }),
    );
    expect(new UiPreferencesService().preferences().externalAiContentLimits).toEqual({
      blocks: [],
      items: [],
      decorations: [],
    });
  });

  it('keeps content limits disabled by default and preserves an explicit toggle', () => {
    expect(new UiPreferencesService().preferences().externalAiContentLimitsEnabled).toBe(false);
    localStorage.setItem(
      key,
      JSON.stringify({
        externalAiContentLimitsEnabled: true,
        externalAiContentLimits: { blocks: [], items: [], decorations: [] },
      }),
    );
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().externalAiContentLimitsEnabled).toBe(true);
    preferences.setExternalAiContentLimitsEnabled(false);
    expect(new UiPreferencesService().preferences().externalAiContentLimitsEnabled).toBe(false);
    preferences.setExternalAiContentLimitsEnabled(true);
    preferences.resetExternalAiContentLimits();
    expect(preferences.preferences().externalAiContentLimitsEnabled).toBe(true);
    preferences.reset();
    expect(preferences.preferences().externalAiContentLimitsEnabled).toBe(false);
  });

  it('normalizes, deduplicates and persists content IDs without resetting unrelated preferences', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        locale: 'vi',
        externalAiContentLimits: {
          blocks: ['minecraft:netherite_block', 'minecraft:netherite_block', 'bad id'],
          items: ['example:gem', 'example:gem'],
          decorations: ['minecraft:poster'],
        },
      }),
    );
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().locale).toBe('vi');
    expect(preferences.preferences().externalAiContentLimits).toEqual({
      blocks: ['minecraft:netherite_block'],
      items: ['example:gem'],
      decorations: ['minecraft:poster'],
    });
    preferences.setExternalAiContentLimits({
      blocks: ['minecraft:dragon_egg'],
      items: [],
      decorations: [],
    });
    expect(new UiPreferencesService().preferences().externalAiContentLimits).toEqual({
      blocks: ['minecraft:dragon_egg'],
      items: [],
      decorations: [],
    });
    preferences.resetExternalAiContentLimits();
    expect(preferences.preferences().externalAiContentLimits).toEqual(
      DEFAULT_EXTERNAL_AI_CONTENT_LIMITS,
    );
  });

  it('migrates old max-count rules to ID-only content limits', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        externalAiMaterialPolicyEnabled: true,
        externalAiMaterialRules: [
          { targetId: 'minecraft:netherite_block', maxCount: 4 },
          { category: 'items', targetId: 'missing:item', maxCount: 2 },
        ],
      }),
    );
    expect(new UiPreferencesService().preferences().externalAiContentLimits).toEqual({
      blocks: ['minecraft:netherite_block'],
      items: ['missing:item'],
      decorations: [],
    });
    expect(new UiPreferencesService().preferences().externalAiContentLimitsEnabled).toBe(true);
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
    expect(saved.externalAiContentLimits).toEqual({
      blocks: ['minecraft:netherite_block'],
      items: ['missing:item'],
      decorations: [],
    });
    expect(saved.externalAiMaterialRules).toBeUndefined();
  });
});
