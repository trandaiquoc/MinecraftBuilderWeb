export type ViewportThemeMode = 'light' | 'dark' | 'reality';

export interface ViewportThemePalette {
  background: number;
  grid: number;
  editingGrid: number;
  bounds: number;
  block: number;
  missingBlock: number;
  referenceBlock: number;
  selection: number;
  group: number;
  lockedGroup: number;
  valid: number;
  invalid: number;
  warning: number;
  unknown: number;
}

const darkPalette: ViewportThemePalette = {
  background: 0x0c1015,
  grid: 0x344252,
  editingGrid: 0x6d7f95,
  bounds: 0x7b8da3,
  block: 0x7896b4,
  missingBlock: 0x8a657b,
  referenceBlock: 0x5f7188,
  selection: 0xffd166,
  group: 0x4be0ff,
  lockedGroup: 0xff8c42,
  valid: 0x59d98e,
  invalid: 0xff526b,
  warning: 0xffc857,
  unknown: 0xc2a5ff,
};

const lightPalette: ViewportThemePalette = {
  background: 0xf4f7fb,
  grid: 0xaab8c7,
  editingGrid: 0x60758b,
  bounds: 0x334155,
  block: 0x52779d,
  missingBlock: 0x87556f,
  referenceBlock: 0x71849a,
  selection: 0xb56f00,
  group: 0x007d9e,
  lockedGroup: 0xb34d00,
  valid: 0x16824b,
  invalid: 0xc52d45,
  warning: 0xa66000,
  unknown: 0x6546a3,
};

const realityPalette: ViewportThemePalette = {
  background: 0x8bc8e7,
  grid: 0x536b3a,
  editingGrid: 0x263d31,
  bounds: 0xf5e9a8,
  block: 0x395d46,
  missingBlock: 0x9a4a59,
  referenceBlock: 0x657f87,
  selection: 0xf47b20,
  group: 0x2578ac,
  lockedGroup: 0x914414,
  valid: 0x176a3d,
  invalid: 0xb52032,
  warning: 0x7e4c07,
  unknown: 0x64459d,
};

export function viewportThemePalette(mode: ViewportThemeMode): ViewportThemePalette {
  if (mode === 'reality') return realityPalette;
  return mode === 'light' ? lightPalette : darkPalette;
}
