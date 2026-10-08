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

type CommitBlock = BlockHydrationJob['block'];

export interface BlockRepresentationRenderTargets {
  readonly terrain: {
    readonly templatesFor: (key: string) => readonly SurfaceFaceTemplate[] | undefined;
    readonly cacheTemplates: (key: string, templates: readonly SurfaceFaceTemplate[]) => void;
    readonly chunkKey: (position: CommitBlock['position']) => string;
    readonly add: (block: CommitBlock, key: string, templates: readonly SurfaceFaceTemplate[], role: 'normal' | 'reference') => boolean;
  };
  readonly surface: {
    readonly templatesFor: (key: string) => readonly SurfaceFaceTemplate[] | undefined;
    readonly cacheTemplates: (key: string, templates: readonly SurfaceFaceTemplate[]) => void;
    readonly meshFor: (batchKey: string) => THREE.Object3D | undefined;
    readonly add: (block: CommitBlock, key: string, templates: readonly SurfaceFaceTemplate[], visible: ReadonlyMap<string, VisibleBlockProjectionEntry>) => readonly SurfaceFaceMembership[] | undefined;
  };
  readonly instances: {
    readonly shouldAttempt: (allowInstancing: boolean, reusableKey: string | undefined) => boolean;
    readonly templateFor: (key: string) => CompiledInstanceTemplates | undefined;
    readonly decisionFor: (key: string) => ReturnType<StaticModelBatchRenderer['decisionFor']>;
    readonly batches: ReadonlyMap<string, { readonly parts: readonly THREE.InstancedMesh[] }>;
    readonly add: (object: THREE.Object3D, block: CommitBlock, key: string, reusableKey: string | undefined, source: 'provider-async' | 'cached-template', role: 'normal' | 'reference') => { readonly batchKey: string; readonly index: number } | undefined;
    readonly addFromTemplates: (templates: readonly InstancePartTemplate[], block: CommitBlock, key: string, source: 'provider-async' | 'cached-template', compiled: CompiledInstanceTemplates, role: 'normal' | 'reference') => { readonly batchKey: string; readonly index: number } | undefined;
  };
  readonly object: {
    readonly blocksGroup: THREE.Group;
    readonly applyBrightness: (object: THREE.Object3D) => void;
    readonly applyReferenceOpacity: (object: THREE.Object3D, opacity: number) => void;
    readonly familyFromReusableKey: (key: string | undefined) => string | undefined;
    readonly familyFromVisual: (object: THREE.Object3D) => string | undefined;
    readonly extractSurfaceTemplates: (object: THREE.Object3D) => readonly SurfaceFaceTemplate[] | undefined;
  };
}

export interface BlockRepresentationCommitOwnerPorts {
  readonly store: ViewportBlockRepresentationStore;
  readonly resources: Pick<BlockRepresentationResourceOwner, 'ensureFallback' | 'remove' | 'removePlaceholder' | 'rollbackPartial' | 'removeOrphanedInstanceMemberships' | 'releasePreviousAfterReplacement'>;
  readonly targets: BlockRepresentationRenderTargets;
  readonly record: (metric: string, delta?: number) => void;
  readonly invalidateDiagnostics: () => void;
  readonly recordProviderCacheStats: () => void;
  readonly scheduleRender: () => void;
}

/**
 * Owns synchronous representation transitions. Async generation/revision
 * ownership deliberately stays in BlockRepresentationHydrationOwner.
 */
export class BlockRepresentationCommitOwner {
  constructor(private readonly ports: BlockRepresentationCommitOwnerPorts) {}

  begin(job: BlockHydrationJob, provider?: BlockVisualProvider): RenderedBlockEntry {
    const existing = this.ports.store.get(job.key);
    if (existing) this.ports.resources.remove(job.key, existing);
    else this.ports.resources.removeOrphanedInstanceMemberships(job.key, 'reconcile');
    this.ports.resources.removePlaceholder(job.key);
    const entry: RenderedBlockEntry = { key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider };
    this.ports.store.createOrReplace(entry);
    return this.ports.store.get(job.key) ?? entry;
  }

  tryCached(job: BlockHydrationJob, providerAvailable: boolean, reusableKey: string | undefined): boolean {
    if (!providerAvailable || !reusableKey) return false;
    const entry = this.ports.store.get(job.key);
    if (!entry) return false;
    const role = job.role === 'reference' ? 'reference' : 'normal';
    const terrain = job.surfaceFastPathEligible ? this.ports.targets.terrain.templatesFor(reusableKey) : undefined;
    if (terrain && this.ports.targets.terrain.add(job.block, job.key, terrain, role)) {
      this.ports.store.setTerrainRepresentation(job.key, this.ports.targets.terrain.chunkKey(job.block.position), reusableKey);
      this.finish();
      return true;
    }
    const surface = job.surfaceFastPathEligible ? this.ports.targets.surface.templatesFor(reusableKey) : undefined;
    if (surface) {
      const memberships = this.ports.targets.surface.add(job.block, job.key, surface, job.surfaceVisibleEntries);
      if (memberships) {
        this.ports.store.setSurfaceObject(job.key, memberships, memberships.length ? this.ports.targets.surface.meshFor(memberships[0].batchKey) : undefined);
        this.finish();
        return true;
      }
    }
    const compiled = !job.surfaceFastPathEligible ? this.ports.targets.instances.templateFor(reusableKey) : undefined;
    if (compiled && this.ports.targets.instances.shouldAttempt(job.allowInstancing, reusableKey)) {
      const instance = this.ports.targets.instances.addFromTemplates(compiled.templates, job.block, job.key, 'cached-template', compiled, role);
      if (instance) {
        this.ports.record('reusableTemplateCacheHits');
        this.ports.record('cachedTemplateInsertions');
        this.ports.store.setInstanceMembership(job.key, { batchKey: instance.batchKey, index: instance.index, object: this.ports.targets.instances.batches.get(instance.batchKey)?.parts[0] });
        this.ports.store.setStaticModel(job.key, { attempted: true, decision: this.ports.targets.instances.decisionFor(job.key), family: this.ports.targets.object.familyFromReusableKey(reusableKey) });
        this.finish();
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
    const fallback = this.ports.resources.ensureFallback(entry, job.options.referenceOpacity);
    const revision = this.ports.store.incrementRevision(job.key) ?? entry.revision;
    return { entry, fallback, revision, staticAllowed };
  }

  commitCreate(job: BlockHydrationJob, visual: HydratedBlockVisualResult, reusableKey: string | undefined, fallback: THREE.Mesh, staticAllowed: boolean): void {
    if (!visual.object && visual.terrainTemplates && reusableKey) {
      this.ports.targets.terrain.cacheTemplates(reusableKey, visual.terrainTemplates);
      if (this.ports.targets.terrain.add(job.block, job.key, visual.terrainTemplates, job.role === 'reference' ? 'reference' : 'normal')) {
        this.ports.store.setTerrainRepresentation(job.key, this.ports.targets.terrain.chunkKey(job.block.position), reusableKey);
        this.ports.targets.object.blocksGroup.remove(fallback);
        this.finish();
        return;
      }
    }
    if (!visual.object) {
      this.updateFallback(fallback, visual);
      return;
    }
    const object = this.prepareObject(visual.object, job, visual);
    let terrainCompiled = false;
    let surfaceMemberships: readonly SurfaceFaceMembership[] | undefined;
    if (job.surfaceFastPathEligible && reusableKey) {
      const cachedTerrain = this.ports.targets.terrain.templatesFor(reusableKey);
      const templates = visual.terrainTemplates ?? this.ports.targets.object.extractSurfaceTemplates(object);
      if (templates) {
        if (!cachedTerrain) this.ports.targets.terrain.cacheTemplates(reusableKey, templates);
        terrainCompiled = this.ports.targets.terrain.add(job.block, job.key, templates, job.role === 'reference' ? 'reference' : 'normal');
        if (!cachedTerrain) {
          const cachedSurface = this.ports.targets.surface.templatesFor(reusableKey);
          if (!cachedSurface) this.ports.targets.surface.cacheTemplates(reusableKey, templates);
          surfaceMemberships = this.ports.targets.surface.add(job.block, job.key, cachedSurface ?? templates, job.surfaceVisibleEntries);
        }
      }
    }
    const instance = !terrainCompiled && surfaceMemberships === undefined && staticAllowed
      ? this.ports.targets.instances.add(object, job.block, job.key, reusableKey, 'provider-async', job.role === 'reference' ? 'reference' : 'normal')
      : undefined;
    this.ports.targets.object.blocksGroup.remove(fallback);
    if (terrainCompiled) {
      this.ports.store.setTerrainRepresentation(job.key, this.ports.targets.terrain.chunkKey(job.block.position), reusableKey);
      disposeObject(object);
    } else if (surfaceMemberships !== undefined) {
      this.ports.store.setSurfaceObject(job.key, surfaceMemberships, surfaceMemberships.length ? this.ports.targets.surface.meshFor(surfaceMemberships[0].batchKey) : undefined);
      disposeObject(object);
    } else if (instance) {
      this.ports.store.setInstanceMembership(job.key, { batchKey: instance.batchKey, index: instance.index, object: this.ports.targets.instances.batches.get(instance.batchKey)?.parts[0] });
      this.ports.store.setStaticModel(job.key, { decision: this.ports.targets.instances.decisionFor(job.key) });
      disposeObject(object);
    } else {
      if (job.role === 'reference') this.ports.targets.object.applyReferenceOpacity(object, job.options.referenceOpacity ?? .28);
      this.ports.targets.object.blocksGroup.add(object);
      this.ports.store.setObject(job.key, object);
      this.ports.store.setStaticModel(job.key, { decision: this.ports.targets.instances.decisionFor(job.key) });
    }
    this.finish();
  }

  commitRefresh(job: BlockHydrationJob, visual: HydratedBlockVisualResult, reusableKey: string | undefined, provider: BlockVisualProvider): void {
    const current = this.ports.store.get(job.key);
    if (!current) return;
    if (!visual.object && visual.terrainTemplates && reusableKey) {
      if (this.ports.targets.terrain.add(job.block, job.key, visual.terrainTemplates, job.role === 'reference' ? 'reference' : 'normal')) {
        this.ports.targets.terrain.cacheTemplates(reusableKey, visual.terrainTemplates);
        this.ports.resources.releasePreviousAfterReplacement(job.key, current, 'terrain');
        this.ports.store.createOrReplace({ key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider, reusableVisualKey: reusableKey, terrainChunkKey: this.ports.targets.terrain.chunkKey(job.block.position) });
        this.finish();
        return;
      }
    }
    if (!visual.object) {
      this.recordRefreshFailure(job, 'Visual provider returned no replacement representation');
      this.finish();
      return;
    }
    const object = this.prepareObject(visual.object, job, visual);
    const staticAllowed = job.role !== 'missing' && this.ports.targets.instances.shouldAttempt(job.allowInstancing || job.surfaceFastPathEligible, reusableKey);
    const instance = staticAllowed ? this.ports.targets.instances.add(object, job.block, job.key, reusableKey, 'provider-async', job.role === 'reference' ? 'reference' : 'normal') : undefined;
    const base = { key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider, reusableVisualKey: reusableKey, staticModelAttempted: staticAllowed, staticModelFamily: this.ports.targets.object.familyFromReusableKey(reusableKey), staticModelDecision: this.ports.targets.instances.decisionFor(job.key) } as const;
    if (instance) {
      this.ports.resources.releasePreviousAfterReplacement(job.key, current, 'instance');
      this.ports.store.createOrReplace({ ...base, instanceBatchKey: instance.batchKey, instanceIndex: instance.index, object: this.ports.targets.instances.batches.get(instance.batchKey)?.parts[0] });
      disposeObject(object);
    } else {
      if (job.role === 'reference') this.ports.targets.object.applyReferenceOpacity(object, job.options.referenceOpacity ?? .28);
      this.ports.targets.object.blocksGroup.add(object);
      this.ports.resources.releasePreviousAfterReplacement(job.key, current, 'object');
      this.ports.store.createOrReplace({ ...base, object });
    }
    this.finish();
  }

  fail(job: BlockHydrationJob, fallback: THREE.Mesh, error: unknown): void {
    this.ports.resources.rollbackPartial(job.key);
    fallback.userData['renderMode'] = 'fallback';
    fallback.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown visual provider error' }];
    this.finish();
  }

  recordRefreshFailure(job: BlockHydrationJob, error: unknown): void {
    const current = this.ports.store.get(job.key);
    if (!current) return;
    const diagnostics = [{ code: 'PROVIDER_REFRESH_FAILED', message: error instanceof Error ? error.message : String(error) }];
    if (current.fallback) current.fallback.userData['diagnostics'] = diagnostics;
    if (current.object) current.object.userData['diagnostics'] = diagnostics;
    this.ports.invalidateDiagnostics();
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

  private finish(): void {
    this.ports.recordProviderCacheStats();
    this.ports.invalidateDiagnostics();
    this.ports.scheduleRender();
  }
}
