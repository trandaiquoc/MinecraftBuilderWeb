import * as THREE from 'three';
import { VoxelCoordinate } from '../../domain/project.types';
import { RetainableProvider } from '../provider/provider-refresh-coordinator';
import { FluidChunkDiagnostics, FluidChunkRecord, FluidChunkRenderer, FluidChunkSyncResult, FluidChunkVisualProvider } from './fluid-chunk-renderer';
import { FluidWorldLookup } from './fluid-state';

export interface FluidLifecycleDiagnostics extends FluidChunkDiagnostics {
  readonly fluidDetectedVoxels: number;
  readonly fluidPendingVoxels: number;
  readonly fluidCommittedVoxels: number;
  readonly fluidOrphanedLogicalCount: number;
  readonly fluidProviderTransitions: number;
  readonly fluidProviderEquivalentTransitions: number;
  readonly fluidProviderRemeshTransitions: number;
  readonly fluidProviderTransitionPreservedChunks: number;
  readonly fluidProviderTransitionRebuiltChunks: number;
  readonly fluidProviderTransitionFallbackVoxels: number;
}

export interface FluidLifecycleCallbacks {
  readonly onTerminal: (hydrationGeneration: number, keys: readonly string[]) => void;
}

/** Owns fluid claim, provider handoff, stale generations, and hydration terminal state. */
export class FluidRenderCoordinator {
  private provider?: FluidChunkVisualProvider;
  private providerLease?: RetainableProvider;
  private readonly retiredProviderLeases = new Set<RetainableProvider>();
  private readonly detected = new Map<string, FluidChunkRecord>();
  private pending = new Set<string>();
  private committed = new Set<string>();
  private fallback = new Set<string>();
  private syncGeneration = 0;
  private providerTransitions = 0;
  private equivalentTransitions = 0;
  private remeshTransitions = 0;
  private preservedChunks = 0;
  private rebuiltChunks = 0;
  private transitionFallbackVoxels = 0;
  private transitionRebuildBaseline = 0;
  private trackingTransitionRebuild = false;

  constructor(private readonly renderer: FluidChunkRenderer, private readonly callbacks: FluidLifecycleCallbacks) {}

  setProvider(provider: FluidChunkVisualProvider | undefined, lease?: RetainableProvider): void {
    const previous = this.provider;
    if (previous?.contractKey === provider?.contractKey && provider) {
      if (this.providerLease && this.providerLease !== lease && this.renderer.diagnostics().fluidChunks > 0) this.retiredProviderLeases.add(this.providerLease);
      this.provider = provider;
      this.providerLease = lease;
      this.renderer.setProvider(provider);
      this.equivalentTransitions += previous ? 1 : 0;
      return;
    }
    this.providerTransitions += previous || provider ? 1 : 0;
    if (previous && provider) {
      this.remeshTransitions += 1;
      this.preservedChunks += this.renderer.diagnostics().fluidChunks;
      this.transitionRebuildBaseline = this.renderer.diagnostics().fluidChunkRebuilds;
      this.trackingTransitionRebuild = true;
      if (this.providerLease && this.providerLease !== lease) this.retiredProviderLeases.add(this.providerLease);
      this.pending = new Set(this.detected.keys());
      this.committed.clear();
      this.fallback.clear();
    }
    if (previous && !provider && this.providerLease) this.retiredProviderLeases.add(this.providerLease);
    this.provider = provider;
    this.providerLease = lease;
    this.renderer.setProvider(provider);
    if (!provider) {
      this.detected.clear();
      this.pending.clear(); this.committed.clear(); this.fallback.clear();
      this.retiredProviderLeases.clear();
      this.syncGeneration += 1;
    }
  }

  sync(records: readonly FluidChunkRecord[], world: FluidWorldLookup, hydrationGeneration: number, changedPositions?: readonly VoxelCoordinate[]): Promise<void> {
    const generation = ++this.syncGeneration;
    const next = new Map(records.map((record) => [keyOf(record), record] as const));
    this.detected.clear();
    for (const [key, record] of next) this.detected.set(key, record);
    this.pending = this.provider ? new Set(next.keys()) : new Set();
    this.committed = new Set();
    this.fallback = new Set();
    if (!this.provider) return Promise.resolve();
    return this.renderer.sync(records, world, changedPositions).then((result) => {
      if (generation !== this.syncGeneration || result.status === 'stale') return;
      this.applyResult(result, hydrationGeneration, generation);
    }, () => {
      if (generation !== this.syncGeneration) return;
      this.pending = new Set(next.keys());
    });
  }

  claimedKeys(): ReadonlySet<string> { return new Set(this.detected.keys()); }
  isClaimed(key: string): boolean { return this.detected.has(key); }
  objectsForVoxel(key: string): readonly THREE.Object3D[] { return this.renderer.objectsForVoxel(key); }
  hasVoxel(key: string): boolean { return this.renderer.hasVoxel(key); }
  referencedProviders(): ReadonlySet<RetainableProvider> { return this.retiredProviderLeases; }

  diagnostics(): FluidLifecycleDiagnostics {
    const base = this.renderer.diagnostics();
    const terminal = this.committed.size + this.fallback.size;
    const orphaned = Math.max(0, this.detected.size - this.pending.size - terminal);
    return {
      ...base,
      fluidDetectedVoxels: this.detected.size,
      fluidPendingVoxels: this.pending.size,
      fluidCommittedVoxels: this.committed.size,
      fluidOrphanedLogicalCount: orphaned,
      fluidFallbackVoxels: this.fallback.size,
      fluidProviderTransitions: this.providerTransitions,
      fluidProviderEquivalentTransitions: this.equivalentTransitions,
      fluidProviderRemeshTransitions: this.remeshTransitions,
      fluidProviderTransitionPreservedChunks: this.preservedChunks,
      fluidProviderTransitionRebuiltChunks: this.rebuiltChunks,
      fluidProviderTransitionFallbackVoxels: this.transitionFallbackVoxels,
    };
  }

  clear(): void {
    this.syncGeneration += 1;
    this.detected.clear(); this.pending.clear(); this.committed.clear(); this.fallback.clear();
    this.retiredProviderLeases.clear();
    this.renderer.clear();
  }

  dispose(): void { this.clear(); this.renderer.dispose(); }

  private applyResult(result: FluidChunkSyncResult, hydrationGeneration: number, generation: number): void {
    if (generation !== this.syncGeneration || result.status !== 'committed') return;
    this.fallback = new Set(result.fallbackKeys);
    this.committed = new Set(result.committedKeys.filter((key) => !this.fallback.has(key)));
    this.pending = new Set([...this.detected.keys()].filter((key) => !this.committed.has(key) && !this.fallback.has(key)));
    const rebuilds = this.renderer.diagnostics().fluidChunkRebuilds;
    if (this.trackingTransitionRebuild) {
      this.rebuiltChunks += Math.max(0, rebuilds - this.transitionRebuildBaseline);
      this.transitionRebuildBaseline = rebuilds;
      this.trackingTransitionRebuild = false;
    }
    this.transitionFallbackVoxels += this.fallback.size;
    if (this.pending.size === 0) this.retiredProviderLeases.clear();
    if (this.committed.size || this.fallback.size) this.callbacks.onTerminal(hydrationGeneration, [...new Set([...this.committed, ...this.fallback])]);
  }
}

function keyOf(record: FluidChunkRecord): string { return `${record.block.position.x},${record.block.position.y},${record.block.position.z}`; }
