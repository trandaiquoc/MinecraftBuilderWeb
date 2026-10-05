/**
 * Pure ownership adoption helpers used when a renderer generation changes.
 * A generation owns accounting; the renderer owns the committed representation.
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
