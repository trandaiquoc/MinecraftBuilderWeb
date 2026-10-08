import type { AssetBlockRecord, CatalogItemEvidence } from '../../blocks/catalog/block-definition.types';
import type { BlockCatalogSource } from '../../blocks/catalog/block-catalog';
import type { ContentSourceProvider } from '../content-source/content-source.types';
import type { PaintingVariant } from '../../decorations/decoration.types';
import { paintingTextureResource } from '../../decorations/decoration.types';
import type { ContentSemanticEvidenceProvider, ContentSpecialVisualDescriptor } from '../../content/content-introspection';
import { ContentIntrospectionEngine } from '../../content/content-introspection';
import { StaticJvmSemanticEvidenceProvider } from '../../content/jvm-semantic-evidence';
import { TagIndex } from '../../content/tag-index';
import { resolveResourceLocation } from '../../content/resource-location';
import { stateDefinitionsFromBlockstate } from '../../content/normalized-predicate';
import { itemEvidenceFromResources, itemIdentityIndexFromResources } from '../vanilla/format/item-evidence';
import { evaluateCommonBehavior } from '../../block-behavior/compatibility/common-behavior';
import type { BehaviorClassificationSummary } from '../../block-behavior/compatibility/behavior-fingerprint';
import { CooperativeWorkBudget, yieldToBrowser } from '../cooperative-yield';
import { throwIfAborted } from './mod-import-cancellation';

export interface ExternalCatalogProgress { readonly processed: number; readonly total: number; }
export type ExternalModCatalog = BlockCatalogSource & { readonly paintingVariants: readonly PaintingVariant[] };

interface ExternalCatalogSource extends ContentSourceProvider {
  readonly semanticEvidenceProviders: readonly ContentSemanticEvidenceProvider[];
  paths(): readonly string[];
}

interface ExternalCatalogContext {
  readonly blockstatePaths: readonly string[];
  readonly itemEvidence: readonly ReturnType<typeof itemEvidenceFromResources>[number][];
  readonly itemEvidenceById: ReadonlyMap<string, ReturnType<typeof itemEvidenceFromResources>[number]>;
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
    const evidence = trustedEvidenceIndex(blockIds, tagIndex);
    const signPaths = this.source.paths().filter((path) => /^assets\/[^/]+\/textures\/entity\/signs\/(?:hanging\/)?[^/]+\.png$/.test(path));
    const signVisuals = buildSignVisualIndex(blockIds, evidence.families, signPaths);
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

function trustedEvidenceIndex(blockIds: ReadonlySet<string>, tags: TagIndex): { readonly families: ReadonlyMap<string, readonly string[]>; readonly tags: ReadonlyMap<string, readonly string[]> } {
  const families = new Map<string, Set<string>>();
  const tagIds = new Map<string, Set<string>>();
  for (const contribution of tags.contributions('block')) {
    const family = familyForTagPath(contribution.id, contribution.path);
    for (const member of tags.get('block', contribution.id).members) {
      if (!member.present || !blockIds.has(member.id)) continue;
      const ids = tagIds.get(member.id) ?? new Set<string>();
      ids.add(contribution.id);
      tagIds.set(member.id, ids);
      if (family) {
        const values = families.get(member.id) ?? new Set<string>();
        values.add(family);
        families.set(member.id, values);
      }
    }
  }
  return {
    families: new Map([...families].map(([id, values]) => [id, [...values].sort()])),
    tags: new Map([...tagIds].map(([id, values]) => [id, [...values].sort()])),
  };
}

function familyForTagPath(id: string, path: string): string | undefined {
  if (/(?:^|[_/])fences?(?:\.json)?$/.test(path)) return 'fence';
  if (/(?:^|[_/])walls?(?:\.json)?$/.test(path)) return 'wall';
  if (/(?:^|[_/])stairs?(?:\.json)?$/.test(path)) return 'stairs';
  if (/(?:^|[_/])doors?(?:\.json)?$/.test(path)) return 'doors';
  if (/(?:^|[_/])beds?(?:\.json)?$/.test(path)) return 'beds';
  if (/(?:^|[_/])tall_flowers?(?:\.json)?$/.test(path)) return 'double-height';
  if (id === 'minecraft:standing_signs') return 'standing-sign';
  if (id === 'minecraft:wall_signs') return 'wall-sign';
  if (id === 'minecraft:ceiling_hanging_signs') return 'hanging-sign';
  if (id === 'minecraft:wall_hanging_signs') return 'wall-hanging-sign';
  return undefined;
}

function buildSignVisualIndex(blockIds: ReadonlySet<string>, families: ReadonlyMap<string, readonly string[]>, paths: readonly string[]): ReadonlyMap<string, ContentSpecialVisualDescriptor | undefined> {
  const candidates = new Map<string, string[]>();
  for (const path of paths) {
    const match = /^assets\/([^/]+)\/textures\/entity\/signs\/(hanging\/)?([^/]+)\.png$/.exec(path);
    if (!match) continue;
    const key = `${match[2] ? 'hanging' : 'standing'}:${match[3]}`;
    const resource = `${match[1]}:entity/signs/${match[2] ?? ''}${match[3]}`;
    candidates.set(key, [...(candidates.get(key) ?? []), resource]);
  }
  const result = new Map<string, ContentSpecialVisualDescriptor | undefined>();
  for (const id of blockIds) {
    const family = families.get(id)?.find((value) => ['standing-sign', 'wall-sign', 'hanging-sign', 'wall-hanging-sign'].includes(value));
    if (!family) continue;
    const variant = family === 'standing-sign' ? 'standing' : family === 'wall-sign' ? 'wall' : family === 'hanging-sign' ? 'hanging' : 'wall-hanging';
    const name = id.split(':')[1] ?? '';
    const material = name.replace(/_(?:wall_)?hanging_sign$/, '').replace(/_wall_sign$/, '').replace(/_sign$/, '');
    const values = candidates.get(`${variant === 'hanging' || variant === 'wall-hanging' ? 'hanging' : 'standing'}:${material}`) ?? [];
    result.set(id, values.length === 1 ? {
      contractId: 'common-sign', variant, resources: { default: values[0] },
      stateDependencies: variant === 'standing' || variant === 'hanging' ? ['rotation'] : ['facing'], provenance: 'trusted-data',
    } : undefined);
  }
  return result;
}

function addVerifiedSignPlacementVariants(records: readonly AssetBlockRecord[]): readonly AssetBlockRecord[] {
  const groups = new Map<string, { standing?: string; wall?: string; hanging?: string; wallHanging?: string }>();
  for (const record of records) {
    const visual = record.specialVisual;
    if (visual?.contractId !== 'common-sign' || !visual.resources['default']) continue;
    const group = groups.get(visual.resources['default']) ?? {};
    if (visual.variant === 'standing') group.standing = record.id;
    if (visual.variant === 'wall') group.wall = record.id;
    if (visual.variant === 'hanging') group.hanging = record.id;
    if (visual.variant === 'wall-hanging') group.wallHanging = record.id;
    groups.set(visual.resources['default'], group);
  }
  const variantsById = new Map<string, { readonly standing?: string; readonly wall?: string; readonly hanging?: string; readonly wallHanging?: string }>();
  for (const group of groups.values()) {
    const variants = Object.fromEntries(Object.entries(group).filter(([, value]) => !!value));
    if (!(group.standing || group.hanging) || Object.keys(variants).length < 2) continue;
    for (const id of Object.values(group).filter((value): value is string => !!value)) variantsById.set(id, variants);
  }
  return records.map((record) => { const placementVariants = variantsById.get(record.id); return placementVariants ? { ...record, placementVariants } : record; });
}

export function discoverPaintingVariants(json: Readonly<Record<string, unknown>>, sourceId: string, sourceName: string, tags?: TagIndex): readonly PaintingVariant[] {
  const placeable = new Set<string>();
  for (const [path, value] of Object.entries(json)) {
    if (!/^data\/[^/]+\/tags\/painting_variant\/placeable\.json$/.test(path)) continue;
    const entries = value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>)['values'])
      ? (value as Record<string, unknown>)['values'] as unknown[] : [];
    entries.forEach((entry) => { if (typeof entry === 'string' && !entry.startsWith('#')) placeable.add(resolveResourceLocation(entry) ?? entry); });
  }
  return Object.entries(json).flatMap(([path, raw]) => {
    const match = /^data\/([^/]+)\/painting_variant\/(.+)\.json$/.exec(path);
    if (!match || !raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const value = raw as Record<string, unknown>;
    const width = Number(value['width']);
    const height = Number(value['height']);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return [];
    const id = `${match[1]}:${match[2]}`;
    const assetPath = typeof value['asset_id'] === 'string' ? paintingTextureResource(value['asset_id'], match[1]) : paintingTextureResource(match[2], match[1]);
    const tagPlaceable = tags ? (tags.hasMember('painting_variant', 'minecraft:placeable', id) || tags.hasMember('painting_variant', `${match[1]}:placeable`, id)) : undefined;
    return [{ id, width, height, assetPath, placeable: tagPlaceable ?? (placeable.size ? placeable.has(id) : true), sourceId, sourceName }];
  });
}

function humanize(value: string): string {
  return value.split('/').at(-1)!.split('_').map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(' ');
}

export function externalItemEvidence(json: Readonly<Record<string, unknown>>): readonly ReturnType<typeof itemEvidenceFromResources>[number][] {
  const paths = Object.keys(json);
  const identity = itemIdentityIndexFromResources(json);
  const modern = itemEvidenceFromResources(json, paths.filter((path) => /^assets\/[^/]+\/items\/.+\.json$/.test(path)), 'modern-item-definition', identity);
  const legacy = itemEvidenceFromResources(json, paths.filter((path) => /^assets\/[^/]+\/models\/item\/.+\.json$/.test(path)), 'legacy-item-model', identity);
  const byId = new Map<string, ReturnType<typeof itemEvidenceFromResources>[number]>();
  for (const entry of [...legacy, ...modern]) byId.set(entry.itemId, entry);
  return [...byId.values()];
}
