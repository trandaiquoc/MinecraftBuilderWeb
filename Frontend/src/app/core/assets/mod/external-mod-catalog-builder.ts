import type { AssetBlockRecord, CatalogItemEvidence } from '../../blocks/catalog/block-definition.types';
import type { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { ContentSourceProvider } from '../content-source/content-source.types';
import type { PaintingVariant } from '../../decorations/decoration.types';
import type { ContentSemanticEvidenceProvider, ContentSpecialVisualDescriptor } from '../../content/content-introspection';
import { ContentIntrospectionEngine } from '../../content/content-introspection';
import { TagIndex } from '../../content/tag-index';
import { stateDefinitionsFromBlockstate } from '../../content/normalized-predicate';
import { externalItemEvidence } from './external-mod-item-evidence';
import { discoverPaintingVariants } from './external-mod-painting-catalog';
import { buildExternalTrustedBehaviorEvidence } from './external-mod-behavior-evidence';
import { addVerifiedSignPlacementVariants, buildExternalSignVisualIndex } from './external-mod-sign-catalog';
import { evaluateCommonBehavior } from '../../block-behavior/compatibility/common-behavior';
import type { BehaviorClassificationSummary } from '../../block-behavior/compatibility/behavior-fingerprint';
import { CooperativeWorkBudget, yieldToBrowser } from '../cooperative-yield';
import { throwIfAborted } from './mod-import-cancellation';

export { discoverPaintingVariants } from './external-mod-painting-catalog';
export { externalItemEvidence } from './external-mod-item-evidence';

export interface ExternalCatalogProgress { readonly processed: number; readonly total: number; }
export type ExternalModCatalog = BlockCatalogSource & { readonly paintingVariants: readonly PaintingVariant[] };

interface ExternalCatalogSource extends ContentSourceProvider {
  readonly semanticEvidenceProviders: readonly ContentSemanticEvidenceProvider[];
  paths(): readonly string[];
}

interface ExternalCatalogContext {
  readonly blockstatePaths: readonly string[];
  readonly itemEvidence: readonly CatalogItemEvidence[];
  readonly itemEvidenceById: ReadonlyMap<string, CatalogItemEvidence>;
  readonly tagIndex: TagIndex;
  readonly introspection: ContentIntrospectionEngine;
  readonly blockIds: ReadonlySet<string>;
  readonly trustedFamilies: ReadonlyMap<string, readonly string[]>;
  readonly trustedTagIds: ReadonlyMap<string, readonly string[]>;
  readonly signVisuals: ReadonlyMap<string, ContentSpecialVisualDescriptor | undefined>;
  readonly languages: ReadonlyMap<string, Record<string, unknown>>;
}

/** Builds an external source's content catalog from its retained resource evidence. */
export class ExternalModCatalogBuilder {
  constructor(private readonly source: ExternalCatalogSource, private readonly json: Readonly<Record<string, unknown>>) {}

  build(): ExternalModCatalog {
    const context = this.createContext();
    const records = context.blockstatePaths.flatMap((path) => {
      const record = this.buildBlockRecord(path, context);
      return record ? [record] : [];
    });
    return this.finishCatalog(records, context);
  }

  async prepare(onProgress?: (progress: ExternalCatalogProgress) => void, signal?: AbortSignal): Promise<ExternalModCatalog> {
    throwIfAborted(signal);
    const context = this.createContext();
    const records: AssetBlockRecord[] = [];
    const budget = new CooperativeWorkBudget();
    let sliceItems = 0;
    for (let index = 0; index < context.blockstatePaths.length; index++) {
      throwIfAborted(signal);
      const record = this.buildBlockRecord(context.blockstatePaths[index], context);
      if (record) records.push(record);
      onProgress?.({ processed: index + 1, total: context.blockstatePaths.length });
      sliceItems++;
      if (budget.shouldYield(sliceItems)) {
        await yieldToBrowser(signal);
        throwIfAborted(signal);
        budget.reset();
        sliceItems = 0;
      }
    }
    throwIfAborted(signal);
    const catalog = this.finishCatalog(records, context);
    throwIfAborted(signal);
    return catalog;
  }

  private createContext(): ExternalCatalogContext {
    const blockstatePaths = Object.keys(this.json).filter((value) => /^assets\/[^/]+\/blockstates\/.*\.json$/.test(value)).sort();
    const itemEvidence = externalItemEvidence(this.json);
    const itemEvidenceById = new Map(itemEvidence.map((entry) => [entry.itemId, entry]));
    const tagIndex = TagIndex.fromProvider(this.source);
    const blockIds = new Set(blockstatePaths.map((path) => {
      const match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path)!;
      return `${match[1]}:${match[2]}`;
    }));
    const evidence = buildExternalTrustedBehaviorEvidence(blockIds, tagIndex);
    const signPaths = this.source.paths().filter((path) => /^assets\/[^/]+\/textures\/entity\/signs\/(?:hanging\/)?[^/]+\.png$/.test(path));
    const signVisuals = buildExternalSignVisualIndex(blockIds, evidence.families, signPaths);
    const languages = new Map<string, Record<string, unknown>>();
    for (const namespace of this.source.source.namespaces) {
      const exact = this.json[`assets/${namespace}/lang/en_us.json`];
      languages.set(namespace, exact && typeof exact === 'object' && !Array.isArray(exact) ? exact as Record<string, unknown> : {});
    }
    return {
      blockstatePaths, itemEvidence, itemEvidenceById, tagIndex,
      introspection: new ContentIntrospectionEngine(this.source, this.source.semanticEvidenceProviders),
      blockIds, trustedFamilies: evidence.families, trustedTagIds: evidence.tags, signVisuals, languages,
    };
  }

  private buildBlockRecord(path: string, context: ExternalCatalogContext): AssetBlockRecord | undefined {
    const match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path);
    if (!match) return undefined;
    const namespace = match[1];
    const blockPath = match[2];
    const id = `${namespace}:${blockPath}`;
    const blockstate = this.json[path];
    const definitions = stateDefinitionsFromBlockstate(blockstate);
    const language = context.languages.get(namespace) ?? {};
    const trustedFamilies = context.trustedFamilies.get(id) ?? [];
    const signVisual = context.signVisuals.get(id);
    const signCapabilities = signVisual ? [
      { kind: 'block-entity' as const, entityKind: 'sign' as const, evidence: 'verified' as const },
      { kind: 'special-renderer' as const, evidence: 'verified' as const },
    ] : [];
    const matchingItem = context.itemEvidenceById.get(id);
    const itemEvidence = matchingItem ? {
      itemId: id,
      placeable: true,
      sourceFormat: matchingItem.sourceFormat,
      referencedModels: matchingItem.referencedModels,
      referencedResources: matchingItem.referencedResources,
    } : undefined;
    const languageKey = `block.${namespace}.${blockPath.replaceAll('/', '.')}`;
    const initial: AssetBlockRecord = {
      id,
      displayName: typeof language[languageKey] === 'string' ? language[languageKey] as string : humanize(blockPath),
      defaultState: {},
      stateDefinitions: definitions,
      resources: { blockstate: path, model: configuredModelIds(blockstate)[0], textures: [] },
      support: 'partial',
      visualSupport: 'partial',
      behaviorSupport: 'unknown',
      defaultStateSource: 'unknown',
      visualClassification: signVisual ? 'special-renderer-required' : 'standard-json',
      visualClassificationEvidence: 'inferred',
      sourceId: this.source.source.id,
      sourceName: this.source.source.displayName,
      modName: this.source.source.displayName,
      trustedBehaviorFamilies: trustedFamilies,
      capabilities: signCapabilities,
      specialVisual: signVisual,
      itemEvidence,
      semanticEvidence: trustedFamilies.map((contractId) => ({
        contractId, provenance: 'trusted-data' as const, strength: 'partial' as const,
        supportingTags: context.trustedTagIds.get(id) ?? [], supportingProperties: [], supportingResources: [],
      })),
      behaviorEvidenceRequired: true,
    };

    const rawDescriptor = context.introspection.inspectBlock(initial);
    const evidenceRecord: AssetBlockRecord = {
      ...initial,
      defaultState: rawDescriptor.placementDefault,
      stateDefinitions: rawDescriptor.properties.map((property) => ({ name: property.name, values: property.values, ...(property.derived ? { derived: true } : {}) })),
      capabilities: rawDescriptor.capabilityProfile ?? initial.capabilities,
      supportRequirements: rawDescriptor.supportRequirements,
      supportContracts: rawDescriptor.supportContracts,
      specialVisual: rawDescriptor.specialVisual ?? signVisual,
      itemHostVisual: rawDescriptor.itemHostVisual,
      semanticEvidence: rawDescriptor.semanticEvidence,
      contentDescriptor: rawDescriptor,
      behaviorFingerprint: rawDescriptor.behaviorFingerprint,
    };
    const evaluation = evaluateCommonBehavior(evidenceRecord, this.source);
    const classification: BehaviorClassificationSummary = evaluation.classification ?? {
      ...(evaluation.behavior && evaluation.family ? { chosenCandidate: evaluation.family } : {}),
      traits: rawDescriptor.behaviorFingerprint?.traits ?? [],
      supportingEvidence: rawDescriptor.behaviorFingerprint?.evidence ?? [],
      rejectedCandidates: [],
      candidates: [],
      selectionReason: evaluation.behavior ? 'evidence' : 'none',
      confidence: evaluation.behavior ? 'partial' : 'unknown',
    };
    const finalized: AssetBlockRecord = {
      ...evidenceRecord,
      defaultState: { ...evidenceRecord.defaultState, ...evaluation.defaultState },
      stateDefinitions: [...evaluation.stateDefinitions].sort((left, right) => left.name.localeCompare(right.name)),
      defaultStateSource: evaluation.defaultStateSource,
      behaviorClassification: classification,
      ...(evaluation.behavior ? { behavior: evaluation.behavior, behaviorSupport: 'partial' as const } : {}),
    };
    const finalDescriptor = context.introspection.inspectBlock(finalized, rawDescriptor.behaviorFingerprint);
    return { ...finalized, contentDescriptor: finalDescriptor, behaviorFingerprint: finalDescriptor.behaviorFingerprint };
  }

  private finishCatalog(records: readonly AssetBlockRecord[], context: ExternalCatalogContext): ExternalModCatalog {
    const targetItems: CatalogItemEvidence[] = context.itemEvidence.map((entry) => ({
      ...entry,
      explicitBlockPlacement: context.blockIds.has(entry.itemId) ? { blockId: entry.itemId } : undefined,
      sourceId: this.source.source.id,
      sourceName: this.source.source.displayName,
    }));
    return {
      minecraftVersion: this.source.source.minecraftVersion,
      sourceId: this.source.source.id,
      sourceName: this.source.source.displayName,
      blocks: addVerifiedSignPlacementVariants(records),
      targetItems,
      itemEvidenceAvailable: true,
      paintingVariants: discoverPaintingVariants(this.json, this.source.source.id, this.source.source.displayName, context.tagIndex),
    };
  }
}

function configuredModelIds(value: unknown): string[] {
  const result = new Set<string>();
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (!item || typeof item !== 'object') return;
    const object = item as Record<string, unknown>;
    if (typeof object['model'] === 'string') result.add(object['model']);
    Object.values(object).forEach(visit);
  };
  visit(value);
  return [...result];
}

function humanize(value: string): string {
  return value.split('/').at(-1)!.split('_').map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(' ');
}
