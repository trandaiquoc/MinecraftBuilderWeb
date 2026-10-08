import * as THREE from 'three';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { ViewportRenderOptions } from '../engine/viewport-engine-contracts';
import type { VisibleBlockProjectionEntry } from '../engine/y-layer-projection-coordinator';
import type { BlockVisualProvider, BlockVisualResult } from './block-visual-provider-contract';
import type { RenderedBlockEntry, ViewportBlockRepresentationStore } from '../engine/viewport-block-representation-store';
import type { CompiledInstanceTemplates, InstancePartTemplate } from '../batching/instance-template-cache';
import type { SurfaceFaceMembership, SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import type { StaticModelBatchRenderer } from '../batching/static-model-batch-renderer';
import type { BlockRepresentationResourceOwner } from './block-representation-resource-owner';
import { disposeObject } from '../presentation/renderer-resource-disposal';

type Block = ProjectDocument['blocks'][number];
type RenderRole = RenderedBlockEntry['role'];
type WorldContext = { readonly getBlock: (position: VoxelCoordinate) => Block | undefined };

function translateVisualToVoxel(object: THREE.Object3D, position: VoxelCoordinate): void {
  object.position.set(object.position.x + position.x, object.position.y + position.y, object.position.z + position.z);
}

export interface BlockHydrationJobLike {
  readonly key: string;
  readonly block: Block;
  readonly signature: string;
  readonly role: RenderRole;
  readonly worldContext: WorldContext;
  readonly options: ViewportRenderOptions;
  readonly allowInstancing: boolean;
  readonly surfaceFastPathEligible: boolean;
  readonly surfaceVisibleEntries: ReadonlyMap<string, VisibleBlockProjectionEntry>;
}

export interface HydratedBlockVisualResult extends BlockVisualResult {
  readonly terrainTemplates?: readonly SurfaceFaceTemplate[];
}

export interface BlockRepresentationHydrationOwnerPorts {
  readonly store: ViewportBlockRepresentationStore;
  readonly resources: Pick<BlockRepresentationResourceOwner, 'ensureFallback' | 'remove' | 'removePlaceholder' | 'rollbackPartial' | 'removeOrphanedInstanceMemberships'>;
  readonly blocksGroup: THREE.Group;
  readonly provider: () => BlockVisualProvider | undefined;
  readonly providerGeneration: () => number;
  readonly requestReusableKey: (provider: BlockVisualProvider, block: Block, world: WorldContext) => string | undefined;
  readonly createVisual: (provider: BlockVisualProvider, block: Block, world: WorldContext) => Promise<HydratedBlockVisualResult>;
  readonly resolveTerrain: (key: string, block: Block, world: WorldContext, provider: BlockVisualProvider) => Promise<HydratedBlockVisualResult>;
  readonly terrain: {
    readonly templatesFor: (key: string) => readonly SurfaceFaceTemplate[] | undefined;
    readonly cacheTemplates: (key: string, templates: readonly SurfaceFaceTemplate[]) => void;
    readonly chunkKey: (position: VoxelCoordinate) => string;
  };
  readonly staticModels: {
    readonly shouldAttempt: (allowInstancing: boolean, reusableKey: string | undefined) => boolean;
    readonly templateFor: (key: string) => CompiledInstanceTemplates | undefined;
    readonly decisionFor: (key: string) => ReturnType<StaticModelBatchRenderer['decisionFor']>;
    readonly batches: ReadonlyMap<string, { readonly parts: readonly THREE.InstancedMesh[] }>;
  };
  readonly surface: {
    readonly templatesFor: (key: string) => readonly SurfaceFaceTemplate[] | undefined;
    readonly cacheTemplates: (key: string, templates: readonly SurfaceFaceTemplate[]) => void;
    readonly meshFor: (batchKey: string) => THREE.Object3D | undefined;
  };
  readonly addSurface: (block: Block, key: string, templates: readonly SurfaceFaceTemplate[], visible: ReadonlyMap<string, VisibleBlockProjectionEntry>) => readonly SurfaceFaceMembership[] | undefined;
  readonly addTerrain: (block: Block, key: string, templates: readonly SurfaceFaceTemplate[], role: 'normal' | 'reference') => boolean;
  readonly addInstance: (object: THREE.Object3D, block: Block, key: string, reusableKey: string | undefined, source: 'provider-async' | 'cached-template', role: 'normal' | 'reference') => { readonly batchKey: string; readonly index: number } | undefined;
  readonly addInstanceFromTemplates: (templates: readonly InstancePartTemplate[], block: Block, key: string, source: 'provider-async' | 'cached-template', compiled: CompiledInstanceTemplates, role: 'normal' | 'reference') => { readonly batchKey: string; readonly index: number } | undefined;
  readonly applyBrightness: (object: THREE.Object3D) => void;
  readonly applyReferenceOpacity: (object: THREE.Object3D, opacity: number) => void;
  readonly familyFromReusableKey: (key: string | undefined) => string | undefined;
  readonly familyFromVisual: (object: THREE.Object3D) => string | undefined;
  readonly extractSurfaceTemplates: (object: THREE.Object3D) => readonly SurfaceFaceTemplate[] | undefined;
  readonly record: (metric: string, delta?: number) => void;
  readonly invalidateDiagnostics: () => void;
  readonly recordProviderCacheStats: () => void;
  readonly releaseRetiredProviders: () => void;
  readonly scheduleRender: () => void;
}

/** Owns async block representation creation and provider-refresh swaps. */
export class BlockRepresentationHydrationOwner {
  constructor(private readonly ports: BlockRepresentationHydrationOwnerPorts) {}

  refresh(job: BlockHydrationJobLike, onComplete?: () => void): void {
    this.ports.invalidateDiagnostics();
    const entry = this.ports.store.get(job.key);
    const provider = this.ports.provider();
    if (!entry || !provider) { onComplete?.(); return; }
    const generation = this.ports.providerGeneration();
    const revision = this.ports.store.incrementRevision(entry.key) ?? entry.revision;
    const reusableKey = this.ports.requestReusableKey(provider, job.block, job.worldContext);
    const visualPromise = job.surfaceFastPathEligible && reusableKey ? this.ports.resolveTerrain(reusableKey, job.block, job.worldContext, provider) : this.ports.createVisual(provider, job.block, job.worldContext);
    void visualPromise.then((visual) => {
      const current = this.ports.store.get(job.key);
      if (generation !== this.ports.providerGeneration() || provider !== this.ports.provider() || current !== entry || entry.revision !== revision) { if (visual.object) disposeObject(visual.object); return; }
      if (visual.terrainTemplates && reusableKey) {
        this.ports.terrain.cacheTemplates(reusableKey, visual.terrainTemplates);
        if (entry.terrainChunkKey !== undefined) {
          if (!this.ports.addTerrain(job.block, job.key, visual.terrainTemplates, job.role === 'reference' ? 'reference' : 'normal')) return;
          this.ports.store.setReusableVisual(job.key, reusableKey);
        } else {
          this.ports.resources.remove(job.key, entry);
          if (!this.ports.addTerrain(job.block, job.key, visual.terrainTemplates, job.role === 'reference' ? 'reference' : 'normal')) return;
          this.ports.store.createOrReplace({ key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider, reusableVisualKey: reusableKey, terrainChunkKey: this.ports.terrain.chunkKey(job.block.position) });
        }
        this.ports.recordProviderCacheStats(); this.ports.scheduleRender(); return;
      }
      if (!visual.object) return;
      const object = visual.object;
      object.userData['realModel'] = true;
      this.ports.applyBrightness(object);
      object.position.set(object.position.x + job.block.position.x, object.position.y + job.block.position.y, object.position.z + job.block.position.z);
      object.userData['voxel'] = job.block.position; object.userData['renderRole'] = job.role; object.userData['renderMode'] = visual.mode; object.userData['renderTrace'] = visual.trace; object.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics];
      object.traverse((child) => { child.userData['voxel'] = job.block.position; child.userData['renderRole'] = job.role; child.userData['realModel'] = true; });
      this.ports.resources.remove(job.key, entry);
      const replacementBase = { key: job.key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider } as const;
      const staticAllowed = job.role !== 'missing' && this.ports.staticModels.shouldAttempt(true, reusableKey);
      const staticFamily = this.ports.familyFromReusableKey(reusableKey);
      const instance = staticAllowed ? this.ports.addInstance(object, job.block, job.key, reusableKey, 'provider-async', job.role === 'reference' ? 'reference' : 'normal') : undefined;
      const replacement: RenderedBlockEntry = instance
        ? { ...replacementBase, reusableVisualKey: reusableKey, staticModelAttempted: staticAllowed, staticModelFamily: staticFamily, instanceBatchKey: instance.batchKey, instanceIndex: instance.index, object: this.ports.staticModels.batches.get(instance.batchKey)?.parts[0], staticModelDecision: this.ports.staticModels.decisionFor(job.key) }
        : { ...replacementBase, reusableVisualKey: reusableKey, staticModelAttempted: staticAllowed, staticModelFamily: staticFamily, object, staticModelDecision: this.ports.staticModels.decisionFor(job.key) };
      if (instance) disposeObject(object);
      else { if (job.role === 'reference') this.ports.applyReferenceOpacity(object, job.options.referenceOpacity ?? .28); this.ports.blocksGroup.add(object); }
      this.ports.store.createOrReplace(replacement);
      this.ports.recordProviderCacheStats(); this.ports.releaseRetiredProviders(); this.ports.scheduleRender();
    }).catch(() => undefined).finally(() => onComplete?.());
  }

  create(job: BlockHydrationJobLike, onComplete?: () => void): void {
    this.ports.invalidateDiagnostics();
    const key = job.key;
    const existing = this.ports.store.get(key);
    if (existing) this.ports.resources.remove(key, existing);
    else if (this.ports.store.get(key) === undefined) this.ports.resources.removeOrphanedInstanceMemberships(key, 'reconcile');
    this.ports.resources.removePlaceholder(key);
    const entry: RenderedBlockEntry = { key, block: job.block, signature: job.signature, role: job.role, revision: 0, provider: this.ports.provider() };
    this.ports.store.createOrReplace(entry);
    const provider = this.ports.provider();
    const providerAvailable = !!provider && job.block.kind !== 'missing';
    const reusableKey = providerAvailable ? this.ports.requestReusableKey(provider!, job.block, job.worldContext) : undefined;
    const staticAllowed = providerAvailable && job.role !== 'missing' && this.ports.staticModels.shouldAttempt(job.allowInstancing || job.surfaceFastPathEligible, reusableKey);
    this.ports.store.setStaticModel(key, { attempted: staticAllowed, family: this.ports.familyFromReusableKey(reusableKey) });
    const cachedTemplates = reusableKey ? this.ports.staticModels.templateFor(reusableKey) : undefined;
    const cachedTerrain = job.surfaceFastPathEligible && reusableKey ? this.ports.terrain.templatesFor(reusableKey) : undefined;
    const cachedSurface = job.surfaceFastPathEligible && reusableKey ? this.ports.surface.templatesFor(reusableKey) : undefined;
    if (providerAvailable && cachedTerrain && this.ports.addTerrain(job.block, key, cachedTerrain, job.role === 'reference' ? 'reference' : 'normal')) {
      this.ports.store.setTerrainRepresentation(key, this.ports.terrain.chunkKey(job.block.position), reusableKey); onComplete?.(); this.ports.scheduleRender(); return;
    }
    if (providerAvailable && cachedSurface) {
      const memberships = this.ports.addSurface(job.block, key, cachedSurface, job.surfaceVisibleEntries);
      if (memberships) { this.ports.store.setSurfaceObject(key, memberships, memberships.length ? this.ports.surface.meshFor(memberships[0].batchKey) : undefined); onComplete?.(); this.ports.scheduleRender(); return; }
    }
    if (providerAvailable && cachedTemplates && !job.surfaceFastPathEligible && staticAllowed) {
      const instance = this.ports.addInstanceFromTemplates(cachedTemplates.templates, job.block, key, 'cached-template', cachedTemplates, job.role === 'reference' ? 'reference' : 'normal');
      if (instance) {
        this.ports.record('reusableTemplateCacheHits'); this.ports.record('cachedTemplateInsertions');
        this.ports.store.setInstanceMembership(key, { batchKey: instance.batchKey, index: instance.index, object: this.ports.staticModels.batches.get(instance.batchKey)?.parts[0] });
        this.ports.store.setStaticModel(key, { attempted: true, decision: this.ports.staticModels.decisionFor(key), family: this.ports.familyFromReusableKey(reusableKey) });
        onComplete?.(); this.ports.scheduleRender(); return;
      }
    }
    const fallback = this.ports.resources.ensureFallback(entry, job.options.referenceOpacity);
    if (!provider) { onComplete?.(); return; }
    const generation = this.ports.providerGeneration();
    const revision = this.ports.store.incrementRevision(key) ?? entry.revision;
    const visualPromise = job.surfaceFastPathEligible && reusableKey ? this.ports.resolveTerrain(reusableKey, job.block, job.worldContext, provider) : this.ports.createVisual(provider, job.block, job.worldContext);
    void visualPromise.then((visual) => {
      if (generation !== this.ports.providerGeneration() || this.ports.store.get(key) !== entry || entry.revision !== revision || fallback.parent !== this.ports.blocksGroup) { if (visual.object) disposeObject(visual.object); return; }
      fallback.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics]; fallback.userData['resolvedSupport'] = visual.resolved.support; fallback.userData['renderMode'] = visual.mode; fallback.userData['renderTrace'] = visual.trace;
      let surfaceMemberships: readonly SurfaceFaceMembership[] | undefined;
      let terrainCompiled = false;
      if (job.surfaceFastPathEligible && reusableKey) {
        const cachedTerrain = this.ports.terrain.templatesFor(reusableKey);
        const templates = visual.terrainTemplates ?? (visual.object ? this.ports.extractSurfaceTemplates(visual.object) : undefined);
        if (templates) {
          if (!cachedTerrain) this.ports.terrain.cacheTemplates(reusableKey, templates);
          terrainCompiled = this.ports.addTerrain(job.block, key, templates, job.role === 'reference' ? 'reference' : 'normal');
          if (terrainCompiled && !visual.object) { this.ports.store.setTerrainRepresentation(key, this.ports.terrain.chunkKey(job.block.position), reusableKey); this.ports.blocksGroup.remove(fallback); this.ports.recordProviderCacheStats(); this.ports.scheduleRender(); return; }
          if (!cachedTerrain) {
            const cachedSurface = this.ports.surface.templatesFor(reusableKey);
            if (!cachedSurface) this.ports.surface.cacheTemplates(reusableKey, templates);
            surfaceMemberships = this.ports.addSurface(job.block, key, cachedSurface ?? templates, job.surfaceVisibleEntries);
          }
        }
      }
      if (!visual.object) return;
      const object = visual.object; object.userData['realModel'] = true; this.ports.applyBrightness(object); translateVisualToVoxel(object, job.block.position); object.userData['voxel'] = job.block.position; object.userData['renderRole'] = job.role; object.userData['renderMode'] = visual.mode; object.userData['renderTrace'] = visual.trace; object.userData['diagnostics'] = [...visual.resolved.diagnostics, ...visual.diagnostics]; object.traverse((child) => { child.userData['voxel'] = job.block.position; child.userData['renderRole'] = job.role; child.userData['realModel'] = true; });
      this.ports.store.setReusableVisual(key, reusableKey); this.ports.store.setStaticModel(key, { attempted: staticAllowed, family: this.ports.familyFromVisual(object) ?? this.ports.familyFromReusableKey(reusableKey) });
      const instance = !terrainCompiled && surfaceMemberships === undefined && staticAllowed ? this.ports.addInstance(object, job.block, key, reusableKey, 'provider-async', job.role === 'reference' ? 'reference' : 'normal') : undefined;
      this.ports.blocksGroup.remove(fallback);
      if (terrainCompiled) { this.ports.store.setTerrainRepresentation(key, this.ports.terrain.chunkKey(job.block.position), reusableKey); disposeObject(object); }
      else if (surfaceMemberships !== undefined) { this.ports.store.setSurfaceObject(key, surfaceMemberships, surfaceMemberships.length ? this.ports.surface.meshFor(surfaceMemberships[0].batchKey) : undefined); disposeObject(object); }
      else if (instance) { this.ports.store.setInstanceMembership(key, { batchKey: instance.batchKey, index: instance.index, object: this.ports.staticModels.batches.get(instance.batchKey)?.parts[0] }); this.ports.store.setStaticModel(key, { decision: this.ports.staticModels.decisionFor(key) }); disposeObject(object); }
      else { if (job.role === 'reference') this.ports.applyReferenceOpacity(object, job.options.referenceOpacity ?? .28); this.ports.store.setStaticModel(key, { decision: this.ports.staticModels.decisionFor(key) }); this.ports.blocksGroup.add(object); this.ports.store.setObject(key, object); }
      this.ports.recordProviderCacheStats(); this.ports.scheduleRender();
    }).catch((error: unknown) => { if (this.ports.store.get(key) !== entry || entry.revision !== revision) return; this.ports.resources.rollbackPartial(key); fallback.userData['renderMode'] = 'fallback'; fallback.userData['diagnostics'] = [{ code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown visual provider error' }]; this.ports.recordProviderCacheStats(); this.ports.scheduleRender(); }).finally(() => onComplete?.());
  }
}
