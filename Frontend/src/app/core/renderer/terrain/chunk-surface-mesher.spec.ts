import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PlacedBlock } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { TerrainOccupancy } from './chunk-occupancy';
import { terrainChunkKey, worldToTerrainChunk } from './chunk-coordinate';
import { meshTerrainChunk, precompileTerrainTemplates, type TerrainMeshEntry } from './chunk-surface-mesher';
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

  it('marks reference terrain buckets without adding reference blocks to occupancy', () => {
    const material = new THREE.MeshBasicMaterial();
    const block: PlacedBlock = { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {} };
    const occupancy = new TerrainOccupancy();
    const compiled = meshTerrainChunk({ x: 0, y: 0, z: 0 }, [{ key: 'reference', position: block.position, templates: cubeTemplates(material), role: 'reference' }], occupancy);
    expect(compiled.buckets.every((bucket) => bucket.key.endsWith('|render-role:reference'))).toBe(true);
    expect(occupancy.size()).toBe(0);
    for (const bucket of compiled.buckets) bucket.geometry.dispose();
    material.dispose();
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

  it('keeps strict face count and geometry parity when atlas conversion is mixed with fallback', () => {
    const supportedTexture = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    supportedTexture.flipY = true;
    const supported = new THREE.MeshBasicMaterial({ map: supportedTexture });
    const unsupported = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const strictTemplates = cubeTemplates(supported).map((template, index) => index === 0 ? { ...template, material: unsupported } : template);
    const block: PlacedBlock = { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: {} };
    const occupancy = new TerrainOccupancy(); occupancy.replace([{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }]);
    const strict = meshTerrainChunk({ x: 0, y: 0, z: 0 }, [{ key: '0,0,0', position: block.position, templates: strictTemplates }], occupancy);
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    const optimized = meshTerrainChunk({ x: 0, y: 0, z: 0 }, [{ key: '0,0,0', position: block.position, templates: strictTemplates }], occupancy, atlas);
    expect(optimized.facesEmitted).toBe(strict.facesEmitted);
    expect(optimized.buckets.reduce((sum, bucket) => sum + bucket.faceCount, 0)).toBe(6);
    expect(atlas.evidence().terrainAtlasCompatibleFaces).toBe(5);
    expect(atlas.evidence().terrainAtlasFallbackFaces).toBe(1);
    expect(optimized.buckets.some((bucket) => bucket.material === unsupported)).toBe(true);
    for (const bucket of [...strict.buckets, ...optimized.buckets]) bucket.geometry.dispose();
    atlas.clear(); supported.dispose(); unsupported.dispose(); supportedTexture.dispose();
  });

  it('keeps strict positions/normals and semantic UV corners under atlas remapping', () => {
    const pixels = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, THREE.RGBAFormat); pixels.flipY = true;
    const material = new THREE.MeshBasicMaterial({ map: pixels });
    const templates = cubeTemplates(material);
    const strict = precompileTerrainTemplates(templates);
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    const optimized = precompileTerrainTemplates(templates, atlas);
    expect(optimized).toHaveLength(strict.length);
    for (let index = 0; index < strict.length; index += 1) {
      expect(optimized[index].positions).toEqual(strict[index].positions);
      expect(optimized[index].normals).toEqual(strict[index].normals);
      const sprite = atlas.face(material, strict[index].uvs)!.sprite;
      const semantic = optimized[index].uvs.map((value, uvIndex) => uvIndex % 2 === 0 ? (value - sprite.minU) / (sprite.maxU - sprite.minU) : (sprite.maxV - value) / (sprite.maxV - sprite.minV));
      expect(semantic).toEqual(strict[index].uvs);
    }
    atlas.clear(); material.dispose(); pixels.dispose(); for (const template of templates) template.geometry.dispose();
  });

  it('keeps separate oak-log side/top sources and remains visible across axis transitions', () => {
    const sideTexture = new THREE.DataTexture(new Uint8Array([120, 80, 40, 255]), 1, 1, THREE.RGBAFormat); sideTexture.flipY = true;
    const topTexture = new THREE.DataTexture(new Uint8Array([180, 120, 70, 255]), 1, 1, THREE.RGBAFormat); topTexture.flipY = true;
    const side = new THREE.MeshBasicMaterial({ map: sideTexture });
    const top = new THREE.MeshBasicMaterial({ map: topTexture });
    const templates = cubeTemplates(side).map((template) => template.direction === 'up' || template.direction === 'down' ? { ...template, material: top } : template);
    const block: PlacedBlock = { kind: 'resolved', id: 'minecraft:oak_log', namespace: 'minecraft', position: { x: 0, y: 0, z: 0 }, state: { axis: 'y' } };
    const occupancy = new TerrainOccupancy(); occupancy.replace([{ block, role: 'normal', occlusionClass: 'opaque-full-cube' }]);
    const atlas = new TerrainTextureAtlas({ width: 16, height: 16 }, 1);
    for (const axis of ['y', 'x', 'z', 'y'] as const) {
      const next = { ...block, state: { axis } };
      const compiled = meshTerrainChunk({ x: 0, y: 0, z: 0 }, [{ key: 'oak-log', position: next.position, templates }], occupancy, atlas);
      expect(compiled.facesEmitted).toBe(6);
      expect(compiled.buckets.length).toBeGreaterThan(0);
      for (const bucket of compiled.buckets) bucket.geometry.dispose();
    }
    expect(atlas.evidence().terrainAtlasSprites).toBe(2);
    atlas.clear(); side.dispose(); top.dispose(); sideTexture.dispose(); topTexture.dispose();
  });

  it('renders a mixed five-block terrain fixture with one sprite per source texture', () => {
    const ids = ['minecraft:stone', 'minecraft:dirt', 'minecraft:oak_planks', 'minecraft:sandstone', 'minecraft:oak_log'];
    const materials = ids.map((_, index) => {
      const texture = new THREE.DataTexture(new Uint8Array([40 + index, 80 + index, 120 + index, 255]), 1, 1, THREE.RGBAFormat); texture.flipY = true;
      const material = new THREE.MeshBasicMaterial({ map: texture });
      return { material, texture };
    });
    const atlas = new TerrainTextureAtlas({ width: 32, height: 32 }, 1);
    const blocks: PlacedBlock[] = ids.map((id, index) => {
      const state: Readonly<Record<string, string>> = id === 'minecraft:oak_log' ? { axis: 'y' } : {};
      return { kind: 'resolved', id, namespace: 'minecraft', position: { x: index * 2, y: 0, z: 0 }, state };
    });
    const occupancy = new TerrainOccupancy(); occupancy.replace(blocks.map((block) => ({ block, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const })));
    const compiled = meshTerrainChunk({ x: 0, y: 0, z: 0 }, blocks.map((block, index) => ({ key: block.id, position: block.position, templates: cubeTemplates(materials[index].material) })), occupancy, atlas);
    expect(compiled.facesEmitted).toBeGreaterThan(0);
    expect(compiled.buckets.reduce((sum, bucket) => sum + bucket.faceCount, 0)).toBe(compiled.facesEmitted);
    expect(atlas.evidence().terrainAtlasSprites).toBe(5);
    for (const bucket of compiled.buckets) bucket.geometry.dispose();
    atlas.clear(); for (const entry of materials) { entry.material.dispose(); entry.texture.dispose(); }
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
