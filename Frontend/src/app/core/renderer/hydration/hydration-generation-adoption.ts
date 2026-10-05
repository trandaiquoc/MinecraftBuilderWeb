/**
 * Pure ownership filter used when a new hydration generation observes an
 * already-rendered logical structure.
 */
export interface HydrationAdoptionCandidate {
  readonly key: string;
  readonly signature: string;
  readonly committedSignature?: string;
  readonly visible: boolean;
  readonly committed: boolean;
}

export function adoptCommittedHydrationKeys(candidates: readonly HydrationAdoptionCandidate[]): readonly string[] {
  return candidates
    .filter((candidate) => candidate.visible && candidate.committed && candidate.committedSignature === candidate.signature)
    .map((candidate) => candidate.key);
}
