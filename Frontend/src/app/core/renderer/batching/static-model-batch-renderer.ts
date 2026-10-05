import * as THREE from 'three';
import type { ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import { RendererDiagnostics } from '../engine/renderer-diagnostics';
import type { RendererCounters } from '../engine/renderer-diagnostics';
import { classifyStaticModel, type StaticModelClassificationKind } from './static-model-classifier';
import { compileInstanceTemplates, type CompiledInstanceTemplates, type InstancePartTemplate } from './instance-template-cache';
import { InstanceBatchRenderer, type InstanceBatch, type InstanceBatchEntry } from './instance-batch-renderer';
import type { RenderRegionPolicy } from './render-region-policy';

export interface StaticModelBatchRendererOptions {
  readonly blocksGroup: THREE.Group;
  readonly capacity: number;
  readonly chunkKey: (position: VoxelCoordinate) => string;
  readonly stableBounds: (region: string, envelope: THREE.Box3) => THREE.Box3;
  readonly regionPolicy: RenderRegionPolicy;
  readonly instrumentation: RendererDiagnostics;
  readonly getEntry: (key: string) => InstanceBatchEntry | undefined;
  readonly setEntryObject: (key: string, batchKey: string | undefined, index: number | undefined, object: THREE.Object3D | undefined) => void;
  readonly trace?: (phase: 'before-insert' | 'after-insert' | 'before-remove' | 'after-remove' | 'after-remove-entry', key: string, source: 'cached-template' | 'provider-async' | 'rollback' | 'reconcile') => void;
}

export interface StaticModelBatchMetrics {
  readonly candidates: number;
  readonly batchable: number;
  readonly batchedMembers: number;
  readonly templateCacheHits: number;
  readonly templateCacheMisses: number;
  readonly providerObjectsAvoidedByStaticCache: number;
  readonly rejected: Readonly<Record<string, number>>;
  readonly reusableKeyRequested: number;
  readonly reusableKeyReturned: number;
  readonly reusableKeyMissing: number;
  readonly reusableKeyMissingByFamily: Readonly<Record<string, number>>;
}

export interface StaticModelDecision {
  readonly classification: 'batchable' | 'rejected';
  readonly kind: StaticModelClassificationKind;
  readonly reason: string;
  readonly templatePartCount?: number;
}

/** Owns static provider classification, template reuse, regional batches and membership. */
export class StaticModelBatchRenderer {
  private readonly delegate: InstanceBatchRenderer;
  private readonly templateCache = new Map<string, CompiledInstanceTemplates>();
  private readonly rejectionCounts = new Map<StaticModelClassificationKind, number>();
  private candidates = 0;
  private batchable = 0;
  private templateCacheHits = 0;
  private templateCacheMisses = 0;
  private providerObjectsAvoidedByStaticCache = 0;
  private reusableKeyRequested = 0;
  private reusableKeyReturned = 0;
  private reusableKeyMissing = 0;
  private readonly reusableKeyMissingByFamily = new Map<string, number>();
  private readonly decisions = new Map<string, StaticModelDecision>();

  constructor(private readonly options: StaticModelBatchRendererOptions) {
    this.delegate = new InstanceBatchRenderer({
      blocksGroup: options.blocksGroup,
      capacity: options.capacity,
      chunkKey: options.chunkKey,
      stableBounds: options.stableBounds,
      regionPolicy: options.regionPolicy,
      record: (name, delta = 1) => options.instrumentation.record(name as keyof RendererCounters, delta),
      getEntry: options.getEntry,
      setEntryObject: options.setEntryObject,
      trace: options.trace,
    });
  }

  get batches(): Map<string, InstanceBatch> { return this.delegate.batches; }
  get ownershipIndex(): Map<string, { readonly batchKey: string; readonly index: number }> { return this.delegate.ownershipIndex; }

  shouldAttempt(allowInstancing: boolean, reusableKey: string | undefined): boolean {
    return allowInstancing || this.batches.size > 0 || reusableKey !== undefined && this.templateCache.has(reusableKey);
  }

  recordReusableKey(key: string | undefined, family = 'unknown'): void {
    this.reusableKeyRequested += 1;
    if (key !== undefined) { this.reusableKeyReturned += 1; return; }
    this.reusableKeyMissing += 1;
    this.reusableKeyMissingByFamily.set(family, (this.reusableKeyMissingByFamily.get(family) ?? 0) + 1);
  }

  templateFor(key: string): CompiledInstanceTemplates | undefined {
    const template = this.templateCache.get(key);
    if (template) { this.templateCacheHits += 1; this.providerObjectsAvoidedByStaticCache += 1; }
    return template;
  }

  tryAdd(object: THREE.Object3D, block: ProjectDocument['blocks'][number], key: string, reusableKey: string | undefined, source: 'provider-async' | 'cached-template' = 'provider-async'): { readonly batchKey: string; readonly index: number } | undefined {
    const cached = reusableKey ? this.templateCache.get(reusableKey) : undefined;
    if (cached) {
      this.templateCacheHits += 1;
      const result = this.delegate.addFromTemplates(cached.templates, block.position, key, source, cached);
      this.decisions.set(key, { classification: 'batchable', kind: 'batchable-opaque', reason: 'reusable-template-cache', templatePartCount: cached.templates.length });
      return result;
    }
    this.candidates += 1;
    const classification = classifyStaticModel(object, this.options.instrumentation);
    if (!classification.compiled) {
      this.reject(classification.kind);
      this.decisions.set(key, { classification: 'rejected', kind: classification.kind, reason: classification.reason ?? classification.kind });
      return undefined;
    }
    this.batchable += 1;
    if (reusableKey) {
      this.templateCacheMisses += 1;
      this.templateCache.set(reusableKey, classification.compiled);
      this.options.instrumentation.record('reusableTemplateCreations');
    }
    const result = this.delegate.addFromTemplates(classification.compiled.templates, block.position, key, source, classification.compiled);
    this.decisions.set(key, { classification: 'batchable', kind: classification.kind, reason: 'classified-static-model', templatePartCount: classification.compiled.templates.length });
    return result;
  }

  addFromTemplates(templates: readonly InstancePartTemplate[], block: ProjectDocument['blocks'][number], key: string, source: 'provider-async' | 'cached-template' = 'provider-async', compiled?: CompiledInstanceTemplates): { readonly batchKey: string; readonly index: number } | undefined {
    const resolvedCompiled = compiled ?? compileInstanceTemplates(templates, this.options.instrumentation);
    const result = this.delegate.addFromTemplates(templates, block.position, key, source, resolvedCompiled);
    this.decisions.set(key, { classification: 'batchable', kind: 'batchable-opaque', reason: compiled ? 'reusable-template-cache' : 'precompiled-static-model', templatePartCount: resolvedCompiled.templates.length });
    return result;
  }

  remove(key: string, entry: InstanceBatchEntry | undefined, source: 'rollback' | 'reconcile' = 'reconcile'): void { this.delegate.remove(key, entry, source); this.decisions.delete(key); }
  memberships(key: string, scanAll = false): readonly { readonly batchKey: string; readonly index: number }[] { return this.delegate.memberships(key, scanAll); }
  removeOrphaned(key: string, source: 'rollback' | 'reconcile', entry?: InstanceBatchEntry): void { this.delegate.removeOrphaned(key, source, entry); }
  removeMembership(batchKey: string, index: number, key: string): boolean { return this.delegate.removeMembership(batchKey, index, key); }
  reconcile(entries: ReadonlyMap<string, InstanceBatchEntry>): void { this.delegate.reconcile(entries); }
  templates(): readonly CompiledInstanceTemplates[] { return [...this.templateCache.values()]; }
  templateCacheView(): ReadonlyMap<string, CompiledInstanceTemplates> { return this.templateCache; }
  metrics(): StaticModelBatchMetrics {
    let batchedMembers = 0;
    for (const batch of this.batches.values()) batchedMembers += batch.keys.length;
    const rejected: Record<string, number> = {};
    for (const [reason, count] of this.rejectionCounts) rejected[reason] = count;
    const reusableKeyMissingByFamily: Record<string, number> = {};
    for (const [family, count] of this.reusableKeyMissingByFamily) reusableKeyMissingByFamily[family] = count;
    return { candidates: this.candidates, batchable: this.batchable, batchedMembers, templateCacheHits: this.templateCacheHits, templateCacheMisses: this.templateCacheMisses, providerObjectsAvoidedByStaticCache: this.providerObjectsAvoidedByStaticCache, rejected, reusableKeyRequested: this.reusableKeyRequested, reusableKeyReturned: this.reusableKeyReturned, reusableKeyMissing: this.reusableKeyMissing, reusableKeyMissingByFamily };
  }

  decisionFor(key: string): StaticModelDecision | undefined { return this.decisions.get(key); }
  templatePartCounts(): readonly { readonly key: string; readonly partCount: number }[] { return [...this.templateCache.entries()].map(([key, compiled]) => ({ key, partCount: compiled.templates.length })); }

  clearTemplates(): void {
    const compiled = [...this.templateCache.values()];
    this.templateCache.clear();
    for (const item of compiled) for (const template of item.templates) {
      template.material.dispose();
      if (template.ownsGeometry) template.geometry.dispose();
      else if (template.geometry.userData['mergedInstanceTemplateGeometry']) template.geometry.dispose();
    }
  }

  resetMetrics(): void {
    this.candidates = 0; this.batchable = 0; this.templateCacheHits = 0; this.templateCacheMisses = 0; this.providerObjectsAvoidedByStaticCache = 0;
    this.reusableKeyRequested = 0; this.reusableKeyReturned = 0; this.reusableKeyMissing = 0; this.reusableKeyMissingByFamily.clear(); this.rejectionCounts.clear(); this.decisions.clear();
  }

  clear(): void { this.delegate.clear(); this.clearTemplates(); this.resetMetrics(); }

  private reject(kind: StaticModelClassificationKind): void { this.rejectionCounts.set(kind, (this.rejectionCounts.get(kind) ?? 0) + 1); }
}
