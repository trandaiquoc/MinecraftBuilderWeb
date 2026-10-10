import type { PlaceableItemDefinition } from '../../blocks/placement-palette/placeable-item.types';
import type { VoxelCoordinate } from '../../domain/project.types';
import type { StructureJson, StructureJsonDecoration } from './structure-json';
import type { ExternalAiContentLimits } from './external-ai-content-limits';

export type StructureJsonIssueCategory =
  'missing' | 'bounds' | 'state' | 'duplicate' | 'content-limit' | 'support' | 'warning';
export type StructureJsonIssueReason =
  | { readonly code: 'missing-block' }
  | { readonly code: 'out-of-bounds' }
  | { readonly code: 'unknown-state-property'; readonly property: string }
  | { readonly code: 'unsupported-state-value'; readonly property: string; readonly value: string }
  | { readonly code: 'invalid-block-entity'; readonly detail: string }
  | { readonly code: 'content-limit'; readonly restrictedId: string; readonly path?: string }
  | { readonly code: 'missing-support'; readonly detail?: string }
  | { readonly code: 'origin-offset'; readonly axis: 'x' | 'y' | 'z'; readonly value: number }
  | { readonly code: 'possible-floating'; readonly detail?: string }
  | { readonly code: 'tree-grounding'; readonly detail?: string };

export interface StructureJsonBlockIssue {
  readonly category: StructureJsonIssueCategory;
  readonly index: number;
  readonly id: string;
  readonly position: VoxelCoordinate;
  readonly reason: StructureJsonIssueReason;
  readonly property?: string;
  readonly value?: string;
}

export interface StructureJsonCoordinateConflict {
  readonly category: 'duplicate';
  readonly coordinate: VoxelCoordinate;
  readonly blockIndexes: readonly number[];
  readonly blockIds: readonly string[];
}

export type StructureJsonDecorationIssueCategory =
  'missing-asset' | 'bounds' | 'invalid' | 'conflict' | 'content-limit';
export interface StructureJsonDecorationIssue {
  readonly category: StructureJsonDecorationIssueCategory;
  readonly index: number;
  readonly kind: StructureJsonDecoration['kind'];
  readonly anchor: VoxelCoordinate;
  readonly reason: string;
  readonly restrictedId?: string;
  readonly path?: string;
}

export interface StructureJsonValidationPreview {
  readonly structuralValid: boolean;
  readonly structuralCode?: import('./structure-json').StructureJsonValidationCode;
  readonly parsed?: StructureJson;
  readonly totalBlocks: number;
  readonly validBlocks: number;
  readonly missingBlocks: number;
  readonly outOfBounds: number;
  readonly invalidStates: number;
  readonly duplicateCoordinates: number;
  readonly issues: Readonly<{
    readonly missing: readonly StructureJsonBlockIssue[];
    readonly bounds: readonly StructureJsonBlockIssue[];
    readonly state: readonly StructureJsonBlockIssue[];
    readonly duplicate: readonly StructureJsonCoordinateConflict[];
    readonly contentLimit: readonly StructureJsonBlockIssue[];
    readonly support: readonly StructureJsonBlockIssue[];
    readonly warning: readonly StructureJsonBlockIssue[];
  }>;
  readonly affectedDuplicateBlocks: number;
  readonly totalDecorations: number;
  readonly validDecorations: number;
  readonly missingDecorationAssets: number;
  readonly invalidDecorations: number;
  readonly decorationIssues: readonly StructureJsonDecorationIssue[];
}

export interface StructureJsonValidationOptions {
  readonly contentLimitsEnabled?: boolean;
  readonly contentLimits?: ExternalAiContentLimits;
  readonly placeableItems?: readonly PlaceableItemDefinition[];
}

export interface NormalizedValidationContentLimits {
  readonly enabled: boolean;
  readonly blocks: ReadonlySet<string>;
  readonly items: ReadonlySet<string>;
  readonly decorations: ReadonlySet<string>;
}

export interface StructureJsonValidationCancellation {
  readonly signal?: AbortSignal;
  readonly isCancelled?: () => boolean;
}

export interface StructureJsonWorkerRequest {
  readonly text: string;
}
export interface StructureJsonWorkerResponse {
  readonly ok: boolean;
  readonly result: import('./structure-json').ParsedStructureJsonResult;
}

export type MutableStructureJsonIssues = {
  missing: StructureJsonBlockIssue[];
  bounds: StructureJsonBlockIssue[];
  state: StructureJsonBlockIssue[];
  duplicate: StructureJsonCoordinateConflict[];
  contentLimit: StructureJsonBlockIssue[];
  support: StructureJsonBlockIssue[];
  warning: StructureJsonBlockIssue[];
};

export function emptyStructureJsonIssues(): MutableStructureJsonIssues {
  return {
    missing: [],
    bounds: [],
    state: [],
    duplicate: [],
    contentLimit: [],
    support: [],
    warning: [],
  };
}

export function emptyStructureJsonPreview(
  code?: import('./structure-json').StructureJsonValidationCode,
): StructureJsonValidationPreview {
  return {
    structuralValid: false,
    structuralCode: code,
    totalBlocks: 0,
    validBlocks: 0,
    missingBlocks: 0,
    outOfBounds: 0,
    invalidStates: 0,
    duplicateCoordinates: 0,
    affectedDuplicateBlocks: 0,
    issues: emptyStructureJsonIssues(),
    totalDecorations: 0,
    validDecorations: 0,
    missingDecorationAssets: 0,
    invalidDecorations: 0,
    decorationIssues: [],
  };
}
