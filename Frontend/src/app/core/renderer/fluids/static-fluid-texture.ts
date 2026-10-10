import * as THREE from 'three';

/** Returns a nearest-filtered view of animation frame zero without changing the shared cache texture. */
export function staticFluidTextureView(texture: THREE.Texture, metadata?: unknown): THREE.Texture {
  const view = texture.clone();
  const image = view.image as { readonly width?: number; readonly height?: number } | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  const animation = recordValue(recordValue(metadata)['animation']);
  const explicitHeight =
    typeof animation['height'] === 'number' && animation['height'] > 0
      ? animation['height']
      : undefined;
  const frameHeight = explicitHeight ?? (width > 0 && height > width ? width : height);
  const frameIndex =
    Array.isArray(animation['frames']) && animation['frames'].length > 0
      ? frameIndexValue(animation['frames'][0])
      : 0;
  if (height > frameHeight && frameHeight > 0) {
    const frameCount = Math.max(1, Math.floor(height / frameHeight));
    const index = Math.min(Math.max(frameIndex, 0), frameCount - 1);
    view.repeat.set(1, frameHeight / height);
    view.offset.set(0, 1 - ((index + 1) * frameHeight) / height);
    view.wrapS = THREE.ClampToEdgeWrapping;
    view.wrapT = THREE.ClampToEdgeWrapping;
  }
  view.magFilter = THREE.NearestFilter;
  view.minFilter = THREE.NearestFilter;
  view.generateMipmaps = false;
  view.needsUpdate = true;
  return view;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function frameIndexValue(value: unknown): number {
  if (typeof value === 'number') return value;
  const frame = recordValue(value);
  return typeof frame['index'] === 'number' ? frame['index'] : 0;
}
