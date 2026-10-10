import type {
  ViewportVoxelOwnershipDiagnostic,
  VisibleSceneDiagnostics,
} from './viewport-diagnostics-contracts';

export function collectVisibleSceneDiagnostics(input: {
  readonly expectedKeys: readonly string[];
  readonly renderedKeys: Iterable<string>;
  readonly placeholderKeys: Iterable<string>;
  readonly pendingKeys: Iterable<string>;
}): VisibleSceneDiagnostics {
  const expected = new Set(input.expectedKeys);
  const renderedVoxelKeys = [...input.renderedKeys].filter((key) => expected.has(key));
  const placeholderVoxelKeys = [...input.placeholderKeys].filter((key) => expected.has(key));
  const pendingVoxelKeys = [...input.pendingKeys].filter((key) => expected.has(key));
  const representedVoxelKeys = [...new Set([...renderedVoxelKeys, ...placeholderVoxelKeys])];
  return {
    expectedVisibleVoxelCount: expected.size,
    renderedVoxelCount: renderedVoxelKeys.length,
    placeholderVoxelCount: placeholderVoxelKeys.length,
    pendingVoxelCount: pendingVoxelKeys.length,
    expectedVoxelKeys: [...expected],
    renderedVoxelKeys,
    placeholderVoxelKeys,
    pendingVoxelKeys,
    representedVoxelKeys,
  };
}

export function collectOwnershipDiagnostics(input: {
  readonly expectedKeys: ReadonlySet<string>;
  readonly renderedKeys: Iterable<string>;
  readonly placeholderKeys: Iterable<string>;
  readonly pendingSignatures: ReadonlyMap<string, string>;
  readonly queuedKeys: ReadonlySet<string>;
  readonly runningKeys: ReadonlyMap<string, number>;
}): readonly ViewportVoxelOwnershipDiagnostic[] {
  const renderedKeys = new Set(input.renderedKeys);
  const placeholderKeys = new Set(input.placeholderKeys);
  const keys = new Set([
    ...input.expectedKeys,
    ...renderedKeys,
    ...placeholderKeys,
    ...input.pendingSignatures.keys(),
    ...input.queuedKeys,
    ...input.runningKeys.keys(),
  ]);
  return [...keys].sort().map((coordinateKey) => ({
    coordinateKey,
    expectedVisible: input.expectedKeys.has(coordinateKey),
    renderedEntry: renderedKeys.has(coordinateKey),
    placeholderEntry: placeholderKeys.has(coordinateKey),
    ...(input.pendingSignatures.has(coordinateKey)
      ? { pendingSignature: input.pendingSignatures.get(coordinateKey) }
      : {}),
    queuedJob: input.queuedKeys.has(coordinateKey),
    ...(input.runningKeys.has(coordinateKey)
      ? { runningGeneration: input.runningKeys.get(coordinateKey) }
      : {}),
  }));
}
