import type { BlockBehavior, BlockItemEvidence } from '../blocks/catalog/block-definition.types';

export type MinecraftContentKind =
  | 'world-block'
  | 'block-backed-item'
  | 'logical-block-item'
  | 'internal-block'
  | 'technical-block'
  | 'decoration-entity'
  | 'item-only'
  | 'unknown';

export type ContentClassificationProvenance = 'authoritative-registry' | 'target-resource' | 'common-java-semantic' | 'logical-rule' | 'inferred' | 'unknown';

export interface ContentClassification {
  readonly kind: MinecraftContentKind;
  readonly placeable: boolean;
  readonly provenance: ContentClassificationProvenance;
  readonly worldBlock: boolean;
  readonly item: boolean;
  readonly internal: boolean;
  readonly technical: boolean;
  readonly decoration: boolean;
}

const DECORATION_IDS = new Set(['minecraft:item_frame', 'minecraft:glow_item_frame', 'minecraft:painting']);
const TECHNICAL_IDS = new Set([
  'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:end_portal', 'minecraft:end_gateway', 'minecraft:nether_portal',
  'minecraft:piston_head', 'minecraft:moving_piston', 'minecraft:bubble_column', 'minecraft:fire', 'minecraft:soul_fire', 'minecraft:frosted_ice',
  'minecraft:command_block', 'minecraft:chain_command_block', 'minecraft:repeating_command_block', 'minecraft:jigsaw', 'minecraft:structure_block',
  'minecraft:structure_void', 'minecraft:barrier', 'minecraft:light',
]);

export function classifyContent(input: { readonly id: string; readonly namespace?: string; readonly hasWorldBlock?: boolean; readonly hasItemEvidence?: boolean; readonly logical?: boolean; readonly authoritative?: boolean; readonly internal?: boolean }): ContentClassification {
  const id = input.id;
  const worldBlock = input.hasWorldBlock === true;
  const item = input.hasItemEvidence === true;
  const decoration = DECORATION_IDS.has(id);
  const technical = TECHNICAL_IDS.has(id);
  const internal = input.internal === true || isInternalBlockId(id);
  const result = (kind: MinecraftContentKind, placeable: boolean, provenance: ContentClassificationProvenance): ContentClassification => ({ kind, placeable, provenance, worldBlock, item, internal, technical, decoration });
  if (decoration) return result('decoration-entity', false, 'common-java-semantic');
  if (technical) return result('technical-block', false, 'common-java-semantic');
  if (internal) return result('internal-block', false, 'common-java-semantic');
  if (input.logical) return result('logical-block-item', true, 'logical-rule');
  if (worldBlock && item) return result('block-backed-item', true, input.authoritative ? 'authoritative-registry' : 'target-resource');
  if (worldBlock) return result('world-block', false, input.authoritative ? 'authoritative-registry' : 'target-resource');
  if (item) return result('item-only', false, 'target-resource');
  return result('unknown', false, 'unknown');
}

export function isDecorationEntityId(id: string): boolean { return DECORATION_IDS.has(id); }
export function isTechnicalBlockId(id: string): boolean { return TECHNICAL_IDS.has(id); }
export function vanillaTechnicalBlockIds(): readonly string[] { return [...TECHNICAL_IDS]; }
export function isVanillaInternalBlockId(id: string): boolean {
  if (!id.startsWith('minecraft:')) return false;
  const name = id.split(':').at(-1) ?? id;
  return name.startsWith('potted_') || name.endsWith('_crop') || name.endsWith('_wall_sign') || name.endsWith('_wall_hanging_sign')
    || name.endsWith('_wall_head') || name.endsWith('_wall_skull') || name.endsWith('_wall_torch') || name.endsWith('_wall_banner') || name.endsWith('_wall_fan');
}

export function isInternalBlockId(id: string): boolean { return isVanillaInternalBlockId(id); }

export function classifyBlockDefinition(definition: { readonly id: string; readonly namespace?: string; readonly itemEvidence?: BlockItemEvidence; readonly behavior?: BlockBehavior }): ContentClassification {
  const logical = (definition.behavior?.kind === 'paired-horizontal' || definition.behavior?.kind === 'double-height') && definition.itemEvidence?.placeable === true;
  return classifyContent({ id: definition.id, namespace: definition.namespace, hasWorldBlock: true, hasItemEvidence: !!definition.itemEvidence, logical, authoritative: definition.itemEvidence?.sourceFormat === 'authoritative-registry' });
}
