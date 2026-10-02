import { afterEach, describe, expect, it } from 'vitest';
import { blockBrightnessStopPercent, UiPreferencesService } from './ui-preferences.service';
import { DEFAULT_EXTERNAL_AI_MATERIAL_RULES } from '../../persistence/structure-json/external-ai-material-policy';

const key = 'minecraft-builder.ui-preferences';
const legacyKey = 'minecraft-builder.editor-layout';

describe('UiPreferencesService', () => {
  afterEach(() => {
    localStorage.removeItem(key);
    localStorage.removeItem(legacyKey);
  });

  it('uses safe defaults and persists updates', () => {
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().locale).toBe('en');
    expect(preferences.preferences().autoUseHugeStructureBlocks).toBe(false);
    expect(preferences.preferences().showStructureBlockGuide).toBe(true);
    expect(preferences.preferences().accessibility.blockBrightness).toBe(3);
    expect(preferences.preferences().appearance.font).toBe('geist');
    expect(preferences.preferences().controls.zoomSensitivity).toBe(2);
    expect(preferences.preferences().controls.cameraMoveSpeed).toBe(15);
    expect(preferences.preferences().controls.verticalMoveSpeed).toBe(9);
    preferences.setAppearance({ preset: 'craft', base: 'dark' });
    preferences.setAppearance({ editorBackground: 'light' });
    preferences.setLocale('vi');
    expect(preferences.preferences().appearance.editorBackground).toBe('light');
    expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ locale: 'vi', appearance: { preset: 'craft', editorBackground: 'light' } });
  });

  it('migrates and normalizes block brightness without changing other preferences', () => {
    localStorage.setItem(key, JSON.stringify({ locale: 'vi', appearance: { preset: 'light' } }));
    expect(new UiPreferencesService().preferences().accessibility.blockBrightness).toBe(3);
    localStorage.setItem(key, JSON.stringify({ locale: 'vi', appearance: { preset: 'light' }, accessibility: { blockBrightness: 7.6 } }));
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
    expect(preferences.preferences().layout).toMatchObject({ leftSidebarWidth: 340, rightSidebarWidth: 300 });
    localStorage.setItem(key, JSON.stringify({ layout: { leftSidebarWidth: 20, rightSidebarWidth: 900 } }));
    expect(new UiPreferencesService().preferences().layout).toMatchObject({ leftSidebarWidth: 180, rightSidebarWidth: 520 });
  });

  it('migrates the legacy layout key', () => {
    localStorage.setItem(legacyKey, JSON.stringify({ leftSidebarVisible: false }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().layout.leftSidebarVisible).toBe(false);
    expect(preferences.preferences().layout.rightSidebarVisible).toBe(true);
  });

  it('persists and safely normalizes Structure NBT export defaults without storing project paths', () => {
    localStorage.setItem(key, JSON.stringify({ structureExport: { namespace: 'example_mod', archiveName: 'shared-pack', description: 'Shared export' } }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().structureExport).toEqual({ namespace: 'example_mod', archiveName: 'shared-pack', description: 'Shared export' });
    preferences.setStructureExport({ namespace: 'minecraftbuilder' });
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').structureExport).toMatchObject({ namespace: 'minecraftbuilder', archiveName: 'shared-pack' });
    localStorage.setItem(key, JSON.stringify({ structureExport: { namespace: 4, archiveName: null, description: false } }));
    expect(new UiPreferencesService().preferences().structureExport).toEqual({ namespace: 'minecraftbuilder', archiveName: '', description: '' });
  });

  it('normalizes corrupt enum and numeric values', () => {
    localStorage.setItem(key, JSON.stringify({ locale: 'fr', appearance: { preset: 'neon', font: 'comic' }, controls: { orbitSensitivity: 99, clickDragThreshold: -2 } }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().locale).toBe('en');
    expect(preferences.preferences().appearance.preset).toBe('craft');
    expect(preferences.preferences().appearance.font).toBe('geist');
    expect(preferences.preferences().controls.orbitSensitivity).toBe(3);
    expect(preferences.preferences().controls.clickDragThreshold).toBe(1);
  });

  it('keeps font choice independent from theme and restores an explicit Minecraft font', () => {
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().appearance.font).toBe('geist');
    preferences.setAppearance({ preset: 'light' });
    expect(preferences.preferences().appearance.font).toBe('geist');
    preferences.setAppearance({ font: 'minecraft-style' });
    preferences.setAppearance({ preset: 'craft' });
    expect(preferences.preferences().appearance.font).toBe('minecraft-style');
    expect(new UiPreferencesService().preferences().appearance.font).toBe('minecraft-style');
  });

  it('keeps saved control values while reset restores the new defaults', () => {
    localStorage.setItem(key, JSON.stringify({ controls: { zoomSensitivity: 1.4, cameraMoveSpeed: 6, verticalMoveSpeed: 12 } }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().controls).toMatchObject({ zoomSensitivity: 1.4, cameraMoveSpeed: 6, verticalMoveSpeed: 12 });
    preferences.reset();
    expect(preferences.preferences().controls).toMatchObject({ zoomSensitivity: 2, cameraMoveSpeed: 15, verticalMoveSpeed: 9 });
  });

  it('migrates a missing font size to normal without resetting appearance', () => {
    localStorage.setItem(key, JSON.stringify({ appearance: { preset: 'light', font: 'geist' } }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().appearance.fontSize).toBe('normal');
    expect(preferences.preferences().appearance.preset).toBe('light');
    preferences.setAppearance({ fontSize: 'large' });
    expect(new UiPreferencesService().preferences().appearance.fontSize).toBe('large');
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

  it('seeds exactly the rare material defaults only when the field is missing', () => {
    localStorage.setItem(key, JSON.stringify({ locale: 'vi' }));
    expect(new UiPreferencesService().preferences().externalAiMaterialRules).toEqual(DEFAULT_EXTERNAL_AI_MATERIAL_RULES);
    localStorage.setItem(key, JSON.stringify({ externalAiMaterialRules: [] }));
    expect(new UiPreferencesService().preferences().externalAiMaterialRules).toEqual([]);
  });

  it('keeps the external AI material policy disabled by default and preserves an explicit toggle', () => {
    expect(new UiPreferencesService().preferences().externalAiMaterialPolicyEnabled).toBe(false);
    localStorage.setItem(key, JSON.stringify({ externalAiMaterialPolicyEnabled: true, externalAiMaterialRules: [] }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().externalAiMaterialPolicyEnabled).toBe(true);
    preferences.setExternalAiMaterialPolicyEnabled(false);
    expect(new UiPreferencesService().preferences().externalAiMaterialPolicyEnabled).toBe(false);
    preferences.setExternalAiMaterialPolicyEnabled(true);
    preferences.resetExternalAiMaterialRules();
    expect(preferences.preferences().externalAiMaterialPolicyEnabled).toBe(true);
    preferences.reset();
    expect(preferences.preferences().externalAiMaterialPolicyEnabled).toBe(false);
  });

  it('normalizes, deduplicates and persists material rules without resetting unrelated preferences', () => {
    localStorage.setItem(key, JSON.stringify({ locale: 'vi', externalAiMaterialRules: [
      { targetId: 'minecraft:netherite_block', maxCount: 8 },
      { targetId: 'minecraft:netherite_block', maxCount: 4 },
      { targetId: 'minecraft:ancient_debris', maxCount: -1 },
      { targetId: 'minecraft:dragon_egg', maxCount: 0.5 },
      { targetId: 'bad id', maxCount: 1 },
    ] }));
    const preferences = new UiPreferencesService();
    expect(preferences.preferences().locale).toBe('vi');
    expect(preferences.preferences().externalAiMaterialRules).toEqual([{ targetId: 'minecraft:netherite_block', maxCount: 4 }]);
    preferences.setExternalAiMaterialRules([{ targetId: 'minecraft:dragon_egg', maxCount: 0 }]);
    expect(new UiPreferencesService().preferences().externalAiMaterialRules).toEqual([{ targetId: 'minecraft:dragon_egg', maxCount: 0 }]);
    preferences.resetExternalAiMaterialRules();
    expect(preferences.preferences().externalAiMaterialRules).toEqual(DEFAULT_EXTERNAL_AI_MATERIAL_RULES);
  });

  it('preserves unavailable item and decoration policy entries as configuration', () => {
    localStorage.setItem(key, JSON.stringify({ externalAiMaterialRules: [
      { category: 'items', targetId: 'missing:item', maxCount: 2 },
      { category: 'decorations', targetId: 'missing:painting', maxCount: 1 },
    ] }));
    expect(new UiPreferencesService().preferences().externalAiMaterialRules).toEqual([
      { category: 'decorations', targetId: 'missing:painting', maxCount: 1 },
      { category: 'items', targetId: 'missing:item', maxCount: 2 },
    ]);
  });
});
