import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { TerrainOccupancy } from './chunk-occupancy';
import { terrainChunkKey, worldToTerrainChunk } from './chunk-coordinate';
import { meshTerrainChunk, type TerrainMeshEntry } from './chunk-surface-mesher';
import { TerrainTextureAtlas } from './atlas/terrain-texture-atlas';

describe('compiled terrain surface mesher', () => {
  it('preserves transformed normals/UVs and keeps incompatible materials in separate buckets', () => {
    const firstMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const secondMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const first = cubeTemplates(firstMaterial);
    const second = cubeTemplates(secondMaterial);
    const block: PlacedBlock = { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {} };
    const occupancy = new TerrainOccupancy(); occupancy.replace([{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }]);
    const compiled = meshTerrainChunk({ x: 0, y: 0, z: 0 }, [{ key: '0,0,0', position: block.position, templates: [...first.slice(0, 5), ...second.slice(5)] }], occupancy);
    expect(compiled.buckets).toHaveLength(2);
    for (const bucket of compiled.buckets) {
      expect(bucket.geometry.getAttribute('normal')).toBeDefined();
      expect(bucket.geometry.getAttribute('uv')).toBeDefined();
      bucket.geometry.dispose();
    }
    firstMaterial.dispose(); secondMaterial.dispose();
    for (const template of [...first, ...second]) template.geometry.dispose();
  });

  it('culls interior and cross-chunk faces while preserving the complete 48 cubed outer shell', () => {
    const size = 48;
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const templates = cubeTemplates(material);
    const blocks: PlacedBlock[] = [];
    for (let y = 0; y < size; y += 1) for (let z = 0; z < size; z += 1) for (let x = 0; x < size; x += 1) blocks.push({ kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: {} });
    const classification = blocks.map((block) => ({ block, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const }));
    const occupancy = new TerrainOccupancy(); occupancy.replace(classification);
    const byChunk = new Map<string, TerrainMeshEntry[]>();
    for (const block of blocks) {
      const key = terrainChunkKey(worldToTerrainChunk(block.position));
      const entries = byChunk.get(key) ?? [];
      entries.push({ key: `${block.position.x},${block.position.y},${block.position.z}`, position: block.position, templates });
      byChunk.set(key, entries);
    }
    let faces = 0;
    let triangles = 0;
    for (const [key, entries] of byChunk) {
      const chunk = worldToTerrainChunk(entries[0].position);
      const compiled = meshTerrainChunk(chunk, entries, occupancy);
      expect(terrainChunkKey(compiled.chunk)).toBe(key);
      faces += compiled.facesEmitted;
      triangles += compiled.buckets.reduce((count, bucket) => count + bucket.geometry.getAttribute('position').count / 3, 0);
      for (const bucket of compiled.buckets) bucket.geometry.dispose();
    }
    expect(blocks).toHaveLength(110_592);
    expect(byChunk.size).toBe(27);
    expect(faces).toBe(13_824);
    expect(triangles).toBe(27_648);
    material.dispose();
    for (const template of templates) template.geometry.dispose();
  });

  it('merges compatible mixed opaque textures into one atlas material bucket', () => {
    const textures = Array.from({ length: 5 }, (_, index) => {
      const data = new Uint8Array([index * 30, 20, 10, 255]);
      const map = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
      map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; map.needsUpdate = true;
      return map;
    });
    const entries: TerrainMeshEntry[] = textures.map((map, index) => {
      const block: PlacedBlock = { kind: 'resolved', id: `example:block_${index}`, namespace: 'example', position: { x: index, y: 0, z: 0 }, state: {} };
      return { key: `${index},0,0`, position: block.position, templates: cubeTemplates(new THREE.MeshBasicMaterial({ map })) };
    });
    const occupancy = new TerrainOccupancy();
    const atlas = new TerrainTextureAtlas({ width: 32, height: 32 }, 1);
    const compiled = meshTerrainChunk({ x: 0, y: 0, z: 0 }, entries, occupancy, atlas);
    expect(atlas.evidence()).toMatchObject({ terrainAtlasSprites: 5, terrainAtlasPages: 1 });
    expect(compiled.buckets).toHaveLength(1);
    expect(compiled.buckets[0].faceCount).toBe(30);
    for (const bucket of compiled.buckets) bucket.geometry.dispose();
    for (const entry of entries) for (const template of entry.templates) { template.geometry.dispose(); template.material.dispose(); }
    atlas.dispose(); for (const map of textures) map.dispose();
  });
});

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
