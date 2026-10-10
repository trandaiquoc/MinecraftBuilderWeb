import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { compileInstanceTemplates, type InstancePartTemplate } from './instance-template-cache';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';

describe('instance template cache', () => {
  it('merges six compatible cube face parts into one template without losing geometry attributes', () => {
    const material = new THREE.MeshBasicMaterial({ color: 0x8f6b3f });
    const templates = cubeFaceTemplates([
      material,
      material,
      material,
      material,
      material,
      material,
    ]);
    const diagnostics = new RendererDiagnostics();
    const compiled = compileInstanceTemplates(templates, diagnostics);
    expect(compiled.templates).toHaveLength(1);
    expect(diagnostics.snapshot()).toMatchObject({
      rawInstanceTemplateParts: 6,
      mergedInstanceTemplateParts: 1,
      templateMergeOperations: 1,
      templatePartsEliminated: 5,
    });
    const geometry = compiled.templates[0].geometry;
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.x).toBeCloseTo(0);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0);
    expect(geometry.boundingBox?.min.z).toBeCloseTo(0);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(1);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(1);
    expect(geometry.boundingBox?.max.z).toBeCloseTo(1);
    expect(geometry.getAttribute('position').count).toBe(36);
    expect(geometry.getAttribute('normal')).toBeDefined();
    expect(geometry.getAttribute('uv')).toBeDefined();
    disposeTemplateFixture(templates, compiled.templates, material);
  });

  it('keeps three compatible material groups separate while merging within each group', () => {
    const materials = [
      new THREE.MeshBasicMaterial({ color: 0x8f6b3f }),
      new THREE.MeshBasicMaterial({ color: 0x4f8f38 }),
      new THREE.MeshBasicMaterial({ color: 0xd8d0b8 }),
    ];
    const compiled = compileInstanceTemplates(
      cubeFaceTemplates([
        materials[0],
        materials[1],
        materials[2],
        materials[0],
        materials[1],
        materials[2],
      ]),
    );
    expect(compiled.templates).toHaveLength(3);
    expect(compiled.templates.every((template) => template.ownsGeometry)).toBe(true);
    disposeTemplateFixture([], compiled.templates, ...materials);
  });

  it('does not merge transparent or depth-disabled material groups with opaque parts', () => {
    const opaque = new THREE.MeshBasicMaterial({ color: 0x8f6b3f });
    const transparent = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
    });
    const compiled = compileInstanceTemplates(
      cubeFaceTemplates([opaque, opaque, opaque, opaque, opaque, transparent]),
    );
    expect(compiled.templates).toHaveLength(2);
    disposeTemplateFixture([], compiled.templates, opaque, transparent);
  });
});

function cubeFaceTemplates(materials: readonly THREE.Material[]): readonly InstancePartTemplate[] {
  const transforms = [
    new THREE.Matrix4().setPosition(0.5, 0.5, 1),
    new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0.5, 0.5, 0),
    new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0.5, 1, 0.5),
    new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0.5, 0, 0.5),
    new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(1, 0.5, 0.5),
    new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(0, 0.5, 0.5),
  ];
  return transforms.map((matrix, index) => ({
    geometry: new THREE.PlaneGeometry(1, 1),
    material: materials[index],
    matrix,
  }));
}

function disposeTemplateFixture(
  raw: readonly InstancePartTemplate[],
  compiled: readonly InstancePartTemplate[],
  ...materials: readonly THREE.Material[]
): void {
  for (const geometry of new Set([...raw, ...compiled].map((template) => template.geometry)))
    geometry.dispose();
  for (const material of new Set(materials)) material.dispose();
}
