import * as THREE from 'three';

/** Internal material metadata used to keep brightness changes reversible. */
const BASE_COLOR_KEY = 'minecraftBuilderBrightnessBaseColor';
export const STRUCTURE_GUIDE_BRIGHTNESS = 18;

export function blockBrightnessMaterialFactor(value: number): number {
  return brightnessMaterialFactor(value, 10);
}

/** The guide uses a separate semantic scale and intentionally is not clamped to the user setting. */
export function structureGuideBrightnessMaterialFactor(
  value: number = STRUCTURE_GUIDE_BRIGHTNESS,
): number {
  return brightnessMaterialFactor(value, 20);
}

function brightnessMaterialFactor(value: number, maximum: number): number {
  const level = Number.isFinite(value) ? Math.min(maximum, Math.max(0, Math.round(value))) : 3;
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
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((channel) => typeof channel !== 'number' || !Number.isFinite(channel))
  )
    return undefined;
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
  const base = storedBaseColor(material) ?? ([color.r, color.g, color.b] satisfies StoredColor);
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

/**
 * Creates guide-owned materials without taking ownership of provider textures or geometry.
 * Lambert materials are represented as Basic materials here so the guide is not dependent on
 * the scene lights. Other material families retain their type and receive the closest native
 * self-lit treatment available.
 */
function structureGuideMaterial(material: THREE.Material, brightness: number): THREE.Material {
  const source = material as ColorMaterial;
  const sourceColor = materialColor(source)?.clone();
  let clone: THREE.Material;
  if (material instanceof THREE.MeshLambertMaterial) {
    clone = new THREE.MeshBasicMaterial({
      map: material.map ?? undefined,
      color: sourceColor ?? 0xffffff,
      transparent: material.transparent,
      opacity: material.opacity,
      alphaTest: material.alphaTest,
      side: material.side,
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
      vertexColors: material.vertexColors,
      fog: material.fog,
      wireframe: material.wireframe,
      wireframeLinewidth: material.wireframeLinewidth,
      toneMapped: false,
    });
  } else {
    clone = material.clone();
    if (clone instanceof THREE.MeshBasicMaterial) clone.toneMapped = false;
  }
  clone.name = `${material.name || material.type}:structure-guide`;
  const guideUserData = { ...material.userData };
  delete guideUserData['sharedFallbackMaterial'];
  delete guideUserData['sharedPlaceholderMaterial'];
  clone.userData = { ...guideUserData, structureGuideOwnedMaterial: true };

  const cloneColor = materialColor(clone as ColorMaterial);
  if (!cloneColor || !sourceColor) return clone;
  const factor = structureGuideBrightnessMaterialFactor(brightness);
  if (clone instanceof THREE.MeshStandardMaterial) {
    clone.emissive.copy(sourceColor);
    clone.emissiveIntensity = Math.max(0.5, factor - 0.5);
    clone.color.copy(sourceColor);
  } else {
    cloneColor.setRGB(sourceColor.r * factor, sourceColor.g * factor, sourceColor.b * factor);
  }
  setBlockBrightnessBaseColor(clone as ColorMaterial, sourceColor);
  return clone;
}

/** Applies the independent Structure Block guide brightness once to a newly-created visual. */
export function applyStructureGuideBrightnessToObject(
  root: THREE.Object3D,
  brightness: number = STRUCTURE_GUIDE_BRIGHTNESS,
): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const guideMaterials = materials.map((material) =>
      structureGuideMaterial(material, brightness),
    );
    object.material = Array.isArray(object.material) ? guideMaterials : guideMaterials[0];
  });
}

export const blockBrightnessMetadataKey = BASE_COLOR_KEY;
