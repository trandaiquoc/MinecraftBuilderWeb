import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VanillaAssetProvider } from '../../assets/vanilla/vanilla-asset-provider';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { VanillaBlockVisualProvider } from '../geometry/block-model-geometry';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import { ChunkSurfaceRenderer } from './chunk-surface-renderer';

const DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
const IDS = ['stone', 'dirt', 'oak_planks', 'sandstone', 'oak_log'] as const;
const FIXTURE_IDS = [...IDS, 'gold_block'] as const;

describe('real Vanilla provider terrain atlas integration', () => {
  it('batches real provider materials while preserving strict face parity and oak log texture roles', async () => {
    const first = await realFixture();
    const blocks = IDS.map((name, index) => placed(`minecraft:${name}`, { x: index * 2, y: 0, z: 0 }, name === 'oak_log' ? { axis: 'y' } : {}));
    const records = await Promise.all(blocks.map(async (block) => ({ block, templates: await templatesFor(first.visual, block) })));
    expect(records[0].templates[0].material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(records[0].templates[0].material.side).toBe(THREE.DoubleSide);
    expect(records[0].templates[0].material.alphaTest).toBe(.1);
    const strict = render(records, 'off');
    const atlas = render(records, 'on');

    expect(atlas.evidence().terrainAtlas).toMatchObject({
      terrainAtlasCompatibleFaces: expect.any(Number),
      terrainAtlasSprites: expect.any(Number),
      terrainAtlasInsertions: expect.any(Number),
      terrainAtlasMaterials: expect.any(Number),
    });
    expect(atlas.evidence().terrainAtlas.terrainAtlasCompatibleFaces).toBeGreaterThan(0);
    expect(atlas.evidence().terrainAtlas.terrainAtlasSprites).toBeGreaterThan(0);
    expect(atlas.evidence().terrainAtlas.terrainAtlasInsertions).toBeGreaterThan(0);
    expect(atlas.evidence().terrainAtlas.terrainAtlasMaterials).toBeGreaterThan(0);
    expect(atlas.evidence().terrainLogicalBlocks).toBe(strict.evidence().terrainLogicalBlocks);
    expect(atlas.evidence().terrainFacesEmitted).toBe(strict.evidence().terrainFacesEmitted);
    expect(atlas.evidence().terrainFacesCulled).toBe(strict.evidence().terrainFacesCulled);
    expect(atlas.evidence().terrainChunkMeshes).toBeLessThan(strict.evidence().terrainChunkMeshes);

    const oak = records.find((record) => record.block.id === 'minecraft:oak_log')!;
    const oakTextures = new Map<string, THREE.Texture>();
    for (const template of oak.templates) oakTextures.set(template.direction, (template.material as THREE.MeshBasicMaterial | THREE.MeshLambertMaterial).map!);
    expect(oakTextures.get('north')).toBe(oakTextures.get('south'));
    expect(oakTextures.get('north')).toBe(oakTextures.get('east'));
    expect(oakTextures.get('up')).toBe(oakTextures.get('down'));
    expect(oakTextures.get('north')).not.toBe(oakTextures.get('up'));
    expect(atlas.evidence().terrainAtlas.terrainAtlasSprites).toBe(6);
    expect(oakTextures.get('north')!.magFilter).toBe(THREE.NearestFilter);
    expect(oakTextures.get('north')!.minFilter).toBe(THREE.NearestFilter);
    expect(oakTextures.get('north')!.generateMipmaps).toBe(false);
    expect(oakTextures.get('north')!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(oakTextures.get('north')!.flipY).toBe(true);
    const gold = placed('minecraft:gold_block', { x: 32, y: 0, z: 0 }, {});
    const goldTemplates = await templatesFor(first.visual, gold);
    const oldChunkObject = atlas.group.children.find((child) => child.userData['terrainChunk'] === '0,0,0');
    atlas.renderer.applyBlockChanges([{ key: voxelKey(gold.position), position: gold.position, after: { key: voxelKey(gold.position), block: gold, templates: goldTemplates }, afterOpaque: true }]);
    expect(atlas.evidence().terrainAtlas.terrainAtlasSprites).toBe(7);
    expect(atlas.group.children.find((child) => child.userData['terrainChunk'] === '0,0,0')).toBe(oldChunkObject);
    first.visual.dispose();
    strict.renderer.clear(); atlas.renderer.clear();
  });

  it('keeps real provider axis classification conservative across y to x to z to y', () => {
    const fixture = makeFixture();
    const visual = new VanillaBlockVisualProvider(fixture.assets);
    expect(visual.occlusionClass!(placed('minecraft:oak_log', { x: 0, y: 0, z: 0 }, { axis: 'y' }))).toBe('opaque-full-cube');
    expect(visual.occlusionClass!(placed('minecraft:oak_log', { x: 0, y: 0, z: 0 }, { axis: 'x' }))).toBe('unknown');
    expect(visual.occlusionClass!(placed('minecraft:oak_log', { x: 0, y: 0, z: 0 }, { axis: 'z' }))).toBe('unknown');
    expect(visual.occlusionClass!(placed('minecraft:oak_log', { x: 0, y: 0, z: 0 }, { axis: 'y' }))).toBe('opaque-full-cube');
    visual.dispose();
  });
});

async function realFixture(): Promise<{ readonly assets: VanillaAssetProvider; readonly visual: VanillaBlockVisualProvider }> {
  const fixture = makeFixture();
  (fixture.assets as unknown as { textureUrl: (value: string) => string }).textureUrl = (value: string) => value;
  const textures = new Map<string, THREE.DataTexture>();
  for (const resource of fixture.textureUrls.keys()) {
    const color = new Uint8Array([resource.includes('top') ? 200 : resource.includes('oak_log') ? 120 : 220, resource.includes('top') ? 170 : 220, resource.includes('stone') ? 220 : 80, 255]);
    const texture = new THREE.DataTexture(color, 1, 1, THREE.RGBAFormat);
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = true; texture.needsUpdate = true;
    textures.set(resource, texture);
  }
  const visual = new VanillaBlockVisualProvider(fixture.assets, async (url): Promise<THREE.Texture<HTMLImageElement>> => textures.get(url)! as unknown as THREE.Texture<HTMLImageElement>);
  return { assets: fixture.assets, visual };
}

function makeFixture(): { readonly assets: VanillaAssetProvider; readonly textureUrls: ReadonlyMap<string, string> } {
  const json: Record<string, unknown> = {};
  const binary = new Map<string, Uint8Array>();
  const textureUrls = new Map<string, string>();
  for (const name of FIXTURE_IDS) {
    json[`assets/minecraft/blockstates/${name}.json`] = name === 'oak_log'
      ? { variants: { 'axis=y': { model: `minecraft:block/${name}` }, 'axis=x': { model: `minecraft:block/${name}`, x: 90 }, 'axis=z': { model: `minecraft:block/${name}`, x: 90, y: 90 } } }
      : { variants: { '': { model: `minecraft:block/${name}` } } };
    const texture = `minecraft:block/${name}`;
    const top = `minecraft:block/${name}_top`;
    json[`assets/minecraft/models/block/${name}.json`] = { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: name === 'oak_log' ? { north: { texture: texture }, south: { texture }, east: { texture }, west: { texture }, up: { texture: top }, down: { texture: top } } : Object.fromEntries(DIRECTIONS.map((direction) => [direction, { texture }])) }] };
    for (const resource of name === 'oak_log' ? [texture, top] : [texture]) {
      const path = `assets/minecraft/textures/${resource.split(':')[1]}.png`;
      binary.set(path, new Uint8Array([1])); textureUrls.set(resource, resource);
    }
  }
  const assets = new VanillaAssetProvider('real-vanilla-fixture.jar', json, binary);
  return { assets, textureUrls };
}

async function templatesFor(visual: VanillaBlockVisualProvider, block: PlacedBlock): Promise<readonly SurfaceFaceTemplate[]> {
  const result = await visual.create(block);
  expect(result.mode, JSON.stringify({ diagnostics: result.diagnostics, resolved: result.resolved.trace })).toBe('real');
  const templates = new Map<string, SurfaceFaceTemplate>();
  result.object!.updateMatrixWorld(true);
  result.object!.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const direction = object.userData['face'] as typeof DIRECTIONS[number] | undefined;
    if (!direction || templates.has(direction)) return;
    templates.set(direction, { geometry: object.geometry.clone(), material: (object.material as THREE.Material).clone(), direction, matrix: new THREE.Matrix4() });
  });
  return DIRECTIONS.map((direction) => templates.get(direction)!);
}

function render(records: readonly { readonly block: PlacedBlock; readonly templates: readonly SurfaceFaceTemplate[] }[], mode: 'off' | 'on') {
  const group = new THREE.Group();
  const renderer = new ChunkSurfaceRenderer({ blocksGroup: group, terrainAtlasMode: mode, record: () => undefined });
  renderer.bulkUpsert(records.map((record) => ({ key: voxelKey(record.block.position), ...record })), records.map((record) => ({ block: record.block, role: 'normal' as const, occlusionClass: 'opaque-full-cube' as const })), records.map((record) => record.block.position), { initial: true });
  return { renderer, group, evidence: () => renderer.evidence() };
}

function placed(id: string, position: VoxelCoordinate, state: Readonly<Record<string, string>>): PlacedBlock { return { kind: 'resolved', id, namespace: id.split(':')[0], position, state }; }
function voxelKey(position: VoxelCoordinate): string { return `${position.x},${position.y},${position.z}`; }
