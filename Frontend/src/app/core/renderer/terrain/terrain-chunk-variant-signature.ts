import type { VoxelCoordinate } from '../../domain/project.types';
import type { TerrainChunkCoordinate } from './chunk-coordinate';
import type { TerrainSurfaceRecord } from './terrain-render-contracts';
import type { TerrainTemplateResourceOwner } from './terrain-template-resource-owner';

export interface TerrainOpaqueOccupancy {
  hasOpaque(position: VoxelCoordinate): boolean;
}

export function terrainChunkVariantSignature(
  key: string,
  chunk: TerrainChunkCoordinate,
  records: readonly TerrainSurfaceRecord[],
  providerGeneration: number,
  templates: TerrainTemplateResourceOwner,
  occupancy: TerrainOpaqueOccupancy,
): string {
  const signature: string[] = [`${key}|provider:${providerGeneration}|`];
  for (const record of [...records].sort((left, right) => left.key.localeCompare(right.key))) {
    const state = JSON.stringify(Object.entries(record.block.state).sort(([left], [right]) => left.localeCompare(right)));
    signature.push(`${record.key}:${record.block.id}:${state}:${record.role ?? 'normal'}:${templates.identityFor(record.templates)};`);
  }
  signature.push('|occupancy:');
  const originX = chunk.x * 16 - 1;
  const originY = chunk.y * 16 - 1;
  const originZ = chunk.z * 16 - 1;
  for (let y = 0; y < 18; y += 1) for (let z = 0; z < 18; z += 1) for (let x = 0; x < 18; x += 1) {
    signature.push(occupancy.hasOpaque({ x: originX + x, y: originY + y, z: originZ + z }) ? '1' : '0');
  }
  return signature.join('');
}
