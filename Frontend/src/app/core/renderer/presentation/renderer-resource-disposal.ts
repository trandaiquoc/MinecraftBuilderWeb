import * as THREE from 'three';

export function disposeObject(object: THREE.Object3D): void {
  (object.userData['ownedDecorationTextureCache'] as { dispose?: () => void } | undefined)?.dispose?.();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.geometry.userData['providerOwnedGeometry'] && !child.geometry.userData['sharedFallbackGeometry'] && !child.geometry.userData['sharedPlaceholderGeometry']) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material.userData['sharedFallbackMaterial'] || material.userData['sharedPlaceholderMaterial']) continue;
      if (material.map?.userData['ownedBedAtlasTexture'] || material.map?.userData['ownedSignTexture']) material.map.dispose();
      material.dispose();
    }
  });
}
