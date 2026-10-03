import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { ChunkSurfaceRenderer } from './chunk-surface-renderer';
import { TerrainTextureAtlas } from './atlas/terrain-texture-atlas';

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
    renderer.bulkUpsert(blocks.map((block) => ({ key: voxelKey(block.position), block, templates })), entries, blocks.map((block) => block.position), { initial: true });
    const evidence = renderer.evidence();
    expect(evidence.terrainLogicalBlocks).toBe(100_000);
    expect(evidence.terrainChunks).toBe(49);
    expect(evidence.terrainChunkMeshes).toBe(49);
    expect(evidence.terrainFacesEmitted).toBe(24_000);
    expect(evidence.terrainFacesCulled).toBe(576_000);
    expect(evidence.terrainChunkRebuilds).toBe(49);
    expect(evidence.terrainBulkBatches).toBe(1);
    expect([...group.children].every((child) => child instanceof THREE.Mesh && child.frustumCulled)).toBe(true);
    expect(counters.get('terrainTemplateResolutions') ?? 0).toBe(0);
    const unrelatedChunk = group.children.find((child) => child.userData['terrainChunk'] === '1,0,0');
    const beforeLocalRebuilds = renderer.evidence().terrainChunkRebuilds;
    const localPosition = { x: 5, y: 0, z: 5 };
    const localBlock = blocks.find((block) => block.position.x === localPosition.x && block.position.y === localPosition.y && block.position.z === localPosition.z)!;
    const edited = { ...localBlock, state: { powered: 'true' } };
    renderer.applyBlockChanges([{ key: voxelKey(localPosition), position: localPosition, before: { key: voxelKey(localPosition), block: localBlock, templates }, after: { key: voxelKey(localPosition), block: edited, templates }, afterOpaque: true }]);
    expect(renderer.evidence().terrainChunkRebuilds - beforeLocalRebuilds).toBe(1);
    expect(group.children.find((child) => child.userData['terrainChunk'] === '1,0,0')).toBe(unrelatedChunk);
    renderer.applyBlockChanges([{ key: voxelKey(localPosition), position: localPosition, before: { key: voxelKey(localPosition), block: edited, templates }, afterOpaque: false }]);
    expect(renderer.logicalBlockCount).toBe(99_999);
    renderer.clear(); material.dispose(); for (const template of templates) template.geometry.dispose();
  });

  it('keeps a mixed 100k terrain scene bounded by atlas sprites and occupied chunks', () => {
    const group = new THREE.Group();
    const atlas = new TerrainTextureAtlas({ width: 64, height: 64 }, 1);
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined, atlas });
    const maps = Array.from({ length: 5 }, (_, index) => {
      const map = new THREE.DataTexture(new Uint8Array([index * 30, 40, 90, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
      map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; map.needsUpdate = true;
      return map;
    });
    const materials = maps.map((map) => new THREE.MeshBasicMaterial({ map }));
    const templates = materials.map((material) => cubeTemplates(material));
    const records: Array<{ key: string; block: PlacedBlock; templates: readonly SurfaceFaceTemplate[] }> = [];
    const entries: Array<{ block: PlacedBlock; role: 'normal'; occlusionClass: 'opaque-full-cube' }> = [];
    for (let y = 0; y < 10; y += 1) for (let z = 0; z < 100; z += 1) for (let x = 0; x < 100; x += 1) {
      const position = { x, y, z };
      const block: PlacedBlock = { kind: 'resolved', id: `example:block_${(x + y + z) % 5}`, namespace: 'example', position, state: {} };
      records.push({ key: voxelKey(position), block, templates: templates[(x + y + z) % 5] });
      entries.push({ block, role: 'normal', occlusionClass: 'opaque-full-cube' });
    }
    renderer.bulkUpsert(records, entries, records.map((record) => record.block.position), { initial: true });
    const evidence = renderer.evidence();
    expect(evidence.terrainLogicalBlocks).toBe(100_000);
    expect(evidence.terrainChunks).toBe(49);
    expect(evidence.terrainChunkMeshes).toBe(49);
    expect(evidence.terrainAtlasSprites).toBe(5);
    expect(evidence.terrainAtlasPages).toBe(1);
    expect(evidence.terrainAtlasMaterials).toBe(1);
    expect(evidence.terrainFacesEmitted).toBe(24_000);
    renderer.dispose();
    for (const map of maps) map.dispose();
    for (const material of materials) material.dispose();
  });

  it('builds a complete chunk once per bulk batch and does not rebuild an unrelated chunk', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const block = (position: VoxelCoordinate): PlacedBlock => ({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position, state: {} });
    const first = Array.from({ length: 16 ** 3 }, (_, index) => block({ x: index % 16, y: Math.floor(index / 256), z: Math.floor(index / 16) % 16 }));
    const firstEntries = first.map((value) => ({ block: value, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const }));
    renderer.bulkUpsert(first.map((value) => ({ key: voxelKey(value.position), block: value, templates })), firstEntries, first.map((value) => value.position), { initial: true });
    expect(renderer.evidence().terrainChunkRebuilds).toBe(1);
    const before = renderer.evidence().terrainChunkRebuilds;
    const second = Array.from({ length: 16 ** 3 }, (_, index) => block({ x: 32 + index % 16, y: Math.floor(index / 256), z: Math.floor(index / 16) % 16 }));
    const allEntries = [...firstEntries, ...second.map((value) => ({ block: value, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const }))];
    renderer.bulkUpsert(second.map((value) => ({ key: voxelKey(value.position), block: value, templates })), allEntries, second.map((value) => value.position));
    expect(renderer.evidence().terrainChunkRebuilds - before).toBe(1);
    renderer.clear(); material.dispose(); for (const template of templates) template.geometry.dispose();
  });

  it('keeps the 48 cubed initial generation near one build per populated chunk', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const blocks: PlacedBlock[] = [];
    for (let y = 0; y < 48; y += 1) for (let z = 0; z < 48; z += 1) for (let x = 0; x < 48; x += 1) blocks.push({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} });
    const entries = blocks.map((block) => ({ block, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const }));
    renderer.bulkUpsert(blocks.map((block) => ({ key: voxelKey(block.position), block, templates })), entries, blocks.map((block) => block.position), { initial: true });
    // 27 occupied coordinates are rebuilt; the fully enclosed center chunk
    // correctly emits no physical mesh.
    expect(renderer.evidence().terrainChunks).toBe(26);
    expect(renderer.evidence().terrainChunkRebuilds).toBe(27);
    expect(renderer.evidence().terrainFacesEmitted).toBe(13_824);
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

  it('applies a terrain add/remove delta without replacing the full occupancy set', () => {
    const group = new THREE.Group();
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const first: PlacedBlock = { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 5, y: 5, z: 5 }, state: {} };
    renderer.bulkUpsert([{ key: voxelKey(first.position), block: first, templates }], [{ block: first, role: 'normal', occlusionClass: 'opaque-full-cube' }], [first.position], { initial: true });
    const second: PlacedBlock = { ...first, position: { x: 6, y: 5, z: 5 } };
    renderer.applyBlockChanges([{ key: voxelKey(second.position), position: second.position, after: { key: voxelKey(second.position), block: second, templates }, afterOpaque: true }]);
    expect(renderer.logicalBlockCount).toBe(2);
    renderer.applyBlockChanges([{ key: voxelKey(first.position), position: first.position, before: { key: voxelKey(first.position), block: first, templates }, afterOpaque: false }]);
    expect(renderer.logicalBlockCount).toBe(1);
    renderer.clear(); material.dispose(); for (const template of templates) template.geometry.dispose();
  });

  it('keeps atlas material ownership with the atlas while chunk geometry is rebuilt', () => {
    const group = new THREE.Group();
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined, atlas });
    const pixels = new Uint8Array([255, 255, 255, 255]);
    const map = new THREE.DataTexture(pixels, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType); map.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({ map });
    const block: PlacedBlock = { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {} };
    const templates = cubeTemplates(material);
    renderer.bulkUpsert([{ key: voxelKey(block.position), block, templates }], [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }], [block.position], { initial: true });
    const atlasMaterial = (group.children[0] as THREE.Mesh).material as THREE.Material;
    expect(atlasMaterial.userData['sharedTerrainAtlasMaterial']).toBe(true);
    const dispose = vi.spyOn(atlasMaterial, 'dispose');
    renderer.applyBlockChanges([{ key: voxelKey(block.position), position: block.position, before: { key: voxelKey(block.position), block, templates }, afterOpaque: false }]);
    expect(dispose).not.toHaveBeenCalled();
    atlas.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    renderer.dispose(); map.dispose(); material.dispose(); for (const template of templates) template.geometry.dispose();
  });

  it('atomically resets provider generation resources and removes stale cache entries', () => {
    const group = new THREE.Group();
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, record: () => undefined, atlas });
    const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    map.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({ map });
    const block: PlacedBlock = { kind: 'resolved', id: 'minecraft:oak_log', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { axis: 'y' } };
    const templates = cubeTemplates(material);
    renderer.cacheTemplates('minecraft:oak_log|axis=y', templates);
    renderer.bulkUpsert([{ key: voxelKey(block.position), block, templates }], [{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }], [block.position], { initial: true });
    const oldChunk = group.children[0] as THREE.Mesh;
    const oldChunkDispose = vi.spyOn(oldChunk.geometry, 'dispose');
    const oldAtlasMaterial = oldChunk.material as THREE.Material;
    const oldAtlasMaterialDispose = vi.spyOn(oldAtlasMaterial, 'dispose');
    const oldAtlasTexture = (atlas as unknown as { pages: readonly [{ texture: THREE.DataTexture }] }).pages[0].texture;
    const oldAtlasTextureDispose = vi.spyOn(oldAtlasTexture, 'dispose');
    expect(renderer.templatesFor('minecraft:oak_log|axis=y')).toBe(templates);

    expect(renderer.resetProviderGeneration()).toBe(1);
    expect(group.children).toHaveLength(0);
    expect(renderer.templatesFor('minecraft:oak_log|axis=y')).toBeUndefined();
    expect(oldChunkDispose).toHaveBeenCalledTimes(1);
    expect(oldAtlasMaterialDispose).toHaveBeenCalledTimes(1);
    expect(oldAtlasTextureDispose).toHaveBeenCalledTimes(1);
    expect(renderer.upsert({ key: voxelKey(block.position), block, templates, generation: 0 })).toBe(false);
    expect(renderer.evidence()).toMatchObject({ terrainGeneration: 1, terrainProviderResets: 1, terrainCacheEntries: 0, terrainLogicalBlocks: 0, activeAtlasGeneration: 1 });

    const replacementMap = new THREE.DataTexture(new Uint8Array([40, 80, 120, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    replacementMap.needsUpdate = true;
    const replacementMaterial = new THREE.MeshBasicMaterial({ map: replacementMap });
    const replacementTemplates = cubeTemplates(replacementMaterial);
    const replacement = { ...block, state: { axis: 'y' } };
    renderer.cacheTemplates('minecraft:oak_log|axis=y', replacementTemplates, 1);
    renderer.bulkUpsert([{ key: voxelKey(replacement.position), block: replacement, templates: replacementTemplates }], [{ block: replacement, role: 'normal', occlusionClass: 'opaque-full-cube' }], [replacement.position], { initial: true });
    expect(group.children).toHaveLength(1);
    const replacementChunkMaterial = (group.children[0] as THREE.Mesh).material;
    expect((Array.isArray(replacementChunkMaterial) ? replacementChunkMaterial[0] : replacementChunkMaterial).userData['terrainAtlasGeneration']).toBe(1);
    renderer.dispose(); map.dispose(); material.dispose(); replacementMap.dispose(); replacementMaterial.dispose();
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
