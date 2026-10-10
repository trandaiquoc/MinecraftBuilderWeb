import type { ProjectSize, StructureMode } from './project.types';

export const DEFAULT_STRUCTURE_MODE: StructureMode = 'vanilla-structure-block';
export const VANILLA_STRUCTURE_BLOCK_MAX_AXIS = 48;
export const HUGE_STRUCTURE_BLOCKS_MAX_AXIS = 512;

export type StructureAxis = keyof ProjectSize;

export interface StructureSizePolicy {
  readonly dimensionsValid: boolean;
  readonly mode: StructureMode;
  readonly selectedModeLimit: number;
  readonly selectedModeValid: boolean;
  readonly selectedModeExceededAxes: readonly StructureAxis[];
  readonly exceedsVanilla: boolean;
  readonly fitsVanilla: boolean;
  readonly fitsHugeStructureBlocks: boolean;
  readonly recommendedMode?: StructureMode;
}

export function structureModeAxisLimit(mode: StructureMode): number {
  return mode === 'huge-structure-blocks'
    ? HUGE_STRUCTURE_BLOCKS_MAX_AXIS
    : VANILLA_STRUCTURE_BLOCK_MAX_AXIS;
}

/** Returns the only supported mode for a valid size, or undefined when it exceeds HSB. */
export function canonicalStructureModeForSize(size: ProjectSize): StructureMode | undefined {
  const policy = evaluateStructureSize(size);
  if (!policy.dimensionsValid || !policy.fitsHugeStructureBlocks) return undefined;
  return policy.fitsVanilla ? DEFAULT_STRUCTURE_MODE : 'huge-structure-blocks';
}

/** Repairs legacy mode metadata without changing unsupported dimensions. */
export function normalizeStructureModeForSize(
  size: ProjectSize,
  mode: StructureMode,
): StructureMode {
  return canonicalStructureModeForSize(size) ?? mode;
}

export function isStructureCreationAllowed(size: ProjectSize, mode: StructureMode): boolean {
  const policy = evaluateStructureSize(size, mode);
  return (
    policy.dimensionsValid &&
    (policy.fitsVanilla || (mode === 'huge-structure-blocks' && policy.fitsHugeStructureBlocks))
  );
}

export function effectiveStructureModeForSize(
  size: ProjectSize,
  selectedMode: StructureMode,
  autoUseHuge: boolean,
): StructureMode {
  const policy = evaluateStructureSize(size);
  if (policy.fitsVanilla) return DEFAULT_STRUCTURE_MODE;
  if (autoUseHuge && policy.fitsHugeStructureBlocks) return 'huge-structure-blocks';
  return selectedMode;
}

export function evaluateStructureSize(
  size: ProjectSize,
  mode: StructureMode = DEFAULT_STRUCTURE_MODE,
): StructureSizePolicy {
  const axes: readonly StructureAxis[] = ['x', 'y', 'z'];
  const dimensionsValid = axes.every((axis) => Number.isInteger(size[axis]) && size[axis] >= 1);
  const selectedModeLimit = structureModeAxisLimit(mode);
  const selectedModeExceededAxes = axes.filter(
    (axis) => Number.isFinite(size[axis]) && size[axis] > selectedModeLimit,
  );
  const fitsVanilla =
    dimensionsValid && axes.every((axis) => size[axis] <= VANILLA_STRUCTURE_BLOCK_MAX_AXIS);
  const fitsHugeStructureBlocks =
    dimensionsValid && axes.every((axis) => size[axis] <= HUGE_STRUCTURE_BLOCKS_MAX_AXIS);
  return {
    dimensionsValid,
    mode,
    selectedModeLimit,
    selectedModeValid: dimensionsValid && selectedModeExceededAxes.length === 0,
    selectedModeExceededAxes,
    exceedsVanilla: dimensionsValid && !fitsVanilla,
    fitsVanilla,
    fitsHugeStructureBlocks,
    recommendedMode: !dimensionsValid
      ? undefined
      : fitsVanilla
        ? 'vanilla-structure-block'
        : fitsHugeStructureBlocks
          ? 'huge-structure-blocks'
          : undefined,
  };
}
