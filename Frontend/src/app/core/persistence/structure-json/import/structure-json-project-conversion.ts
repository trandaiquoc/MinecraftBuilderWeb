/** Canonical ProjectDocument conversion and deterministic Structure JSON serialization. */

import type { ProjectDocument, PlacedBlock } from '../../../domain/project.types';
import type { PlacedDecoration } from '../../../decorations/decoration.types';
import { STRUCTURE_JSON_FORMAT } from '../structure-json-contracts';
import type {
  StructureJson,
  StructureJsonBlock,
  StructureJsonDecoration,
  StructureJsonDefinitionResolver,
  StructureJsonPainting,
} from '../structure-json-contracts';
import {
  blockEntityToStructureJson,
  toStructureJsonItem,
} from '../block-entities/structure-json-block-entity-mapping';

export function structureJsonFromProject(
  project: ProjectDocument,
  resolveDefinition?: StructureJsonDefinitionResolver,
): StructureJson {
  return {
    format: STRUCTURE_JSON_FORMAT,
    minecraftVersion: project.metadata.minecraftVersion,
    ...(project.metadata.name ? { name: project.metadata.name } : {}),
    blocks: [...project.blocks]
      .sort(compareBlocks)
      .map((block) => toStructureJsonBlock(block, resolveDefinition)),
    decorations: [...(project.decorations ?? [])]
      .sort(compareDecorations)
      .map(decorationToStructureJson),
  };
}

export function hasUnsupportedProjectBlockEntities(
  project: ProjectDocument,
  resolveDefinition?: StructureJsonDefinitionResolver,
): boolean {
  return project.blocks.some(
    (block) =>
      block.blockEntityData !== undefined &&
      !blockEntityToStructureJson(block.blockEntityData, block.id, resolveDefinition?.(block.id)),
  );
}

export function serializeStructureJson(
  project: ProjectDocument,
  resolveDefinition?: StructureJsonDefinitionResolver,
): string {
  return serializeStructureJsonValue(structureJsonFromProject(project, resolveDefinition));
}

export function serializeStructureJsonValue(value: StructureJson): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function decorationToStructureJson(decoration: PlacedDecoration): StructureJsonDecoration {
  if (decoration.kind === 'painting')
    return {
      kind: 'painting',
      anchor: decoration.anchor,
      facing: decoration.facing as StructureJsonPainting['facing'],
      variantId: decoration.variantId ?? 'minecraft:kebab',
    };
  return {
    kind: decoration.kind,
    anchor: decoration.anchor,
    facing: decoration.facing,
    ...(decoration.item ? { item: toStructureJsonItem(decoration.item) } : {}),
    ...(decoration.rotation === undefined ? {} : { rotation: decoration.rotation }),
    ...(decoration.invisible === undefined ? {} : { invisible: decoration.invisible }),
    ...(decoration.fixed === undefined ? {} : { fixed: decoration.fixed }),
    ...(decoration.itemDropChance === undefined
      ? {}
      : { itemDropChance: decoration.itemDropChance }),
  };
}

function toStructureJsonBlock(
  block: PlacedBlock,
  resolveDefinition?: StructureJsonDefinitionResolver,
): StructureJsonBlock {
  const state = Object.fromEntries(
    Object.entries(block.state).sort(([left], [right]) => compareStrings(left, right)),
  );
  const blockEntity = blockEntityToStructureJson(
    block.blockEntityData,
    block.id,
    resolveDefinition?.(block.id),
  );
  return {
    id: block.id,
    x: block.position.x,
    y: block.position.y,
    z: block.position.z,
    ...(Object.keys(state).length ? { state } : {}),
    ...(blockEntity ? { blockEntity } : {}),
  };
}

function compareBlocks(left: PlacedBlock, right: PlacedBlock): number {
  return (
    left.position.x - right.position.x ||
    left.position.y - right.position.y ||
    left.position.z - right.position.z ||
    compareStrings(left.id, right.id) ||
    compareStrings(JSON.stringify(left.state), JSON.stringify(right.state))
  );
}

function compareDecorations(left: PlacedDecoration, right: PlacedDecoration): number {
  return (
    left.anchor.x - right.anchor.x ||
    left.anchor.y - right.anchor.y ||
    left.anchor.z - right.anchor.z ||
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.facing, right.facing) ||
    compareStrings(
      left.variantId ?? left.item?.id ?? '',
      right.variantId ?? right.item?.id ?? '',
    ) ||
    (left.rotation ?? 0) - (right.rotation ?? 0)
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
