import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { ChunkSurfaceRenderer } from './chunk-surface-renderer';

describe('chunk surface renderer ownership', () => {
  it('compiles a 100k solid shape into material-bucket meshes rather than face instances', () => {
    const group = new THREE.Group();
    const counters = new Map<string, number>();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: (name, delta = 1) => counters.set(name, (counters.get(name) ?? 0) + delta) });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const blocks: PlacedBlock[] = [];
    for (let y = 0; y < 10; y += 1) for (let z = 0; z < 100; z += 1) for (let x = 0; x < 100; x += 1) blocks.push({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} });
    const entries = blocks.map((block) => ({ block, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const }));
    renderer.syncOccupancy(entries, blocks.map((block) => block.position), true);
    for (const block of blocks) renderer.upsert({ key: voxelKey(block.position), block, templates });
    renderer.flushNow();
    const evidence = renderer.evidence();
    expect(evidence.terrainLogicalBlocks).toBe(100_000);
    expect(evidence.terrainChunks).toBe(49);
    expect(evidence.terrainChunkMeshes).toBe(49);
    expect(evidence.terrainFacesEmitted).toBe(24_000);
    expect(evidence.terrainFacesCulled).toBe(576_000);
    expect([...group.children].every((child) => child instanceof THREE.Mesh && child.frustumCulled)).toBe(true);
    expect(counters.get('terrainTemplateResolutions') ?? 0).toBe(0);
    renderer.clear(); material.dispose(); for (const template of templates) template.geometry.dispose();
  });

  it('rebuilds only the affected chunk after a local change', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = (position: VoxelCoordinate): PlacedBlock => ({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position, state: {} });
    const first = [block({ x: 0, y: 0, z: 0 }), block({ x: 16, y: 0, z: 0 })];
    const entries = first.map((value) => ({ block: value, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const }));
    renderer.syncOccupancy(entries, first.map((value) => value.position), true);
    for (const value of first) renderer.upsert({ key: voxelKey(value.position), block: value, templates });
    renderer.flushNow();
    const firstMesh = group.children.find((child) => child.userData['terrainChunk'] === '0,0,0');
    const secondMesh = group.children.find((child) => child.userData['terrainChunk'] === '1,0,0');
    const secondGeometryDispose = vi.spyOn((secondMesh as THREE.Mesh).geometry, 'dispose');
    const beforeRebuilds = renderer.evidence().terrainChunkRebuilds;
    const changed = block({ x: 17, y: 0, z: 1 });
    renderer.upsert({ key: voxelKey(changed.position), block: changed, templates });
    renderer.syncOccupancy([...entries, { block: changed, role: 'normal', occlusionClass: 'opaque-full-cube' }], [changed.position]);
    renderer.flushNow();
    expect(group.children.find((child) => child.userData['terrainChunk'] === '0,0,0')).toBe(firstMesh);
    expect(group.children.find((child) => child.userData['terrainChunk'] === '1,0,0')).not.toBe(secondMesh);
    expect(secondGeometryDispose).toHaveBeenCalledTimes(1);
    expect(renderer.evidence().terrainChunkRebuilds - beforeRebuilds).toBe(1);
    renderer.clear(); material.dispose(); for (const template of templates) template.geometry.dispose();
  });
});

function voxelKey(position: VoxelCoordinate): string { return `${position.x},${position.y},${position.z}`; }

function cubeTemplates(material: THREE.Material): readonly SurfaceFaceTemplate[] {
  return (['north', 'south', 'east', 'west', 'up', 'down'] as const).map((direction) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    return { geometry, material, direction, matrix: new THREE.Matrix4() };
  });
}
