import * as THREE from 'three';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import { unitVoxelEnvelope } from './render-chunk-geometry';

export interface InstancePartTemplate {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly matrix: THREE.Matrix4;
  readonly ownsGeometry?: boolean;
}

export interface CompiledInstanceTemplates {
  readonly templates: readonly InstancePartTemplate[];
  readonly signature: string;
  readonly envelope: THREE.Box3;
}

/** Compiles reusable visual parts without knowing anything about a project or scene. */
export function compileInstanceTemplates(
  templates: readonly InstancePartTemplate[],
  instrumentation?: RendererDiagnostics,
  cloneMaterials = false,
): CompiledInstanceTemplates {
  const retained = templates.map((template) => ({
    geometry: template.geometry,
    material: cloneMaterials ? template.material.clone() : template.material,
    matrix: template.matrix.clone(),
    ownsGeometry: template.ownsGeometry,
  }));
  const merged = mergeInstanceTemplateParts(retained);
  if (instrumentation) {
    instrumentation.record('rawInstanceTemplateParts', templates.length);
    instrumentation.record('mergedInstanceTemplateParts', merged.length);
    instrumentation.record(
      'templateMergeOperations',
      merged.filter((template) => template.ownsGeometry).length,
    );
    instrumentation.record(
      'templatePartsEliminated',
      Math.max(0, templates.length - merged.length),
    );
  }
  const signature = merged
    .map((template) => {
      const material = template.material as THREE.Material & {
        map?: THREE.Texture;
        color?: THREE.Color;
        alphaTest?: number;
        side?: number;
        vertexColors?: boolean;
      };
      return `${template.geometry.uuid}|${material.type}|${material.map?.uuid ?? ''}|${material.color?.getHexString() ?? ''}|${material.alphaTest ?? 0}|${material.side ?? 0}|${material.vertexColors ? 1 : 0}|${template.matrix.elements.map((value) => value.toFixed(4)).join(',')}`;
    })
    .join(';');
  return { templates: merged, signature, envelope: instanceTemplateEnvelope(merged) };
}

export function mergeInstanceTemplateParts(
  templates: readonly InstancePartTemplate[],
): readonly InstancePartTemplate[] {
  const groups = new Map<string, InstancePartTemplate[]>();
  for (const template of templates) {
    const key = `${instanceMaterialCompatibilityKey(template.material)}|${instanceGeometryCompatibilityKey(template.geometry)}`;
    const group = groups.get(key) ?? [];
    group.push(template);
    groups.set(key, group);
  }
  const merged: InstancePartTemplate[] = [];
  for (const group of groups.values()) {
    const material = group[0].material as THREE.Material & {
      transparent?: boolean;
      depthWrite?: boolean;
    };
    if (
      group.length === 1 ||
      material.transparent ||
      material.depthWrite === false ||
      group.some((template) => Object.keys(template.geometry.morphAttributes).length > 0)
    ) {
      merged.push(group[0]);
      if (group.length > 1) merged.push(...group.slice(1));
      continue;
    }
    const geometry = mergeTransformedGeometries(group);
    if (!geometry) {
      merged.push(...group);
      continue;
    }
    geometry.userData['mergedInstanceTemplateGeometry'] = true;
    merged.push({
      geometry,
      material: group[0].material,
      matrix: new THREE.Matrix4(),
      ownsGeometry: true,
    });
  }
  return merged;
}

export function instanceTemplateEnvelope(templates: readonly InstancePartTemplate[]): THREE.Box3 {
  const envelope = new THREE.Box3();
  for (const template of templates) {
    template.geometry.computeBoundingBox();
    if (template.geometry.boundingBox)
      envelope.union(template.geometry.boundingBox.clone().applyMatrix4(template.matrix));
  }
  return envelope.isEmpty() ? unitVoxelEnvelope() : envelope;
}

export function instanceMaterialCompatibilityKey(material: THREE.Material): string {
  const candidate = material as THREE.Material & {
    map?: THREE.Texture;
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    alphaTest?: number;
    side?: number;
    vertexColors?: boolean;
    flatShading?: boolean;
    transparent?: boolean;
    depthWrite?: boolean;
    depthTest?: boolean;
    blending?: number;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
    opacity?: number;
  };
  const map = candidate.map;
  return [
    candidate.type,
    map?.uuid ?? '',
    map?.offset.x ?? 0,
    map?.offset.y ?? 0,
    map?.repeat.x ?? 1,
    map?.repeat.y ?? 1,
    map?.rotation ?? 0,
    map?.center.x ?? 0,
    map?.center.y ?? 0,
    map?.wrapS ?? 1000,
    map?.wrapT ?? 1000,
    map?.flipY ? 1 : 0,
    map?.colorSpace ?? '',
    candidate.color?.getHexString() ?? '',
    candidate.emissive?.getHexString() ?? '',
    candidate.emissiveIntensity ?? 0,
    candidate.opacity ?? 1,
    candidate.alphaTest ?? 0,
    candidate.side ?? 0,
    candidate.vertexColors ? 1 : 0,
    candidate.flatShading ? 1 : 0,
    candidate.transparent ? 1 : 0,
    candidate.depthWrite ? 1 : 0,
    candidate.depthTest ? 1 : 0,
    candidate.blending ?? 0,
    candidate.polygonOffset ? 1 : 0,
    candidate.polygonOffsetFactor ?? 0,
    candidate.polygonOffsetUnits ?? 0,
  ].join('|');
}

export function instanceGeometryCompatibilityKey(geometry: THREE.BufferGeometry): string {
  if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length)
    return 'morph-unsupported';
  const attributes = Object.entries(geometry.attributes).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `${geometry.index ? 'indexed' : 'non-indexed'}|${attributes.map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute instanceof THREE.InterleavedBufferAttribute ? 'interleaved' : attribute.array.constructor.name}`).join(',')}`;
}

function mergeTransformedGeometries(
  templates: readonly InstancePartTemplate[],
): THREE.BufferGeometry | undefined {
  const prepared: THREE.BufferGeometry[] = [];
  try {
    for (const template of templates) {
      const transformed = template.geometry.clone().applyMatrix4(template.matrix);
      const nonIndexed = transformed.index ? transformed.toNonIndexed() : transformed;
      if (nonIndexed !== transformed) transformed.dispose();
      if (
        Object.values(nonIndexed.attributes).some(
          (attribute) => attribute instanceof THREE.InterleavedBufferAttribute,
        )
      ) {
        nonIndexed.dispose();
        return undefined;
      }
      prepared.push(nonIndexed);
    }
    const firstAttributes = Object.entries(prepared[0]?.attributes ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    if (
      !firstAttributes.length ||
      prepared.some((geometry) => {
        const attributes = Object.entries(geometry.attributes).sort(([left], [right]) =>
          left.localeCompare(right),
        );
        return (
          attributes.length !== firstAttributes.length ||
          attributes.some(([name, attribute], index) => {
            const [firstName, firstAttribute] = firstAttributes[index];
            return (
              name !== firstName ||
              attribute.itemSize !== firstAttribute.itemSize ||
              attribute.normalized !== firstAttribute.normalized ||
              attribute.array.constructor !== firstAttribute.array.constructor
            );
          })
        );
      })
    )
      return undefined;
    const merged = new THREE.BufferGeometry();
    for (const [name, firstAttribute] of firstAttributes) {
      const totalLength = prepared.reduce(
        (sum, geometry) => sum + geometry.attributes[name].array.length,
        0,
      );
      const values = newTypedArray(firstAttribute.array, totalLength);
      let offset = 0;
      for (const geometry of prepared) {
        const attribute = geometry.attributes[name];
        values.set(attribute.array, offset);
        offset += attribute.array.length;
      }
      merged.setAttribute(
        name,
        new THREE.BufferAttribute(values, firstAttribute.itemSize, firstAttribute.normalized),
      );
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  } finally {
    for (const geometry of prepared) geometry.dispose();
  }
}

function newTypedArray(source: THREE.TypedArray, length: number): THREE.TypedArray {
  const Constructor = source.constructor as THREE.TypedArrayConstructor;
  return new Constructor(length);
}
