import { MINECRAFT_JAVA_1_21_1_DATA_VERSION, canonicalProperties, structureStateIdentity, validateMinecraftStructureProject, validateStructureTemplate, type MinecraftStructureDiagnostic } from './minecraft-structure-contract';
import { MinecraftJavaStructureAdapter } from './minecraft-structure-adapter';
import type { MinecraftJavaNbtCodec } from './minecraft-structure-codec';
import type { ProjectDocument, PlacedBlock, ProjectSize } from '../../domain/project.types';
import type { MinecraftStructurePaletteEntry, MinecraftStructureTemplate } from './minecraft-structure-types';

export interface MinecraftStructureExportSuccess {
  readonly ok: true;
  readonly bytes: Uint8Array;
  readonly template: MinecraftStructureTemplate;
  readonly voxelCount: number;
  readonly paletteCount: number;
}

export interface MinecraftStructureExportFailure {
  readonly ok: false;
  readonly diagnostics: readonly MinecraftStructureDiagnostic[];
}

export type MinecraftStructureExportResult = MinecraftStructureExportSuccess | MinecraftStructureExportFailure;

/**
 * Exports only the verified core StructureTemplate fields. Empty ProjectDocument
 * coordinates become explicit Air; unsupported block entities/decorations fail
 * before any binary output is produced.
 */
export async function exportMinecraftStructure(
  project: ProjectDocument,
  codec: MinecraftJavaNbtCodec,
  adapter = new MinecraftJavaStructureAdapter(),
): Promise<MinecraftStructureExportResult> {
  const validation = validateMinecraftStructureProject(project);
  const diagnostics = validation.diagnostics.filter((diagnostic) => diagnostic.code !== 'unsupported-raw-nbt');
  project.blocks.forEach((block, index) => {
    if (block.blockEntityData !== undefined) diagnostics.push({ code: 'unsupported-block-entity', message: 'Block entity data is not supported by the core 15.2 exporter.', path: `blocks.${index}.blockEntityData` });
  });
  if (project.decorations && project.decorations.length > 0) diagnostics.push({ code: 'unsupported-decoration', message: 'Decorations/entities require the later semantic entity exporter.', path: 'decorations' });
  diagnostics.push(...invalidStateDiagnostics(project.blocks));
  diagnostics.push(...duplicateCoordinateDiagnostics(project.blocks));
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const occupied = new Map<string, PlacedBlock>();
  for (const block of project.blocks) occupied.set(coordinateKey(block.position), block);
  const identities = new Map<string, { id: string; state: Readonly<Record<string, string>> }>();
  for (const block of project.blocks) {
    identities.set(structureStateIdentity(block.id, block.state), { id: block.id, state: block.state });
  }
  const airIdentity = structureStateIdentity('minecraft:air', {});
  const airNeeded = occupied.size < volume(project.size);
  if (airNeeded) identities.set(airIdentity, { id: 'minecraft:air', state: {} });
  const orderedStates = [...identities.entries()].sort(([left], [right]) => left.localeCompare(right));
  const palette = orderedStates.map(([, entry]): MinecraftStructurePaletteEntry => ({
    name: entry.id,
    ...(Object.keys(entry.state).length > 0 ? { properties: canonicalProperties(entry.state) } : {}),
  }));
  const paletteIndexes = new Map(orderedStates.map(([identity], index) => [identity, index]));
  const airIndex = paletteIndexes.get(airIdentity);
  const blocks = [];
  for (let y = 0; y < project.size.y; y += 1) {
    for (let z = 0; z < project.size.z; z += 1) {
      for (let x = 0; x < project.size.x; x += 1) {
        const block = occupied.get(`${x},${y},${z}`);
        const state = block ? paletteIndexes.get(structureStateIdentity(block.id, block.state)) : airIndex;
        if (state === undefined) throw new Error('Exporter palette construction lost a voxel state.');
        blocks.push({ pos: [x, y, z] as const, state });
      }
    }
  }
  const template: MinecraftStructureTemplate = { dataVersion: MINECRAFT_JAVA_1_21_1_DATA_VERSION, size: project.size, palette, blocks, entities: [] };
  const templateValidation = validateStructureTemplate(template);
  if (!templateValidation.valid) return { ok: false, diagnostics: templateValidation.diagnostics };
  const bytes = await codec.encode(adapter.encodeStructure(template));
  return { ok: true, bytes, template, voxelCount: volume(project.size), paletteCount: palette.length };
}

function invalidStateDiagnostics(blocks: readonly PlacedBlock[]): MinecraftStructureDiagnostic[] {
  const diagnostics: MinecraftStructureDiagnostic[] = [];
  blocks.forEach((block, index) => Object.entries(block.state).forEach(([key, value]) => {
    if (typeof key !== 'string' || typeof value !== 'string') diagnostics.push({ code: 'invalid-state-property', message: 'BlockState property keys and values must be strings.', path: `blocks.${index}.state` });
  }));
  return diagnostics;
}

function duplicateCoordinateDiagnostics(blocks: readonly PlacedBlock[]): MinecraftStructureDiagnostic[] {
  const seen = new Map<string, number>();
  const diagnostics: MinecraftStructureDiagnostic[] = [];
  blocks.forEach((block, index) => {
    const key = coordinateKey(block.position);
    const previous = seen.get(key);
    if (previous !== undefined) diagnostics.push({ code: 'duplicate-coordinate', message: `Coordinate is already occupied by block index ${previous}; duplicate coordinates are not exported.`, path: `blocks.${index}.position` });
    else seen.set(key, index);
  });
  return diagnostics;
}

function coordinateKey(position: { readonly x: number; readonly y: number; readonly z: number }): string { return `${position.x},${position.y},${position.z}`; }
function volume(size: ProjectSize): number { return size.x * size.y * size.z; }
