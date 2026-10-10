import type { TerrainRepresentationCommitCallbacks, TerrainSettlement } from './terrain-render-contracts';

/** Owns terminal hydration accounting and deferred block-representation commits for terrain chunks. */
export class TerrainHydrationSettlementOwner {
  private generation = 0;
  private readonly failedKeys = new Set<string>();
  private readonly waiters = new Map<number, Array<(result: TerrainSettlement) => void>>();
  private readonly candidatesByChunk = new Map<string, Set<string>>();
  private readonly commitsByChunk = new Map<string, Map<string, TerrainRepresentationCommitCallbacks>>();
  private readonly commitChunkByKey = new Map<string, string>();

  get pendingCandidateCount(): number {
    let count = 0;
    for (const candidates of this.candidatesByChunk.values()) count += candidates.size;
    return count;
  }
  get pendingCandidateChunkCount(): number { return this.candidatesByChunk.size; }

  whenSettled(isReady: () => boolean): Promise<TerrainSettlement> {
    if (isReady()) return Promise.resolve(this.result());
    const generation = this.generation;
    return new Promise((resolve) => {
      const waiters = this.waiters.get(generation) ?? [];
      waiters.push(resolve);
      this.waiters.set(generation, waiters);
    });
  }

  beginBatch(): void {
    this.resolveCurrent({ status: 'cancelled', failedKeys: [] });
    this.generation += 1;
    this.failedKeys.clear();
  }

  cancel(): void {
    this.resolveCurrent({ status: 'cancelled', failedKeys: [] });
    this.generation += 1;
    this.failedKeys.clear();
  }

  result(): TerrainSettlement {
    return { status: this.failedKeys.size ? 'failed' : 'settled', failedKeys: [...this.failedKeys] };
  }

  reportFailures(keys: readonly string[]): void { for (const key of keys) this.failedKeys.add(key); }

  notifyIfReady(isReady: () => boolean): void {
    if (!isReady()) return;
    const waiters = this.waiters.get(this.generation);
    if (!waiters?.length) return;
    this.waiters.delete(this.generation);
    const result = this.result();
    for (const resolve of waiters) resolve(result);
  }

  retainHydrationCandidates(chunkKey: string, candidates: readonly string[]): readonly string[] {
    const pending = this.candidatesByChunk.get(chunkKey) ?? new Set<string>();
    for (const candidate of candidates) pending.add(candidate);
    if (pending.size) this.candidatesByChunk.set(chunkKey, pending);
    return [...pending];
  }

  completeHydrationCandidates(chunkKey: string, candidates: readonly string[], represented: readonly string[]): void {
    const pending = this.candidatesByChunk.get(chunkKey);
    if (!pending) return;
    const representedKeys = new Set(represented);
    for (const candidate of candidates) if (representedKeys.has(candidate)) pending.delete(candidate);
    if (!pending.size) this.candidatesByChunk.delete(chunkKey);
  }

  clearHydrationCandidates(chunkKey: string): void { this.candidatesByChunk.delete(chunkKey); }
  clearHydrationCandidatesForAllChunks(): void { this.candidatesByChunk.clear(); }

  registerRepresentationCommit(chunkKey: string, key: string, callbacks: TerrainRepresentationCommitCallbacks): void {
    const pending = this.commitsByChunk.get(chunkKey) ?? new Map<string, TerrainRepresentationCommitCallbacks>();
    pending.set(key, callbacks);
    this.commitsByChunk.set(chunkKey, pending);
    this.commitChunkByKey.set(key, chunkKey);
  }

  settleRepresentationCommits(chunkKey: string, representedKeys: readonly string[], failedKeys: readonly string[], failureStatus: 'failed' | 'cancelled'): void {
    const pending = this.commitsByChunk.get(chunkKey);
    if (!pending) return;
    for (const key of representedKeys) this.finishRepresentationCommit(pending, key, 'committed');
    for (const key of failedKeys) this.finishRepresentationCommit(pending, key, failureStatus);
    if (!pending.size) this.commitsByChunk.delete(chunkKey);
  }

  cancelRepresentationCommit(key: string): void {
    const chunkKey = this.commitChunkByKey.get(key);
    if (!chunkKey) return;
    const pending = this.commitsByChunk.get(chunkKey);
    const callbacks = pending?.get(key);
    if (!pending || !callbacks) {
      this.commitChunkByKey.delete(key);
      return;
    }
    pending.delete(key);
    this.commitChunkByKey.delete(key);
    if (!pending.size) this.commitsByChunk.delete(chunkKey);
    this.invokeFailure(callbacks, 'cancelled');
  }

  cancelRepresentationCommits(): void {
    for (const key of [...this.commitChunkByKey.keys()]) this.cancelRepresentationCommit(key);
  }

  private resolveCurrent(result: TerrainSettlement): void {
    const waiters = this.waiters.get(this.generation);
    if (waiters) for (const resolve of waiters) resolve(result);
    this.waiters.delete(this.generation);
  }

  private finishRepresentationCommit(pending: Map<string, TerrainRepresentationCommitCallbacks>, key: string, status: 'committed' | 'failed' | 'cancelled'): void {
    const callbacks = pending.get(key);
    if (!callbacks) return;
    pending.delete(key);
    this.commitChunkByKey.delete(key);
    if (status === 'committed') {
      try { callbacks.onCommitted(); } catch { /* A consumer callback is terminal even when its owner throws. */ }
    } else {
      this.invokeFailure(callbacks, status);
    }
  }

  private invokeFailure(callbacks: TerrainRepresentationCommitCallbacks, status: 'failed' | 'cancelled'): void {
    try { callbacks.onFailed(status); } catch { /* Continue settling sibling callbacks for the same chunk. */ }
  }
}
