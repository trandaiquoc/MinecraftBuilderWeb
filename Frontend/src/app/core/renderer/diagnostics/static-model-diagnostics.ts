import * as THREE from 'three';
import { countObjectMeshCost } from './scene-render-cost';
import type { StaticModelBatchMetrics, StaticModelDecision } from '../batching/static-model-batch-renderer';

export interface StaticModelDiagnosticEntry {
  readonly key: string;
  readonly id: string;
  readonly role?: string;
  readonly object?: THREE.Object3D;
  readonly instanceBatchKey?: string;
  readonly surfaceFaceMemberships?: readonly unknown[];
  readonly terrainChunkKey?: string;
  readonly staticModelAttempted?: boolean;
  readonly staticModelDecision?: StaticModelDecision;
  readonly reusableVisualKey?: string;
  readonly staticModelFamily?: string;
}

export interface StaticModelDiagnosticSnapshot {
  readonly candidates: number;
  readonly batchable: number;
  readonly batchedMembers: number;
  readonly templateCacheHits: number;
  readonly templateCacheMisses: number;
  readonly providerObjectsAvoidedByStaticCache: number;
  readonly reusableKeyRequested: number;
  readonly reusableKeyReturned: number;
  readonly reusableKeyMissing: number;
  readonly reusableKeyMissingByFamily: Readonly<Record<string, number>>;
  readonly rejectionCounts: Readonly<Record<string, number>>;
  readonly standaloneLogical: number;
  readonly standaloneMeshes: number;
  readonly standaloneOpaqueMeshes: number;
  readonly standaloneTransparentMeshes: number;
  readonly standaloneNeverClassified: number;
  readonly standaloneClassifiedRejected: number;
  readonly standaloneClassifiedBatchableButNotBatched: number;
  readonly standaloneReasonCounts: Readonly<Record<string, number>>;
  readonly standaloneLogicalByFamily: Readonly<Record<string, { readonly logical: number; readonly meshes: number }>>;
  readonly topStandaloneBlockIds: readonly { readonly id: string; readonly family: string; readonly logicalCount: number; readonly meshCount: number; readonly reason: string }[];
  readonly topStaticTemplatePartCounts: readonly { readonly key: string; readonly partCount: number }[];
}

export function collectStaticModelDiagnostics(
  entries: Iterable<StaticModelDiagnosticEntry>,
  metrics: StaticModelBatchMetrics,
  templatePartCounts: readonly { readonly key: string; readonly partCount: number }[],
): StaticModelDiagnosticSnapshot {
  const standaloneByFamily = new Map<string, { logical: number; meshes: number }>();
  const standaloneById = new Map<string, { family: string; logical: number; meshes: number; reason: string }>();
  const reasonCounts = new Map<string, number>();
  let standaloneLogical = 0;
  let standaloneMeshes = 0;
  let standaloneOpaqueMeshes = 0;
  let standaloneTransparentMeshes = 0;
  let standaloneNeverClassified = 0;
  let standaloneClassifiedRejected = 0;
  let standaloneClassifiedBatchableButNotBatched = 0;

  for (const entry of entries) {
    if (!isStandalone(entry)) continue;
    const cost = entry.object ? countObjectMeshCost(entry.object, true) : { meshes: 0, transparentMeshes: 0, opaqueMeshes: 0 };
    const family = entry.staticModelFamily ?? objectFamily(entry.object) ?? 'generic-json';
    const reason = finalStandaloneReason(entry);
    standaloneLogical += 1;
    standaloneMeshes += cost.meshes;
    standaloneOpaqueMeshes += cost.opaqueMeshes;
    standaloneTransparentMeshes += cost.transparentMeshes;
    if (reason === 'never-classified') standaloneNeverClassified += 1;
    else if (reason.startsWith('classification-')) standaloneClassifiedRejected += 1;
    else if (reason === 'classified-batchable-but-not-batched') standaloneClassifiedBatchableButNotBatched += 1;
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    const familyCost = standaloneByFamily.get(family) ?? { logical: 0, meshes: 0 };
    familyCost.logical += 1; familyCost.meshes += cost.meshes; standaloneByFamily.set(family, familyCost);
    const idCost = standaloneById.get(entry.id) ?? { family, logical: 0, meshes: 0, reason };
    idCost.logical += 1; idCost.meshes += cost.meshes; standaloneById.set(entry.id, idCost);
  }

  const familyResult: Record<string, { logical: number; meshes: number }> = {};
  for (const [family, value] of [...standaloneByFamily.entries()].sort(([left], [right]) => left.localeCompare(right))) familyResult[family] = value;
  const reasonResult: Record<string, number> = {};
  for (const [reason, count] of [...reasonCounts.entries()].sort(([left], [right]) => left.localeCompare(right))) reasonResult[reason] = count;
  const topStandaloneBlockIds = [...standaloneById.entries()]
    .sort(([, left], [, right]) => right.logical - left.logical || right.meshes - left.meshes)
    .slice(0, 10)
    .map(([id, value]) => ({ id, family: value.family, logicalCount: value.logical, meshCount: value.meshes, reason: value.reason }));
  const topStaticTemplatePartCounts = [...templatePartCounts].sort((left, right) => right.partCount - left.partCount || left.key.localeCompare(right.key)).slice(0, 10).map((entry) => ({ key: compactTemplateKey(entry.key), partCount: entry.partCount }));

  return {
    candidates: metrics.candidates,
    batchable: metrics.batchable,
    batchedMembers: metrics.batchedMembers,
    templateCacheHits: metrics.templateCacheHits,
    templateCacheMisses: metrics.templateCacheMisses,
    providerObjectsAvoidedByStaticCache: metrics.providerObjectsAvoidedByStaticCache,
    reusableKeyRequested: metrics.reusableKeyRequested,
    reusableKeyReturned: metrics.reusableKeyReturned,
    reusableKeyMissing: metrics.reusableKeyMissing,
    reusableKeyMissingByFamily: metrics.reusableKeyMissingByFamily,
    rejectionCounts: metrics.rejected,
    standaloneLogical,
    standaloneMeshes,
    standaloneOpaqueMeshes,
    standaloneTransparentMeshes,
    standaloneNeverClassified,
    standaloneClassifiedRejected,
    standaloneClassifiedBatchableButNotBatched,
    standaloneReasonCounts: reasonResult,
    standaloneLogicalByFamily: familyResult,
    topStandaloneBlockIds,
    topStaticTemplatePartCounts,
  };
}

function isStandalone(entry: StaticModelDiagnosticEntry): boolean {
  return !!entry.object && !entry.instanceBatchKey && !entry.surfaceFaceMemberships?.length && entry.terrainChunkKey === undefined;
}

function finalStandaloneReason(entry: StaticModelDiagnosticEntry): string {
  if (!entry.staticModelAttempted) return entry.role === 'reference' ? 'role-reference' : 'never-classified';
  if (entry.staticModelDecision?.classification === 'rejected') return `classification-${entry.staticModelDecision.kind}`;
  if (entry.staticModelDecision?.classification === 'batchable') return 'classified-batchable-but-not-batched';
  if (!entry.reusableVisualKey) return 'no-reusable-key';
  return 'provider-fallback';
}

function objectFamily(object: THREE.Object3D | undefined): string | undefined {
  let family: unknown;
  object?.traverse((child) => { family ??= child.userData['specialVisualFamily']; });
  return typeof family === 'string' ? family : undefined;
}

function compactTemplateKey(key: string): string { return key.length > 120 ? `${key.slice(0, 117)}...` : key; }
