/** Small, renderer-independent grouping primitive for signature-scoped terrain work. */
export interface TerrainSignatureCandidate {
  readonly reusableKey: string;
}

export function groupTerrainCandidates<T extends TerrainSignatureCandidate>(candidates: readonly T[]): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.reusableKey) ?? [];
    group.push(candidate);
    groups.set(candidate.reusableKey, group);
  }
  return groups;
}
