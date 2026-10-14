export type EditorBackgroundMode = 'dark' | 'light' | 'reality';

export const REALITY_GROUND_PRESETS = [
  { id: 'plains-grass', bundled: true },
  { id: 'sand', resource: 'minecraft:block/sand' },
  { id: 'snow', resource: 'minecraft:block/snow' },
  { id: 'netherrack', resource: 'minecraft:block/netherrack' },
  { id: 'warped-nylium', resource: 'minecraft:block/warped_nylium' },
  { id: 'crimson-nylium', resource: 'minecraft:block/crimson_nylium' },
  { id: 'end-stone', resource: 'minecraft:block/end_stone' },
] as const;

export type RealityGroundPreset = (typeof REALITY_GROUND_PRESETS)[number]['id'];

export const REALITY_SKY_PRESETS = ['overworld-day', 'overworld-night', 'nether', 'end'] as const;

export type RealitySkyPreset = (typeof REALITY_SKY_PRESETS)[number];

export const REALITY_SKY_BACKGROUND_COLORS: Readonly<Record<RealitySkyPreset, string>> = {
  'overworld-day': '#8bc8e7',
  'overworld-night': '#101a35',
  nether: '#501629',
  end: '#21152f',
};

export function realitySkyBackgroundColor(preset: RealitySkyPreset): string {
  return REALITY_SKY_BACKGROUND_COLORS[preset];
}

export interface RealityBackgroundPreferences {
  readonly groundPreset: RealityGroundPreset;
  readonly skyPreset: RealitySkyPreset;
}

export const DEFAULT_REALITY_BACKGROUND: RealityBackgroundPreferences = {
  groundPreset: 'plains-grass',
  skyPreset: 'overworld-day',
};

export const BUNDLED_PLAINS_GRASS_TEXTURE = 'assets/editor-backgrounds/plains-grass.png';

export function isEditorBackgroundMode(value: unknown): value is EditorBackgroundMode {
  return value === 'dark' || value === 'light' || value === 'reality';
}

export function isRealityGroundPreset(value: unknown): value is RealityGroundPreset {
  return REALITY_GROUND_PRESETS.some((preset) => preset.id === value);
}

export function isRealitySkyPreset(value: unknown): value is RealitySkyPreset {
  return REALITY_SKY_PRESETS.some((preset) => preset === value);
}
