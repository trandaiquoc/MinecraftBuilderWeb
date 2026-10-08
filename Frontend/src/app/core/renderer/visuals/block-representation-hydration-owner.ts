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
  private readonly activeProviders = new Set<BlockVisualProvider>();

  constructor(private readonly ports: BlockRepresentationHydrationOwnerPorts) {}

  hasActiveProviderReference(provider: BlockVisualProvider): boolean { return this.activeProviders.has(provider); }

  refresh(job: BlockHydrationJob, onComplete?: () => void): void {
    this.ports.invalidateDiagnostics();
    const entry = this.ports.store.get(job.key);
    const provider = this.ports.provider();
    if (!entry || !provider) { this.complete(onComplete); return; }
    const generation = this.ports.providerGeneration();
    this.activeProviders.add(provider);
    const revision = this.ports.store.incrementRevision(job.key) ?? entry.revision;
    const reusableKey = this.ports.resolve.reusableKey(provider, job.block, job.worldContext);
    const request = job.surfaceFastPathEligible && reusableKey
      ? this.ports.resolve.terrain(reusableKey, job.block, job.worldContext, provider)
      : this.ports.resolve.visual(provider, job.block, job.worldContext);
    void request.then((visual) => {
      if (!this.isCurrent(job.key, revision, provider, generation)) {
        if (visual.object) disposeObject(visual.object);
        return;
      }
      return this.ports.commit.commitRefresh(job, visual, reusableKey, provider);
    }).catch((error: unknown) => {
      if (!this.isCurrent(job.key, revision, provider, generation)) return;
      this.ports.commit.recordRefreshFailure(job, error);
    }).finally(() => { this.activeProviders.delete(provider); this.complete(onComplete); });
  }

  create(job: BlockHydrationJob, onComplete?: () => void): void {
    this.ports.invalidateDiagnostics();
    const provider = this.ports.provider();
    this.ports.commit.begin(job, provider);
    const providerAvailable = !!provider && job.block.kind !== 'missing';
    const reusableKey = providerAvailable ? this.ports.resolve.reusableKey(provider!, job.block, job.worldContext) : undefined;
    const cached = this.ports.commit.tryCached(job, providerAvailable, reusableKey);
    if (cached === true) { this.complete(onComplete); return; }
    if (cached) { void cached.finally(() => this.complete(onComplete)); return; }
    const pending = this.ports.commit.beginAsync(job, reusableKey);
    if (!pending || !provider) { this.complete(onComplete); return; }
    const generation = this.ports.providerGeneration();
    const request = job.surfaceFastPathEligible && reusableKey
      ? this.ports.resolve.terrain(reusableKey, job.block, job.worldContext, provider)
      : this.ports.resolve.visual(provider, job.block, job.worldContext);
    this.activeProviders.add(provider);
    void request.then((visual) => {
      if (!this.isCurrent(job.key, pending.revision, provider, generation) || pending.fallback.parent === null) {
        if (visual.object) disposeObject(visual.object);
        return;
      }
      return this.ports.commit.commitCreate(job, visual, reusableKey, pending.fallback, pending.staticAllowed);
    }).catch((error: unknown) => {
      if (!this.isCurrent(job.key, pending.revision, provider, generation)) return;
      this.ports.commit.fail(job, pending.fallback, error);
    }).finally(() => { this.activeProviders.delete(provider); this.complete(onComplete); });
  }

  private isCurrent(key: string, revision: number, provider: BlockVisualProvider, generation: number): boolean {
    return provider === this.ports.provider() && generation === this.ports.providerGeneration() && this.ports.store.get(key)?.revision === revision;
  }

  private complete(onComplete?: () => void): void {
    onComplete?.();
    this.ports.releaseRetiredProviders();
  }
}
