import { ProjectDocument, PlacedBlock } from '../../domain/project.types';
import { serializeProjectPackage } from './project-package';

/** Deterministic repeated-state package used only by the opt-in import benchmark. */
export function largeProjectPackageFixture(blockCount = 4096): string {
  const blocks: PlacedBlock[] = [];
  for (let index = 0; index < blockCount; index += 1) {
    const x = index % 64; const z = Math.floor(index / 64) % 64; const y = Math.floor(index / 4096);
    blocks.push({ kind: 'resolved', id: index % 5 === 0 ? 'minecraft:oak_stairs' : 'minecraft:stone', namespace: 'minecraft', position: { x, y, z }, state: index % 5 === 0 ? { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' } : {} });
  }
  const project: ProjectDocument = {
    schemaVersion: 3, id: 'import-benchmark', metadata: { name: 'Import benchmark', minecraftVersion: '1.21.1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    size: { x: 64, y: Math.max(1, Math.ceil(blockCount / 4096)), z: 64 }, structureMode: 'vanilla-structure-block', blocks, groups: [], editorSettings: { currentY: 0, layerVisibility: 'whole-structure', referenceLayerOpacity: .28 }, decorations: [],
  };
  return serializeProjectPackage(project);
}
