import * as THREE from 'three';
import { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import { RetainableProvider } from '../provider/provider-refresh-coordinator';
import { FluidChunkRenderer, type FluidChunkDiagnostics } from './fluid-chunk-renderer';
import type { FluidChunkChange, FluidChunkRecord, FluidChunkSyncResult, FluidChunkVisualProvider, FluidLayerPresentation } from './fluid-render-contracts';
import { FluidRenderResolver, FluidWorldLookup } from './fluid-state';

export interface ProjectionFluidEntry {
  readonly block: PlacedBlock;
  readonly signature: string;
  readonly role: 'normal' | 'reference' | 'missing';
}

export interface ProjectionFluidChange {
  readonly before?: ProjectionFluidEntry;
  readonly after?: ProjectionFluidEntry;
  readonly position: VoxelCoordinate;
}

export interface ProjectionFluidDeltaPlan {
  readonly changes: readonly FluidChunkChange[];
  readonly afterKeys: ReadonlySet<string>;
  readonly visitedBlocks: number;
}

export interface FluidLifecycleDiagnostics extends FluidChunkDiagnostics {
  readonly fluidDetectedVoxels: number;
  readonly fluidPendingVoxels: number;
  readonly fluidCommittedVoxels: number;
  readonly fluidOrphanedLogicalCount: number;
  readonly fluidFailedVoxels: number;
  readonly fluidProviderTransitions: number;
  readonly fluidProviderEquivalentTransitions: number;
  readonly fluidProviderRemeshTransitions: number;
  readonly fluidProviderTransitionPreservedChunks: number;
  readonly fluidProviderTransitionRebuiltChunks: number;
  readonly fluidProviderTransitionFallbackVoxels: number;
}

export interface FluidLifecycleCallbacks {
  readonly onTerminal: (hydrationGeneration: number, keys: readonly string[]) => void;
  readonly onFailure?: (hydrationGeneration: number, keys: readonly string[], error: unknown) => void;
}

/** Owns fluid claim, provider handoff, stale generations, and hydration terminal state. */
export class FluidRenderCoordinator {
  private providerLease?: RetainableProvider;
  private readonly retiredProviderLeases = new Set<RetainableProvider>();
  private detectedKeys = new Set<string>();
  private pending = new Set<string>();
  private committed = new Set<string>();
  private fallback = new Set<string>();
  private failed = new Set<string>();
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

  /** Resolves only the changed projection entries; representation-store commits remain with the viewport transaction. */
  prepareProjectionDelta(changes: ReadonlyMap<string, ProjectionFluidChange>, resolver: FluidRenderResolver, world: FluidWorldLookup): ProjectionFluidDeltaPlan {
    const fluidChanges: FluidChunkChange[] = [];
    const afterKeys = new Set<string>();
    for (const [key, change] of changes) {
      const beforeState = change.before && resolver.resolve(change.before.block, world);
      const afterState = change.after && resolver.resolve(change.after.block, world);
      const before = beforeState ? { block: change.before!.block, state: beforeState, role: change.before!.role === 'reference' ? 'reference' as const : 'normal' as const } : undefined;
      const after = afterState ? { block: change.after!.block, state: afterState, role: change.after!.role === 'reference' ? 'reference' as const : 'normal' as const } : undefined;
      if (after) afterKeys.add(key);
      if (before || after) fluidChanges.push({ position: change.position, before, after });
    }
    return { changes: fluidChanges, afterKeys, visitedBlocks: changes.size };
  }

  setProvider(provider: FluidChunkVisualProvider | undefined, lease?: RetainableProvider): void {
    const previous = this.renderer.providerSnapshot();
    if (previous?.contractKey === provider?.contractKey && provider) {
      if (this.providerLease && this.providerLease !== lease && this.renderer.diagnostics().fluidChunks > 0) this.retiredProviderLeases.add(this.providerLease);
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
      this.pending = new Set(this.detectedKeys);
      this.committed.clear();
      this.fallback.clear();
      this.failed.clear();
    }
    if (previous && !provider && this.providerLease) this.retiredProviderLeases.add(this.providerLease);
    this.providerLease = lease;
    this.renderer.setProvider(provider);
    if (!provider) {
      this.detectedKeys.clear();
      this.pending.clear(); this.committed.clear(); this.fallback.clear(); this.failed.clear();
      this.retiredProviderLeases.clear();
      this.syncGeneration += 1;
    }
  }

  sync(records: readonly FluidChunkRecord[], world: FluidWorldLookup, hydrationGeneration: number, changedPositions?: readonly VoxelCoordinate[]): Promise<void> {
    const generation = ++this.syncGeneration;
    const next = new Map(records.map((record) => [keyOf(record), record] as const));
    this.detectedKeys = new Set(next.keys());
    this.pending = this.renderer.providerSnapshot() ? new Set(next.keys()) : new Set();
    this.committed = new Set();
    this.fallback = new Set();
    this.failed.clear();
    if (!this.renderer.providerSnapshot()) return Promise.resolve();
    return this.renderer.sync(records, world, changedPositions).then((result) => {
      if (generation !== this.syncGeneration || result.status === 'stale') return;
      this.applyResult(result, hydrationGeneration, generation);
    }, (error: unknown) => {
      if (generation !== this.syncGeneration) return;
      this.pending.clear();
      this.failed = new Set(next.keys());
      this.callbacks.onFailure?.(hydrationGeneration, [...this.failed], error);
    });
  }

  /** Local edit path. Unchanged fluid ownership remains committed. */
  syncDelta(changes: readonly FluidChunkChange[], changedPositions: readonly VoxelCoordinate[], world: FluidWorldLookup, hydrationGeneration: number): Promise<void> {
    const generation = ++this.syncGeneration;
    const changedKeys = new Set<string>();
    for (const change of changes) {
      const key = keyOfPosition(change.after?.block.position ?? change.before?.block.position ?? change.position);
      changedKeys.add(key);
      if (change.after) {
        this.detectedKeys.add(key);
        this.pending.add(key); this.committed.delete(key); this.fallback.delete(key);
        this.failed.delete(key);
      } else {
        this.detectedKeys.delete(key);
        this.pending.delete(key); this.committed.delete(key); this.fallback.delete(key);
        this.failed.delete(key);
      }
    }
    if (!this.renderer.providerSnapshot()) return Promise.resolve();
    return this.renderer.syncDelta(changes, changedPositions, world).then((result) => {
      if (generation !== this.syncGeneration || result.status === 'stale') return;
      this.applyDeltaResult(result, hydrationGeneration, generation, changedKeys);
    }, (error: unknown) => {
      if (generation !== this.syncGeneration) return;
      for (const key of changedKeys) if (this.detectedKeys.has(key)) {
        this.pending.delete(key);
        this.failed.add(key);
      }
      this.callbacks.onFailure?.(hydrationGeneration, [...changedKeys].filter((key) => this.failed.has(key)), error);
    });
  }

  claimedKeys(): ReadonlySet<string> { return new Set(this.detectedKeys); }
  isClaimed(key: string): boolean { return this.detectedKeys.has(key); }
  isTerminal(key: string): boolean { return this.committed.has(key) || this.fallback.has(key); }
  objectsForVoxel(key: string): readonly THREE.Object3D[] { return this.renderer.objectsForVoxel(key); }
  hasVoxel(key: string): boolean { return this.renderer.hasVoxel(key); }
  recordsForKeys(keys: ReadonlySet<string>): readonly FluidChunkRecord[] { return this.renderer.recordsForKeys(keys); }
  providerSnapshot(): FluidChunkVisualProvider | undefined { return this.renderer.providerSnapshot(); }
  get logicalRecordCount(): number { return this.renderer.logicalRecordCount; }
  get pendingCount(): number { return this.pending.size; }
  get failedCount(): number { return this.failed.size; }
  get fallbackCount(): number { return this.fallback.size; }
  get layeredPresentationReady(): boolean { return this.renderer.layeredPresentationReady; }
  setLayerPresentation(presentation: FluidLayerPresentation | undefined): void { this.renderer.setLayerPresentation(presentation); }
  referencedProviders(): ReadonlySet<RetainableProvider> { return this.retiredProviderLeases; }

  diagnostics(): FluidLifecycleDiagnostics {
    const base = this.renderer.diagnostics();
    const terminal = this.committed.size + this.fallback.size;
    const orphaned = Math.max(0, this.detectedKeys.size - this.pending.size - terminal);
    return {
      ...base,
      fluidDetectedVoxels: this.detectedKeys.size,
      fluidPendingVoxels: this.pending.size,
      fluidCommittedVoxels: this.committed.size,
      fluidOrphanedLogicalCount: orphaned,
      fluidFailedVoxels: this.failed.size,
      fluidFallbackVoxels: this.fallback.size,
      fluidProviderTransitions: this.providerTransitions,
      fluidProviderEquivalentTransitions: this.equivalentTransitions,
      fluidProviderRemeshTransitions: this.remeshTransitions,
      fluidProviderTransitionPreservedChunks: this.preservedChunks,
      fluidProviderTransitionRebuiltChunks: this.rebuiltChunks,
      fluidProviderTransitionFallbackVoxels: this.transitionFallbackVoxels,
    };
  }

  /** O(1) lifecycle counters for the high-frequency viewport trace sample. */
  lightDiagnostics(): Readonly<Record<string, unknown>> {
    const terminal = this.committed.size + this.fallback.size;
    return {
      ...this.renderer.lightDiagnostics(),
      fluidDetectedVoxels: this.detectedKeys.size,
      fluidPendingVoxels: this.pending.size,
      fluidCommittedVoxels: this.committed.size,
      fluidOrphanedLogicalCount: Math.max(0, this.detectedKeys.size - this.pending.size - terminal),
      fluidFailedVoxels: this.failed.size,
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
    this.detectedKeys.clear(); this.pending.clear(); this.committed.clear(); this.fallback.clear(); this.failed.clear();
    this.retiredProviderLeases.clear();
    this.renderer.clear();
  }

  dispose(): void { this.clear(); this.renderer.dispose(); }

  private applyResult(result: FluidChunkSyncResult, hydrationGeneration: number, generation: number): void {
    if (generation !== this.syncGeneration || result.status === 'stale') return;
    if (result.status === 'unavailable') {
      const failed = [...this.pending];
      this.pending.clear();
      this.failed = new Set(failed);
      if (failed.length) this.callbacks.onFailure?.(hydrationGeneration, failed, new Error('Fluid renderer became unavailable before committing its visuals.'));
      return;
    }
    this.fallback = new Set(result.fallbackKeys);
    this.committed = new Set(result.committedKeys.filter((key) => !this.fallback.has(key)));
    const terminal = new Set([...this.committed, ...this.fallback]);
    const failed = [...this.detectedKeys].filter((key) => !terminal.has(key));
    this.failed = new Set(failed);
    this.pending.clear();
    const rebuilds = this.renderer.diagnostics().fluidChunkRebuilds;
    if (this.trackingTransitionRebuild) {
      this.rebuiltChunks += Math.max(0, rebuilds - this.transitionRebuildBaseline);
      this.transitionRebuildBaseline = rebuilds;
      this.trackingTransitionRebuild = false;
    }
    this.transitionFallbackVoxels += this.fallback.size;
    if (this.pending.size === 0) this.retiredProviderLeases.clear();
    if (this.committed.size || this.fallback.size) this.callbacks.onTerminal(hydrationGeneration, [...new Set([...this.committed, ...this.fallback])]);
    if (failed.length) this.callbacks.onFailure?.(hydrationGeneration, failed, new Error('Fluid renderer completed without committing every detected voxel.'));
  }

  private applyDeltaResult(result: FluidChunkSyncResult, hydrationGeneration: number, generation: number, changedKeys: ReadonlySet<string>): void {
    if (generation !== this.syncGeneration || result.status === 'stale') return;
    if (result.status === 'unavailable') {
      const failed = [...changedKeys].filter((key) => this.detectedKeys.has(key));
      for (const key of failed) { this.pending.delete(key); this.failed.add(key); }
      if (failed.length) this.callbacks.onFailure?.(hydrationGeneration, failed, new Error('Fluid renderer became unavailable before committing changed visuals.'));
      return;
    }
    const fallback = new Set(result.fallbackKeys);
    for (const key of result.committedKeys) {
      this.pending.delete(key);
      this.failed.delete(key);
      if (fallback.has(key)) { this.fallback.add(key); this.committed.delete(key); }
      else { this.committed.add(key); this.fallback.delete(key); }
    }
    for (const key of changedKeys) if (!this.detectedKeys.has(key)) {
      this.pending.delete(key); this.committed.delete(key); this.fallback.delete(key);
    }
    const failed = [...changedKeys].filter((key) => this.detectedKeys.has(key) && !this.committed.has(key) && !this.fallback.has(key));
    for (const key of failed) { this.pending.delete(key); this.failed.add(key); }
    const terminal = result.committedKeys.filter((key) => fallback.has(key));
    const committed = result.committedKeys.filter((key) => !fallback.has(key));
    if (terminal.length || committed.length) this.callbacks.onTerminal(hydrationGeneration, [...new Set([...terminal, ...committed])]);
    if (failed.length) this.callbacks.onFailure?.(hydrationGeneration, failed, new Error('Fluid renderer completed without committing changed voxel visuals.'));
  }
}

function keyOf(record: FluidChunkRecord): string { return `${record.block.position.x},${record.block.position.y},${record.block.position.z}`; }
function keyOfPosition(position: VoxelCoordinate): string { return `${position.x},${position.y},${position.z}`; }
