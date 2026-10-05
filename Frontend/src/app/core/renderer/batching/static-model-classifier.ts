import * as THREE from 'three';
import { compileInstanceTemplates, type CompiledInstanceTemplates, type InstancePartTemplate } from './instance-template-cache';

export type StaticModelClassificationKind =
  | 'batchable-opaque'
  | 'batchable-transparent-safe'
  | 'unique-dynamic'
  | 'fluid'
  | 'special-unsafe'
  | 'skinned'
  | 'morph'
  | 'unsupported-material'
  | 'material-array'
  | 'depth-write'
  | 'transparent'
  | 'no-mesh';

export interface StaticModelClassification {
  readonly kind: StaticModelClassificationKind;
  readonly reason?: string;
  readonly templates?: readonly InstancePartTemplate[];
  readonly compiled?: CompiledInstanceTemplates;
}

/**
 * Converts one provider object into a reusable, root-relative presentation
 * template. This module deliberately knows nothing about projects or scenes.
 */
export function classifyStaticModel(object: THREE.Object3D, instrumentation?: Parameters<typeof compileInstanceTemplates>[1]): StaticModelClassification {
  if (object.userData['fluidKind'] || object.userData['fluidRenderLayer']) return { kind: 'fluid', reason: 'fluid-render-layer' };
  if (object.userData['specialVisualFamily'] && object.userData['staticBatchable'] !== true) return { kind: 'special-unsafe', reason: 'special-visual-without-static-proof' };

  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const templates: InstancePartTemplate[] = [];
  let rejection: StaticModelClassification | undefined;
  object.traverse((child) => {
    if (rejection || !(child instanceof THREE.Mesh)) return;
    if (child.userData['fluidKind'] || child.userData['fluidRenderLayer']) { rejection = { kind: 'fluid', reason: 'child-fluid-render-layer' }; return; }
    if (child.userData['specialVisualFamily'] && child.userData['staticBatchable'] !== true) { rejection = { kind: 'special-unsafe', reason: 'child-special-visual-without-static-proof' }; return; }
    if (child.morphTargetInfluences) { rejection = { kind: 'morph', reason: 'morph-targets' }; return; }
    if (child.type === 'SkinnedMesh') { rejection = { kind: 'skinned', reason: 'skinned-mesh' }; return; }
    if (Array.isArray(child.material)) { rejection = { kind: 'material-array', reason: 'material-array' }; return; }
    const material = child.material;
    if (!material || typeof material.clone !== 'function') { rejection = { kind: 'unsupported-material', reason: 'unsupported-material' }; return; }
    const candidate = material as THREE.Material & { alphaTest?: number; opacity?: number; transparent?: boolean; depthWrite?: boolean };
    if (material.userData['minecraftForceTranslucent'] || candidate.transparent && !isSafeCutout(candidate)) { rejection = { kind: 'transparent', reason: 'blended-transparency' }; return; }
    if (candidate.depthWrite === false) { rejection = { kind: 'depth-write', reason: 'depth-write-disabled' }; return; }
    templates.push({ geometry: ownedGeometry(child.geometry), material, matrix: rootInverse.clone().multiply(child.matrixWorld), ownsGeometry: !child.geometry.userData['providerOwnedGeometry'] });
  });
  if (rejection) {
    disposeOwnedTemplates(templates);
    return rejection;
  }
  if (!templates.length) return { kind: 'no-mesh', reason: 'no-mesh-descendants' };
  const compiled = compileInstanceTemplates(templates, instrumentation, true);
  const retainedGeometry = new Set(compiled.templates.map((template) => template.geometry));
  for (const template of templates) if (template.ownsGeometry && !retainedGeometry.has(template.geometry)) template.geometry.dispose();
  return { kind: compiled.templates.some((template) => isSafeCutout(template.material)) ? 'batchable-transparent-safe' : 'batchable-opaque', templates, compiled };
}

function isSafeCutout(material: THREE.Material & { alphaTest?: number; opacity?: number; transparent?: boolean; depthWrite?: boolean }): boolean {
  return (material.alphaTest ?? 0) > 0 && (material.opacity ?? 1) >= 1 && material.depthWrite !== false && !material.userData['minecraftForceTranslucent'];
}

function ownedGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.userData['providerOwnedGeometry'] ? geometry : geometry.clone();
}

function disposeOwnedTemplates(templates: readonly InstancePartTemplate[]): void {
  for (const template of templates) if (template.ownsGeometry) template.geometry.dispose();
}
