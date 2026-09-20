import { PlacedDecoration } from '../../decorations/decoration.types';
import { PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from '../../domain/project.types';
import * as THREE from 'three';
import { VanillaAssetProvider } from '../../assets/vanilla/vanilla-asset-provider';
import { VanillaBlockVisualProvider } from '../geometry/block-model-geometry';

export type RendererBenchmarkSize = 'small' | 'medium' | 'large';

const SIZES: Readonly<Record<RendererBenchmarkSize, ProjectSize>> = {
  small: { x: 16, y: 16, z: 16 },
  medium: { x: 32, y: 16, z: 32 },
  large: { x: 64, y: 16, z: 64 },
};

const COUNTS: Readonly<Record<RendererBenchmarkSize, number>> = {
  small: 256,
  medium: 2048,
  large: 8192,
};

export function rendererBenchmarkProject(size: RendererBenchmarkSize): ProjectDocument {
  const projectSize = SIZES[size];
  const blocks: PlacedBlock[] = [];
  const target = COUNTS[size];
  let index = 0;
  for (let y = 0; y < projectSize.y && blocks.length < target; y += 1) {
    for (let z = 0; z < projectSize.z && blocks.length < target; z += 1) {
      for (let x = 0; x < projectSize.x && blocks.length < target; x += 1) {
        const position = { x, y, z };
        blocks.push(benchmarkBlock(index++, position));
      }
    }
  }
  return {
    schemaVersion: 3,
    id: `renderer-benchmark-${size}`,
    metadata: { name: `Renderer ${size}`, minecraftVersion: '1.21.1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    size: projectSize,
    structureMode: 'vanilla-structure-block',
    blocks,
    groups: [],
    editorSettings: { currentY: 0, layerVisibility: 'whole-structure', referenceLayerOpacity: 0.28 },
    decorations: benchmarkDecorations(size),
  };
}

export function benchmarkBlock(index: number, position: VoxelCoordinate): PlacedBlock {
  const pattern = index % 4;
  if (pattern === 1) return { kind: 'resolved', id: 'minecraft:oak_stairs', namespace: 'minecraft', position, state: { facing: ['north', 'east', 'south', 'west'][index % 4], half: index % 2 ? 'top' : 'bottom', shape: 'straight', waterlogged: 'false' } };
  if (pattern === 2) return { kind: 'resolved', id: 'minecraft:oak_fence', namespace: 'minecraft', position, state: { north: 'false', east: 'false', south: 'false', west: 'false' } };
  if (pattern === 3) return { kind: 'resolved', id: 'minecraft:glass', namespace: 'minecraft', position, state: {} };
  return { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position, state: {} };
}

/** A tiny asset-backed provider makes the explicit benchmark exercise real cache reuse without bundling vanilla assets. */
export function rendererBenchmarkVisualProvider(): VanillaBlockVisualProvider {
  const json = {
    'assets/minecraft/blockstates/stone.json': { variants: { '': { model: 'minecraft:block/stone' } } },
    'assets/minecraft/models/block/stone.json': { parent: 'minecraft:block/cube_all', textures: { all: 'minecraft:block/stone' } },
    'assets/minecraft/models/block/cube_all.json': { parent: 'block/cube', textures: { down: '#all', up: '#all', north: '#all', south: '#all', west: '#all', east: '#all' } },
    'assets/minecraft/models/block/cube.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(['down', 'up', 'north', 'south', 'west', 'east'].map((direction) => [direction, { texture: `#${direction}` }])) }] },
  };
  const assets = new VanillaAssetProvider('benchmark-fixture', json, new Map([
    ['assets/minecraft/textures/block/stone.png', new Uint8Array([1])],
  ]));
  return new VanillaBlockVisualProvider(assets, async () => new THREE.Texture());
}

function benchmarkDecorations(size: RendererBenchmarkSize): readonly PlacedDecoration[] {
  const count = size === 'small' ? 1 : size === 'medium' ? 4 : 8;
  return Array.from({ length: count }, (_, index) => ({
    instanceId: `benchmark-frame-${index}`,
    kind: 'item-frame' as const,
    entityTypeId: 'minecraft:item_frame' as const,
    anchor: { x: index % 8, y: 1, z: 0 },
    facing: 'south' as const,
    rotation: (index % 8) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
    invisible: false,
    fixed: false,
    itemDropChance: 1,
  }));
}
