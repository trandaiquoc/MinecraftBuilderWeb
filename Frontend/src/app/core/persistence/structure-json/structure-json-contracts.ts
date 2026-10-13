/** Public Structure JSON format and validation contracts. */

import type { VoxelCoordinate } from '../../domain/project.types';
import type { DecorationFacing } from '../../decorations/decoration.types';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';

export const STRUCTURE_JSON_FORMAT = 'the-block-laundromat-structure' as const;
export const LEGACY_STRUCTURE_JSON_FORMAT = 'minecraftbuilder-structure' as const;

export const LEGACY_STRUCTURE_JSON_VERSION = 2 as const;

export interface StructureJsonItem {
  readonly id: string;
  readonly count?: number;
  readonly components?: Readonly<Record<string, unknown>>;
}

export interface StructureJsonContainerItem {
  readonly slot: number;
  readonly item: StructureJsonItem;
}

export interface StructureJsonContainer {
  readonly kind: 'container';
  readonly items: readonly StructureJsonContainerItem[];
}

export interface StructureJsonPot {
  readonly kind: 'decorated-pot';
  readonly decorations: Readonly<{ back: string; left: string; right: string; front: string }>;
  readonly item?: StructureJsonItem;
}

export interface StructureJsonSignSide {
  readonly lines: readonly [string, string, string, string];
  readonly color: string;
  readonly glowing: boolean;
  readonly filteredMessages?: readonly [string, string, string, string];
}

export interface StructureJsonSign {
  readonly kind: 'sign';
  readonly front: StructureJsonSignSide;
  readonly back: StructureJsonSignSide;
  readonly waxed: boolean;
}

export type StructureJsonBlockEntity =
  StructureJsonContainer | StructureJsonPot | StructureJsonSign;

export interface StructureJsonBlock {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly state?: Readonly<Record<string, string>>;
  readonly blockEntity?: StructureJsonBlockEntity;
}

export interface StructureJsonPainting {
  readonly kind: 'painting';
  readonly anchor: VoxelCoordinate;
  readonly facing: 'north' | 'south' | 'east' | 'west';
  readonly variantId: string;
}

export interface StructureJsonFrame {
  readonly kind: 'item-frame' | 'glow-item-frame';
  readonly anchor: VoxelCoordinate;
  readonly facing: DecorationFacing;
  readonly item?: StructureJsonItem;
  readonly rotation?: number;
  readonly invisible?: boolean;
  readonly fixed?: boolean;
  readonly itemDropChance?: number;
}

export type StructureJsonDecoration = StructureJsonPainting | StructureJsonFrame;

export interface StructureJson {
  readonly format: typeof STRUCTURE_JSON_FORMAT;
  readonly minecraftVersion: string;
  readonly name?: string;
  readonly blocks: readonly StructureJsonBlock[];
  readonly decorations: readonly StructureJsonDecoration[];
}

export type StructureJsonDefinitionResolver = (id: string) => BlockDefinition | undefined;

export type StructureJsonValidationCode =
  | 'invalid-json'
  | 'shape'
  | 'format'
  | 'version'
  | 'minecraft-version'
  | 'blocks'
  | 'block'
  | 'block-entity'
  | 'decorations'
  | 'decoration';

export interface StructureJsonValidationResult {
  readonly valid: boolean;
  readonly code?: StructureJsonValidationCode;
  readonly path?: string;
}

export interface ParsedStructureJsonResult extends StructureJsonValidationResult {
  readonly value?: StructureJson;
}
