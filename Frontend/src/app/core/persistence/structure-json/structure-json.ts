import { ProjectDocument, PlacedBlock } from '../../domain/project.types';

export const STRUCTURE_JSON_FORMAT = 'minecraftbuilder-structure' as const;
export const CURRENT_STRUCTURE_JSON_VERSION = 1 as const;

export interface StructureJsonBlockV1 {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly state: Readonly<Record<string, string>>;
}

export interface StructureJsonV1 {
  readonly format: typeof STRUCTURE_JSON_FORMAT;
  readonly formatVersion: typeof CURRENT_STRUCTURE_JSON_VERSION;
  readonly minecraftVersion: string;
  readonly name?: string;
  readonly blocks: readonly StructureJsonBlockV1[];
}

export function structureJsonFromProject(project: ProjectDocument): StructureJsonV1 {
  return {
    format: STRUCTURE_JSON_FORMAT,
    formatVersion: CURRENT_STRUCTURE_JSON_VERSION,
    minecraftVersion: project.metadata.minecraftVersion,
    name: project.metadata.name,
    blocks: [...project.blocks].sort(compareBlocks).map(toStructureJsonBlock),
  };
}

export function serializeStructureJson(project: ProjectDocument): string {
  return serializeStructureJsonValue(structureJsonFromProject(project));
}

export function serializeStructureJsonValue(value: StructureJsonV1): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createStructureJsonExample(): StructureJsonV1 {
  return {
    format: STRUCTURE_JSON_FORMAT,
    formatVersion: CURRENT_STRUCTURE_JSON_VERSION,
    minecraftVersion: '1.21.1',
    name: 'Example Structure',
    blocks: [
      { id: 'minecraft:stone_bricks', x: 0, y: 0, z: 0, state: {} },
      { id: 'minecraft:oak_stairs', x: 1, y: 0, z: 0, state: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' } },
    ],
  };
}

function toStructureJsonBlock(block: PlacedBlock): StructureJsonBlockV1 {
  const state = Object.fromEntries(Object.entries(block.state).sort(([left], [right]) => compareStrings(left, right)));
  return { id: block.id, x: block.position.x, y: block.position.y, z: block.position.z, state };
}

function compareBlocks(left: PlacedBlock, right: PlacedBlock): number {
  return left.position.x - right.position.x || left.position.y - right.position.y || left.position.z - right.position.z || compareStrings(left.id, right.id) || compareStrings(JSON.stringify(left.state), JSON.stringify(right.state));
}

function compareStrings(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
