import * as THREE from 'three';
import type { CompiledInstanceTemplates, InstancePartTemplate } from '../batching/instance-template-cache';
import type { SurfaceFaceMembership, SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { RenderedBlockEntry, ViewportBlockRepresentationStore } from '../engine/viewport-block-representation-store';
import type { VisibleBlockProjectionEntry } from '../engine/y-layer-projection-coordinator';
import type { BlockRepresentationResourceOwner } from './block-representation-resource-owner';
import type { BlockHydrationJob, HydratedBlockVisualResult } from './block-representation-contracts';
import type { BlockVisualProvider } from './block-visual-provider-contract';
import { disposeObject } from '../presentation/renderer-resource-disposal';
import type { TerrainRepresentationCommitCallbacks, TerrainRepresentationCommitStatus } from '../terrain/chunk-surface-renderer';

type CommitBlock = BlockHydrationJob['block'];

interface SurfaceRepresentationTarget {
  readonly memberships: readonly SurfaceFaceMembership[];
  readonly object?: THREE.Object3D;
}

interface InstanceRepresentationTarget {
  readonly batchKey: string;
  readonly index: number;
  readonly object?: THREE.Object3D;
}

export interface BlockRepresentationRenderTargets {
  readonly terrain: {
    readonly templatesFor: (key: string) => readonly SurfaceFaceTemplate[] | undefined;
    readonly cacheTemplates: (key: string, templates: readonly SurfaceFaceTemplate[]) => void;
    readonly chunkKey: (position: CommitBlock['position']) => string;
    readonly add: (block: CommitBlock, key: string, templates: readonly SurfaceFaceTemplate[], role: 'normal' | 'reference', callbacks?: TerrainRepresentationCommitCallbacks) => TerrainRepresentationCommitStatus;
    readonly remove: (key: string) => void;
  };
  readonly surface: {
    readonly templatesFor: (key: string) => readonly SurfaceFaceTemplate[] | undefined;
    readonly cacheTemplates: (key: string, templates: readonly SurfaceFaceTemplate[]) => void;
    readonly add: (block: CommitBlock, key: string, templates: readonly SurfaceFaceTemplate[], visible: ReadonlyMap<string, VisibleBlockProjectionEntry>, role: 'normal' | 'reference') => SurfaceRepresentationTarget | undefined;
  };
  readonly instances: {
    readonly shouldAttempt: (allowInstancing: boolean, reusableKey: string | undefined) => boolean;
    readonly templateFor: (key: string) => CompiledInstanceTemplates | undefined;
    readonly decisionFor: (key: string) => ReturnType<StaticModelBatchRenderer['decisionFor']>;
    readonly add: (object: THREE.Object3D, block: CommitBlock, key: string, reusableKey: string | undefined, source: 'provider-async' | 'cached-template', role: 'normal' | 'reference') => InstanceRepresentationTarget | undefined;
    readonly addFromTemplates: (templates: readonly InstancePartTemplate[], block: CommitBlock, key: string, source: 'provider-async' | 'cached-template', compiled: CompiledInstanceTemplates, role: 'normal' | 'reference') => InstanceRepresentationTarget | undefined;
  };
  readonly object: {
    readonly blocksGroup: THREE.Group;
    readonly parentFor?: (block: CommitBlock) => THREE.Group;
    readonly release?: (object: THREE.Object3D | undefined) => void;
    readonly applyBrightness: (object: THREE.Object3D) => void;
    readonly applyReferenceOpacity: (object: THREE.Object3D, opacity: number) => void;
    readonly familyFromReusableKey: (key: string | undefined) => string | undefined;
    readonly extractSurfaceTemplates: (object: THREE.Object3D) => readonly SurfaceFaceTemplate[] | undefined;
  };
}

export interface BlockRepresentationCommitOwnerPorts {
  readonly store: ViewportBlockRepresentationStore;
  readonly resources: Pick<BlockRepresentationResourceOwner, 'createFallback' | 'releaseRepresentation' | 'removePlaceholder' | 'rollbackPartial' | 'removeOrphanedInstanceMemberships' | 'releasePreviousAfterReplacement' | 'clear' | 'dispose' | 'clearPlaceholders' | 'reconcileInstances' | 'setPresentationVisible'>;
  readonly targets: BlockRepresentationRenderTargets;
  readonly lifecycle: {
    readonly finished: (job: BlockHydrationJob | undefined, succeeded: boolean) => void;
    readonly refreshFailed: (key: string) => void;
    readonly cachedTemplateInserted: () => void;
  };
}

/**
 * Owns synchronous representation transitions. Async generation/revision
 * ownership deliberately stays in BlockRepresentationHydrationOwner.
 */
export class BlockRepresentationCommitOwner {
  constructor(private readonly ports: BlockRepresentationCommitOwnerPorts) {}

  publish(entry: RenderedBlockEntry): void { this.ports.store.createOrReplace(entry); }

  updateBlock(key: string, block: CommitBlock): boolean { return this.ports.store.setBlock(key, block); }

  updateProvider(key: string, provider: BlockVisualProvider | undefined): boolean { return this.ports.store.setProvider(key, provider); }

  beginAsyncRevision(key: string): number | undefined { return this.ports.store.incrementRevision(key); }

  setFallback(entry: RenderedBlockEntry, fallback: THREE.Mesh): boolean { return this.ports.store.setFallback(entry.key, fallback); }

  setTerrainMembership(key: string, chunkKey: string | undefined, reusableVisualKey?: string): boolean {
    return this.ports.store.setTerrainRepresentation(key, chunkKey, reusableVisualKey);
  }

  setFluidRepresentation(key: string, chunkKey: string | undefined, fallback?: boolean): boolean {
    return this.ports.store.setFluidRepresentation(key, chunkKey, fallback);
  }

  setSurfaceMemberships(key: string, memberships: readonly SurfaceFaceMembership[] | undefined): boolean {
    return this.ports.store.setSurfaceMemberships(key, memberships);
  }

  setSurfaceObject(key: string, memberships: readonly SurfaceFaceMembership[], object: THREE.Object3D | undefined): boolean {
    return this.ports.store.setSurfaceObject(key, memberships, object);
  }

  detachFluidClaim(key: string): boolean {
    if (this.ports.store.get(key)?.fluidChunkKey === undefined) return false;
    return this.ports.store.remove(key);
  }

  remove(key: string, entry = this.ports.store.get(key)): void {
    if (!entry) {
      this.ports.resources.removeOrphanedInstanceMemberships(key, 'reconcile');
      return;
    }
    const removalRevision = this.ports.store.incrementRevision(entry.key);
    if (removalRevision === undefined) return;
    this.ports.resources.releaseRepresentation(key, entry);
    this.ports.store.removeIfRevision(key, removalRevision);
  }

  setPresentationVisible(key: string, entry: RenderedBlockEntry, visible: boolean): boolean {
    if (!this.ports.resources.setPresentationVisible(key, entry, visible)) return false;
    this.ports.store.setPresentationVisible(key, visible);
    return true;
  }

  recordInstanceMembershipChange(key: string, batchKey: string | undefined, index: number | undefined, object: THREE.Object3D | undefined): void {
    this.ports.store.setInstanceMembership(key, { batchKey, index, object });
  }

  ensureFallback(entry: RenderedBlockEntry, referenceOpacity = .28): THREE.Mesh {
    const fallback = this.ports.resources.createFallback(entry, referenceOpacity);
    this.ports.store.setFallback(entry.key, fallback);
    return fallback;
  }

  removeOrphanedInstanceMemberships(key: string, source: 'rollback' | 'reconcile', entry?: RenderedBlockEntry): void {
    this.ports.resources.removeOrphanedInstanceMemberships(key, source, entry);
  }

  rollbackPartial(key: string): void {
    this.ports.resources.rollbackPartial(key, this.ports.store.get(key));
  }

  reconcileInstances(): void { this.ports.resources.reconcileInstances(this.ports.store); }

  clear(): void {
    this.ports.resources.clear(this.ports.store.values());
    this.ports.store.clear();
  }

  dispose(): void {
    this.ports.resources.dispose(this.ports.store.values());
    this.ports.store.clear();
  }

  clearPlaceholders(): void { this.ports.resources.clearPlaceholders(); }

  begin(job: BlockHydrationJob, provider?: BlockVisualProvider): RenderedBlockEntry {
    const existing = this.ports.store.get(job.key);
    if (existing) this.remove(job.key, existing);
    else this.ports.resources.removeOrphanedInstanceMemberships(job.key, 'reconcile');
    this.ports.resources.removePlaceholder(job.key);
    const entry: RenderedBlockEntry = { key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider };
    this.ports.store.createOrReplace(entry);
    return this.ports.store.get(job.key) ?? entry;
  }

  tryCached(job: BlockHydrationJob, providerAvailable: boolean, reusableKey: string | undefined): boolean | Promise<void> {
    if (!providerAvailable || !reusableKey) return false;
    const entry = this.ports.store.get(job.key);
    if (!entry) return false;
    const cachedEntry = entry;
    const role = job.role === 'reference' ? 'reference' : 'normal';
    const terrain = job.surfaceFastPathEligible ? this.ports.targets.terrain.templatesFor(reusableKey) : undefined;
    if (terrain) {
      let resolvePending: (() => void) | undefined;
      const pending = new Promise<void>((resolve) => { resolvePending = resolve; });
      const status = this.ports.targets.terrain.add(job.block, job.key, terrain, role, {
        onCommitted: () => {
          if (this.ports.store.get(job.key) !== cachedEntry) { resolvePending?.(); return; }
          this.ports.store.setTerrainRepresentation(job.key, this.ports.targets.terrain.chunkKey(job.block.position), reusableKey);
          this.finish(job);
          resolvePending?.();
        },
        onFailed: () => {
          if (this.ports.store.get(job.key) !== cachedEntry) { resolvePending?.(); return; }
          const current = this.ports.store.get(job.key);
          if (current) this.ensureFallback(current);
          this.ports.store.setTerrainRepresentation(job.key, undefined);
          this.finish(job, false);
          resolvePending?.();
        },
      });
      if (status === 'committed') {
        resolvePending = undefined;
        this.ports.store.setTerrainRepresentation(job.key, this.ports.targets.terrain.chunkKey(job.block.position), reusableKey);
        this.finish(job);
        return true;
      }
      if (status === 'pending') return pending;
    }
    const surface = job.surfaceFastPathEligible ? this.ports.targets.surface.templatesFor(reusableKey) : undefined;
    if (surface) {
      const target = this.ports.targets.surface.add(job.block, job.key, surface, job.surfaceVisibleEntries, role);
      if (target) {
        this.ports.store.setSurfaceObject(job.key, target.memberships, target.object);
        this.finish(job);
        return true;
      }
    }
    const compiled = !job.surfaceFastPathEligible ? this.ports.targets.instances.templateFor(reusableKey) : undefined;
    if (compiled && this.ports.targets.instances.shouldAttempt(job.allowInstancing, reusableKey)) {
      const instance = this.ports.targets.instances.addFromTemplates(compiled.templates, job.block, job.key, 'cached-template', compiled, role);
      if (instance) {
        this.ports.lifecycle.cachedTemplateInserted();
        this.ports.store.setInstanceMembership(job.key, instance);
        this.ports.store.setStaticModel(job.key, { attempted: true, decision: this.ports.targets.instances.decisionFor(job.key), family: this.ports.targets.object.familyFromReusableKey(reusableKey) });
        this.finish(job);
        return true;
      }
    }
    return false;
  }

  beginAsync(job: BlockHydrationJob, reusableKey: string | undefined): { readonly entry: RenderedBlockEntry; readonly fallback: THREE.Mesh; readonly revision: number; readonly staticAllowed: boolean } | undefined {
    const entry = this.ports.store.get(job.key);
    if (!entry) return undefined;
    const staticAllowed = job.role !== 'missing' && this.ports.targets.instances.shouldAttempt(job.allowInstancing || job.surfaceFastPathEligible, reusableKey);
    this.ports.store.setStaticModel(job.key, { attempted: staticAllowed, family: this.ports.targets.object.familyFromReusableKey(reusableKey) });
    const fallback = this.ensureFallback(entry, job.options.referenceOpacity);
    const revision = this.ports.store.incrementRevision(job.key) ?? entry.revision;
    return { entry, fallback, revision, staticAllowed };
  }

  commitCreate(job: BlockHydrationJob, visual: HydratedBlockVisualResult, reusableKey: string | undefined, fallback: THREE.Mesh, staticAllowed: boolean): void | Promise<void> {
    const transactionRevision = this.ports.store.get(job.key)?.revision;
    const ownsTransaction = (): boolean => this.ports.store.get(job.key)?.revision === transactionRevision;
    if (!visual.object && visual.terrainTemplates && reusableKey) {
      this.ports.targets.terrain.cacheTemplates(reusableKey, visual.terrainTemplates);
      const settle = (resolve: () => void): TerrainRepresentationCommitCallbacks => ({
        onCommitted: () => {
          try {
            if (!ownsTransaction()) return;
            this.ports.store.setTerrainRepresentation(job.key, this.ports.targets.terrain.chunkKey(job.block.position), reusableKey);
            this.releaseObject(fallback);
            this.finish(job);
          } finally { resolve(); }
        },
        onFailed: () => {
          try {
            if (!ownsTransaction()) return;
            this.updateFallback(fallback, visual);
            this.finish(job, false);
          } finally { resolve(); }
        },
      });
      let resolvePending!: () => void;
      const pending = new Promise<void>((resolve) => { resolvePending = resolve; });
      const status = this.ports.targets.terrain.add(job.block, job.key, visual.terrainTemplates, job.role === 'reference' ? 'reference' : 'normal', settle(() => resolvePending()));
      if (status === 'committed') {
        this.ports.store.setTerrainRepresentation(job.key, this.ports.targets.terrain.chunkKey(job.block.position), reusableKey);
        this.releaseObject(fallback);
        this.finish(job);
        return;
      }
      if (status === 'pending') return pending;
    }
    if (!visual.object) {
      this.updateFallback(fallback, visual);
      return;
    }
    const object = this.prepareObject(visual.object, job, visual);
    let terrainCompiled = false;
    let surfaceTarget: SurfaceRepresentationTarget | undefined;
    if (job.surfaceFastPathEligible && reusableKey) {
      const cachedTerrain = this.ports.targets.terrain.templatesFor(reusableKey);
      const templates = visual.terrainTemplates ?? this.ports.targets.object.extractSurfaceTemplates(object);
      if (templates) {
        if (!cachedTerrain) this.ports.targets.terrain.cacheTemplates(reusableKey, templates);
        const terrainStatus = this.ports.targets.terrain.add(job.block, job.key, templates, job.role === 'reference' ? 'reference' : 'normal');
        if (terrainStatus === 'pending') {
          // A provider object is already available. Abandon a pending terrain
          // promotion so the object path remains the single committed owner.
          this.ports.targets.terrain.remove(job.key);
          terrainCompiled = false;
        } else {
          terrainCompiled = terrainStatus === 'committed';
        }
        if (!cachedTerrain) {
          const cachedSurface = this.ports.targets.surface.templatesFor(reusableKey);
          if (!cachedSurface) this.ports.targets.surface.cacheTemplates(reusableKey, templates);
          surfaceTarget = this.ports.targets.surface.add(job.block, job.key, cachedSurface ?? templates, job.surfaceVisibleEntries, job.role === 'reference' ? 'reference' : 'normal');
        }
      }
    }
    const instance = !terrainCompiled && surfaceTarget === undefined && staticAllowed
      ? this.ports.targets.instances.add(object, job.block, job.key, reusableKey, 'provider-async', job.role === 'reference' ? 'reference' : 'normal')
      : undefined;
    this.releaseObject(fallback);
    if (terrainCompiled) {
      this.ports.store.setTerrainRepresentation(job.key, this.ports.targets.terrain.chunkKey(job.block.position), reusableKey);
      disposeObject(object);
    } else if (surfaceTarget !== undefined) {
      this.ports.store.setSurfaceObject(job.key, surfaceTarget.memberships, surfaceTarget.object);
      disposeObject(object);
    } else if (instance) {
      this.ports.store.setInstanceMembership(job.key, instance);
      this.ports.store.setStaticModel(job.key, { decision: this.ports.targets.instances.decisionFor(job.key) });
      disposeObject(object);
    } else {
      if (job.role === 'reference') this.ports.targets.object.applyReferenceOpacity(object, job.options.referenceOpacity ?? .28);
      (this.ports.targets.object.parentFor?.(job.block) ?? this.ports.targets.object.blocksGroup).add(object);
      this.ports.store.setObject(job.key, object);
      this.ports.store.setStaticModel(job.key, { decision: this.ports.targets.instances.decisionFor(job.key) });
    }
    this.finish(job);
  }

  commitRefresh(job: BlockHydrationJob, visual: HydratedBlockVisualResult, reusableKey: string | undefined, provider: BlockVisualProvider): void | Promise<void> {
    const current = this.ports.store.get(job.key);
    if (!current) return;
    const transactionRevision = current.revision;
    const ownsTransaction = (): boolean => this.ports.store.get(job.key)?.revision === transactionRevision;
    if (!visual.object && visual.terrainTemplates && reusableKey) {
      let resolvePending: (() => void) | undefined;
      const pending = new Promise<void>((resolve) => { resolvePending = resolve; });
      const commit = (): void => {
        try {
          if (!ownsTransaction()) return;
          this.ports.targets.terrain.cacheTemplates(reusableKey, visual.terrainTemplates!);
          this.ports.resources.releasePreviousAfterReplacement(job.key, current, 'terrain');
          this.ports.store.createOrReplace({ key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider, reusableVisualKey: reusableKey, terrainChunkKey: this.ports.targets.terrain.chunkKey(job.block.position) });
          this.finish(job);
        } finally { resolvePending?.(); }
      };
      const fail = (status: 'failed' | 'cancelled'): void => {
        try {
          if (!ownsTransaction()) return;
          const fallback = current.fallback ?? this.ensureFallback(current);
          this.ports.store.setTerrainRepresentation(job.key, undefined);
          fallback.userData['diagnostics'] = [{ code: 'PROVIDER_REFRESH_FAILED', message: status === 'cancelled' ? 'Terrain replacement was cancelled' : 'Terrain replacement failed' }];
          this.ports.lifecycle.refreshFailed(job.key);
          this.finish(job, false);
        } finally { resolvePending?.(); }
      };
      const status = this.ports.targets.terrain.add(job.block, job.key, visual.terrainTemplates, job.role === 'reference' ? 'reference' : 'normal', { onCommitted: commit, onFailed: fail });
      if (status === 'committed') {
        resolvePending = undefined;
        commit();
        return;
      }
      if (status === 'pending') return pending;
    }
    if (!visual.object) {
      this.recordRefreshFailure(job, 'Visual provider returned no replacement representation');
      this.finish(job, false);
      return;
    }
    const object = this.prepareObject(visual.object, job, visual);
    const staticAllowed = job.role !== 'missing' && this.ports.targets.instances.shouldAttempt(job.allowInstancing || job.surfaceFastPathEligible, reusableKey);
    const instance = staticAllowed ? this.ports.targets.instances.add(object, job.block, job.key, reusableKey, 'provider-async', job.role === 'reference' ? 'reference' : 'normal') : undefined;
    const base = { key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider, reusableVisualKey: reusableKey, staticModelAttempted: staticAllowed, staticModelFamily: this.ports.targets.object.familyFromReusableKey(reusableKey), staticModelDecision: this.ports.targets.instances.decisionFor(job.key) } as const;
    if (instance) {
      this.ports.resources.releasePreviousAfterReplacement(job.key, current, 'instance');
      this.ports.store.createOrReplace({ ...base, instanceBatchKey: instance.batchKey, instanceIndex: instance.index, object: instance.object });
      disposeObject(object);
    } else {
      if (job.role === 'reference') this.ports.targets.object.applyReferenceOpacity(object, job.options.referenceOpacity ?? .28);
      (this.ports.targets.object.parentFor?.(job.block) ?? this.ports.targets.object.blocksGroup).add(object);
      this.ports.resources.releasePreviousAfterReplacement(job.key, current, 'object');
      this.ports.store.createOrReplace({ ...base, object });
    }
    this.finish(job);
  }

  fail(job: BlockHydrationJob, fallback: THREE.Mesh, error: unknown): void {
    this.ports.resources.rollbackPartial(job.key, this.ports.store.get(job.key));
    fallback.userData['renderMode'] = 'fallback';
    fallback.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown visual provider error' }];
    this.finish(job, false);
  }

  /** Converts an unexpected cached-terrain rejection into the same fallback state as other provider failures. */
  failCached(job: BlockHydrationJob, error: unknown): void {
    const current = this.ports.store.get(job.key);
    if (!current) return;
    const fallback = current.fallback ?? this.ensureFallback(current);
    this.ports.store.setTerrainRepresentation(job.key, undefined);
    fallback.userData['renderMode'] = 'fallback';
    fallback.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : String(error) }];
    this.finish(job, false);
  }

  recordRefreshFailure(job: BlockHydrationJob, error: unknown): void {
    const current = this.ports.store.get(job.key);
    if (!current) return;
    const diagnostics = [{ code: 'PROVIDER_REFRESH_FAILED', message: error instanceof Error ? error.message : String(error) }];
    if (current.fallback) current.fallback.userData['diagnostics'] = diagnostics;
    if (current.object) current.object.userData['diagnostics'] = diagnostics;
    this.ports.lifecycle.refreshFailed(job.key);
  }

  private prepareObject(object: THREE.Object3D, job: BlockHydrationJob, visual: HydratedBlockVisualResult): THREE.Object3D {
    object.userData['realModel'] = true;
    this.ports.targets.object.applyBrightness(object);
    object.position.set(object.position.x + job.block.position.x, object.position.y + job.block.position.y, object.position.z + job.block.position.z);
    object.userData['voxel'] = job.block.position;
    object.userData['renderRole'] = job.role;
    object.userData['renderMode'] = visual.mode;
    object.userData['renderTrace'] = visual.trace;
    object.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics];
    object.traverse((child) => { child.userData['voxel'] = job.block.position; child.userData['renderRole'] = job.role; child.userData['realModel'] = true; });
    return object;
  }

  private updateFallback(fallback: THREE.Mesh, visual: HydratedBlockVisualResult): void {
    fallback.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics];
    fallback.userData['resolvedSupport'] = visual.resolved.support;
    fallback.userData['renderMode'] = visual.mode;
  }

  private releaseObject(object: THREE.Object3D): void {
    if (this.ports.targets.object.release) this.ports.targets.object.release(object);
    else this.ports.targets.object.blocksGroup.remove(object);
  }

  private finish(job?: BlockHydrationJob, succeeded = true): void {
    if (job?.layerPrewarm) return;
    this.ports.lifecycle.finished(job, succeeded);
  }
}
