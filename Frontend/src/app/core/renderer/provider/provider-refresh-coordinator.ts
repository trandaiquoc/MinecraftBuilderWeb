export interface RetainableProvider {
  retain?(): void;
  release?(): void;
}

export interface ProviderRefreshReleaseState<P> {
  readonly referenced: (provider: P) => boolean;
  readonly queued: (provider: P) => boolean;
}

/** Owns provider generations and retirement lifetime during incremental handoff. */
export class ProviderRefreshCoordinator<P extends RetainableProvider> {
  private readonly retired = new Set<P>();
  private currentGeneration = 0;

  get generation(): number { return this.currentGeneration; }
  get retiredProviders(): ReadonlySet<P> { return new Set(this.retired); }
  hasRetired(provider: P): boolean { return this.retired.has(provider); }

  transition(previous: P | undefined, next: P | undefined): number {
    if (next && !this.retired.has(next)) next.retain?.();
    if (previous) this.retired.add(previous);
    if (next) this.retired.delete(next);
    this.currentGeneration += 1;
    return this.currentGeneration;
  }

  releaseUnused(state: ProviderRefreshReleaseState<P>): void {
    for (const provider of [...this.retired]) {
      if (state.referenced(provider) || state.queued(provider)) continue;
      provider.release?.();
      this.retired.delete(provider);
    }
  }

  clear(): void {
    for (const provider of this.retired) provider.release?.();
    this.retired.clear();
  }
}
