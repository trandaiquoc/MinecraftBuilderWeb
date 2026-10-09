import type { BlockVisualProvider } from './block-visual-provider-contract';
import type { BlockHydrationJob, HydrationWorldContext, HydratedBlockVisualResult } from './block-representation-contracts';
import { BlockRepresentationCommitOwner } from './block-representation-commit-owner';
import type { ViewportBlockRepresentationStore } from '../engine/viewport-block-representation-store';
import { disposeObject } from '../presentation/renderer-resource-disposal';

export type { BlockHydrationJob, HydratedBlockVisualResult, HydrationWorldContext } from './block-representation-contracts';

export interface BlockRepresentationHydrationOwnerPorts {
  readonly store: ViewportBlockRepresentationStore;
  readonly provider: () => BlockVisualProvider | undefined;
  readonly providerGeneration: () => number;
  readonly resolve: {
    readonly reusableKey: (provider: BlockVisualProvider, block: BlockHydrationJob['block'], world: HydrationWorldContext) => string | undefined;
    readonly visual: (provider: BlockVisualProvider, block: BlockHydrationJob['block'], world: HydrationWorldContext) => Promise<HydratedBlockVisualResult>;
    readonly terrain: (key: string, block: BlockHydrationJob['block'], world: HydrationWorldContext, provider: BlockVisualProvider) => Promise<HydratedBlockVisualResult>;
  };
  readonly commit: BlockRepresentationCommitOwner;
  readonly invalidateDiagnostics: () => void;
  readonly releaseRetiredProviders: () => void;
}

/** Owns only async provider/generation/revision coordination for representations. */
export class BlockRepresentationHydrationOwner {
  private readonly activeProviderReferences = new Map<BlockVisualProvider, number>();
  private disposed = false;

  constructor(private readonly ports: BlockRepresentationHydrationOwnerPorts) {}

  hasActiveProviderReference(provider: BlockVisualProvider): boolean { return (this.activeProviderReferences.get(provider) ?? 0) > 0; }
  activeProviderReferenceCount(provider: BlockVisualProvider): number { return this.activeProviderReferences.get(provider) ?? 0; }

  /** Acquires one logical lease for a provider-backed async operation. */
  acquireProviderReference(provider: BlockVisualProvider): () => void {
    this.activeProviderReferences.set(provider, (this.activeProviderReferences.get(provider) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (this.activeProviderReferences.get(provider) ?? 0) - 1;
      if (count > 0) this.activeProviderReferences.set(provider, count);
      else this.activeProviderReferences.delete(provider);
      this.ports.releaseRetiredProviders();
    };
  }

  /** Stops new work while allowing in-flight leases to reach their terminal cleanup. */
  dispose(): void {
    this.disposed = true;
    this.ports.releaseRetiredProviders();
  }

  refresh(job: BlockHydrationJob, onComplete?: () => void): void {
    this.ports.invalidateDiagnostics();
    if (this.disposed) { this.complete(onComplete); return; }
    const entry = this.ports.store.get(job.key);
    const provider = this.ports.provider();
    if (!entry || !provider) { this.complete(onComplete); return; }
    const finish = this.beginOperation(provider, onComplete);
    try {
      const generation = this.ports.providerGeneration();
      const revision = this.ports.store.incrementRevision(job.key) ?? entry.revision;
      const reusableKey = this.ports.resolve.reusableKey(provider, job.block, job.worldContext);
      const request = job.surfaceFastPathEligible && reusableKey
        ? this.ports.resolve.terrain(reusableKey, job.block, job.worldContext, provider)
        : this.ports.resolve.visual(provider, job.block, job.worldContext);
      void Promise.resolve(request).then((visual) => {
        if (!this.isCurrent(job.key, revision, provider, generation)) {
          this.disposeStaleVisual(visual);
          return;
        }
        return this.ports.commit.commitRefresh(job, visual, reusableKey, provider);
      }).catch((error: unknown) => {
        if (!this.isCurrent(job.key, revision, provider, generation)) return;
        this.ports.commit.recordRefreshFailure(job, error);
      }).finally(finish.done);
    } catch (error: unknown) {
      finish.abort();
      throw error;
    }
  }

  create(job: BlockHydrationJob, onComplete?: () => void): void {
    if (!job.layerPrewarm) this.ports.invalidateDiagnostics();
    if (this.disposed) { this.complete(onComplete); return; }
    const provider = this.ports.provider();
    const finish = this.beginOperation(provider, onComplete);
    try {
      this.ports.commit.begin(job, provider);
      const providerAvailable = !!provider && job.block.kind !== 'missing';
      const reusableKey = providerAvailable ? this.ports.resolve.reusableKey(provider!, job.block, job.worldContext) : undefined;
      const cached = this.ports.commit.tryCached(job, providerAvailable, reusableKey);
      if (cached === true) { finish.done(); return; }
      if (cached) {
        void Promise.resolve(cached).catch((error: unknown) => this.ports.commit.failCached(job, error)).finally(finish.done);
        return;
      }
      const pending = this.ports.commit.beginAsync(job, reusableKey);
      if (!pending || !provider) { finish.done(); return; }
      const generation = this.ports.providerGeneration();
      const request = job.surfaceFastPathEligible && reusableKey
        ? this.ports.resolve.terrain(reusableKey, job.block, job.worldContext, provider)
        : this.ports.resolve.visual(provider, job.block, job.worldContext);
      void Promise.resolve(request).then((visual) => {
        if (!this.isCurrent(job.key, pending.revision, provider, generation) || pending.fallback.parent === null) {
          this.disposeStaleVisual(visual);
          return;
        }
        return this.ports.commit.commitCreate(job, visual, reusableKey, pending.fallback, pending.staticAllowed);
      }).catch((error: unknown) => {
        if (!this.isCurrent(job.key, pending.revision, provider, generation)) return;
        this.ports.commit.fail(job, pending.fallback, error);
      }).finally(finish.done);
    } catch (error: unknown) {
      finish.abort();
      throw error;
    }
  }

  private isCurrent(key: string, revision: number, provider: BlockVisualProvider, generation: number): boolean {
    return !this.disposed && provider === this.ports.provider() && generation === this.ports.providerGeneration() && this.ports.store.get(key)?.revision === revision;
  }

  private complete(onComplete?: () => void): void {
    try { onComplete?.(); } catch { /* Completion is bookkeeping and must not strand hydration. */ }
  }

  private beginOperation(provider: BlockVisualProvider | undefined, onComplete?: () => void): { readonly done: () => void; readonly abort: () => void } {
    const release = provider ? this.acquireProviderReference(provider) : undefined;
    let terminal = false;
    const releaseOnly = (): void => {
      if (terminal) return;
      terminal = true;
      release?.();
    };
    return {
      done: () => {
        if (terminal) return;
        terminal = true;
        release?.();
        this.complete(onComplete);
      },
      abort: releaseOnly,
    };
  }

  private disposeStaleVisual(visual: HydratedBlockVisualResult): void {
    if (visual.object) disposeObject(visual.object);
  }
}
