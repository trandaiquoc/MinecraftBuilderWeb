import * as THREE from 'three';

/** Internal material metadata used to keep brightness changes reversible. */
const BASE_COLOR_KEY = 'minecraftBuilderBrightnessBaseColor';

export function blockBrightnessMaterialFactor(value: number): number {
  const level = Number.isFinite(value) ? Math.min(10, Math.max(0, Math.round(value))) : 3;
  if (level <= 3) return 0.55 + (level / 3) * 0.45;
  return 1 + ((level - 3) / 7) * 0.45;
}

type ColorMaterial = THREE.Material & { color?: THREE.Color };
type StoredColor = readonly [number, number, number];

function materialColor(material: ColorMaterial): THREE.Color | undefined {
  return material.color instanceof THREE.Color ? material.color : undefined;
}

function storedBaseColor(material: ColorMaterial): StoredColor | undefined {
  const value = material.userData[BASE_COLOR_KEY] as unknown;
  if (!Array.isArray(value) || value.length !== 3 || value.some((channel) => typeof channel !== 'number' || !Number.isFinite(channel))) return undefined;
  return [value[0], value[1], value[2]];
}

/** Sets the unmodified color used as the source for future brightness updates. */
export function setBlockBrightnessBaseColor(material: ColorMaterial, color?: THREE.Color): void {
  const current = color ?? materialColor(material);
  if (!current) return;
  material.userData[BASE_COLOR_KEY] = [current.r, current.g, current.b] satisfies StoredColor;
}

/** Applies brightness to one material without changing its map/transparency/shading flags. */
export function applyBlockBrightnessToMaterial(material: ColorMaterial, value: number): void {
  const color = materialColor(material);
  if (!color) return;
  const base = storedBaseColor(material) ?? [color.r, color.g, color.b] satisfies StoredColor;
  material.userData[BASE_COLOR_KEY] = base;
  const factor = blockBrightnessMaterialFactor(value);
  color.setRGB(base[0] * factor, base[1] * factor, base[2] * factor);
}

/** Applies the same policy to every mesh material in a block-world visual tree. */
export function applyBlockBrightnessToObject(root: THREE.Object3D, value: number): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) applyBlockBrightnessToMaterial(material, value);
  });
}

export const blockBrightnessMetadataKey = BASE_COLOR_KEY;
