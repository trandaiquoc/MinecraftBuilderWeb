import * as THREE from 'three';

export type BlockRenderRole = 'normal' | 'reference';

/** Applies normal/reference material presentation while retaining each mesh's base materials. */
export function applyBlockRenderRole(
  object: THREE.Object3D,
  role: BlockRenderRole,
  opacity: number,
): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const originals = Array.isArray(child.material) ? child.material : [child.material];
    if (child.userData['blockRoleOriginalMaterials'] === undefined)
      child.userData['blockRoleOriginalMaterials'] = originals;
    const materials = originals.map((material) => {
      if (material.userData['blockRoleMaterial'] === true) return material;
      const presentation = material.clone();
      presentation.userData['blockRoleMaterial'] = true;
      presentation.userData['blockRoleBaseTransparent'] = material.transparent;
      presentation.userData['blockRoleBaseOpacity'] = material.opacity;
      presentation.userData['blockRoleBaseDepthWrite'] = material.depthWrite;
      return presentation;
    });
    child.material = Array.isArray(child.material) ? materials : materials[0];
    for (const material of materials) {
      const transparent =
        role === 'reference' || material.userData['blockRoleBaseTransparent'] === true;
      const nextOpacity =
        role === 'reference' ? opacity : Number(material.userData['blockRoleBaseOpacity'] ?? 1);
      const nextDepthWrite = Boolean(material.userData['blockRoleBaseDepthWrite'] ?? true);
      if (material.transparent !== transparent) material.transparent = transparent;
      material.opacity = nextOpacity;
      material.depthWrite = nextDepthWrite;
      material.needsUpdate = true;
    }
  });
}
