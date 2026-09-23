import type { AssetBlockRecord, BlockDefinition, BlockVisualClassification, CatalogItemEvidence, NormalizedBlockDefinition } from './block-definition.types';
import { deriveBlockCapabilities } from '../capabilities/block-capability-resolver';
import type { BlockCapability } from '../capabilities/block-capability.types';
import { mergeContentEvidence } from '../../content/content-introspection';

export interface BlockCatalogSource {
  readonly minecraftVersion: string;
  readonly blocks: readonly AssetBlockRecord[];
  readonly sourceId?: string;
  readonly sourceName?: string;
  /** Independent target item registry evidence; never inferred from block IDs. */
  readonly targetItems?: readonly CatalogItemEvidence[];
  /** True when the source format has an item domain that was inspected, even if it is empty. */
  readonly itemEvidenceAvailable?: boolean;
  readonly paintingVariants?: readonly import('../../decorations/decoration.types').PaintingVariant[];
}

interface CatalogContribution { readonly definitions: readonly NormalizedBlockDefinition[]; readonly targetItems: readonly CatalogItemEvidence[]; readonly itemEvidenceAvailable: boolean; }

export class BlockCatalog {
  private readonly contributions = new Map<string, CatalogContribution>();
  private readonly entries = new Map<string, NormalizedBlockDefinition>();
  private readonly searchIndex = new Map<string, string>();
  private orderedEntries: readonly NormalizedBlockDefinition[] = [];

  load(source: BlockCatalogSource): void {
    this.contributions.clear();
    this.replaceSource(source);
    if (this.conflicts().length) {
      const conflict = this.conflicts()[0];
      this.contributions.clear(); this.rebuild();
      throw new Error(`Duplicate block ID: ${conflict.id}`);
    }
  }

  replaceSource(source: BlockCatalogSource): void {
    const sourceId = source.sourceId ?? source.blocks[0]?.sourceId ?? 'vanilla';
    const sourceName = source.sourceName ?? source.blocks[0]?.sourceName ?? sourceId;
    this.contributions.set(sourceId, { definitions: source.blocks.map((record) => toDefinition(record, sourceId, sourceName)), targetItems: (source.targetItems ?? []).map((item) => ({ ...item, sourceId: item.sourceId ?? sourceId, sourceName: item.sourceName ?? sourceName })), itemEvidenceAvailable: source.itemEvidenceAvailable === true });
    this.rebuild();
  }

  removeSource(sourceId: string): void { this.contributions.delete(sourceId); this.rebuild(); }
  sources(): readonly string[] { return [...this.contributions.keys()]; }
  conflicts(): readonly { readonly id: string; readonly sourceIds: readonly string[] }[] {
    const owners = new Map<string, string[]>();
    for (const [sourceId, contribution] of this.contributions) for (const definition of contribution.definitions) owners.set(definition.id, [...(owners.get(definition.id) ?? []), sourceId]);
    return [...owners].filter(([, sourceIds]) => sourceIds.length > 1).map(([id, sourceIds]) => ({ id, sourceIds }));
  }

  private rebuild(): void {
    this.entries.clear(); this.searchIndex.clear();
    for (const contribution of this.contributions.values()) for (const definition of contribution.definitions) {
      if (this.entries.has(definition.id)) continue;
      this.entries.set(definition.id, definition);
      this.searchIndex.set(definition.id, [definition.displayName, definition.id, definition.namespace, definition.modName ?? '', definition.sourceName].map(normalizeSearchText).join('\u0000'));
    }
    this.orderedEntries = [...this.entries.values()];
  }

  get(id: string): NormalizedBlockDefinition | undefined { return this.entries.get(id); }
  all(): readonly NormalizedBlockDefinition[] { return this.orderedEntries; }
  targetItems(): readonly CatalogItemEvidence[] { return [...this.contributions.values()].flatMap((contribution) => contribution.targetItems); }
  hasTargetItemEvidence(): boolean { return [...this.contributions.values()].some((contribution) => contribution.itemEvidenceAvailable); }

  search(query: string): readonly BlockDefinition[] {
    const normalized = normalizeSearchText(query);
    if (!normalized) return this.all();
    return this.all().filter((block) => this.searchIndex.get(block.id)?.includes(normalized) ?? false);
  }
}

function toDefinition(record: AssetBlockRecord, sourceId = record.sourceId ?? 'vanilla', sourceName = record.sourceName ?? sourceId): NormalizedBlockDefinition {
  const separator = record.id.indexOf(':');
  if (separator <= 0 || separator === record.id.length - 1) throw new Error(`Invalid block registry ID: ${record.id}`);
  const namespace = record.id.slice(0, separator);
  const support = record.support ?? 'fallback';
  const explicitRender = record.capabilities?.find((capability): capability is Extract<BlockCapability, { kind: 'standard-json-render' | 'special-renderer' | 'intentionally-invisible' }> => capability.kind === 'standard-json-render' || capability.kind === 'special-renderer' || capability.kind === 'intentionally-invisible');
  const visualClassification = record.visualClassification ?? renderClassification(explicitRender) ?? 'standard-json';
  const hasVisualEvidence = !!record.visualClassification || !!explicitRender || !!record.resources.blockstate || !!record.resources.model;
  const descriptor = record.contentDescriptor ? mergeContentEvidence(record.contentDescriptor, record.semanticSupplements ?? []) : undefined;
  const stateDefinitions = mergeStateDefinitions(record.stateDefinitions, descriptor?.properties);
  const explicitCapabilities = [...(record.capabilities ?? []), ...(descriptor?.capabilityProfile ?? [])];
  return {
    ...record,
    sourceId,
    sourceName,
    namespace,
    defaultState: { ...record.defaultState, ...(descriptor?.placementDefault ?? {}) },
    stateDefinitions,
    supportRequirements: descriptor?.supportRequirements ?? record.supportRequirements,
    supportContracts: descriptor?.supportContracts ?? record.supportContracts,
    specialVisual: descriptor?.specialVisual ?? record.specialVisual,
    itemHostVisual: descriptor?.itemHostVisual ?? record.itemHostVisual,
    support,
    behaviorSupport: record.behaviorSupport ?? (record.behavior ? support === 'full' ? 'full' : 'partial' : 'unknown'),
    visualSupport: record.visualSupport ?? (support === 'full' ? 'real' : support),
    visualClassification,
    defaultStateSource: record.defaultStateSource ?? 'unknown',
    capabilities: deriveBlockCapabilities({ behavior: record.behavior, visualClassification: hasVisualEvidence ? visualClassification : undefined, visualClassificationEvidence: record.visualClassificationEvidence ?? (record.visualClassification ? 'verified' : explicitRender?.evidence), stateDefinitions, explicit: explicitCapabilities }),
    ...(descriptor ? { contentDescriptor: descriptor } : {}),
  };
}

function mergeStateDefinitions(base: readonly import('./block-definition.types').BlockStateDefinition[], properties: readonly import('../../content/content-introspection').ContentPropertyDescriptor[] | undefined): readonly import('./block-definition.types').BlockStateDefinition[] {
  if (!properties?.length) return base;
  const merged = new Map(base.map((definition) => [definition.name, definition]));
  for (const property of properties) {
    const current = merged.get(property.name);
    merged.set(property.name, { name: property.name, values: [...new Set([...(current?.values ?? []), ...property.values])].sort(), derived: property.derived || current?.derived === true ? true : undefined });
  }
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function renderClassification(capability: Extract<BlockCapability, { kind: 'standard-json-render' | 'special-renderer' | 'intentionally-invisible' }> | undefined): BlockVisualClassification | undefined {
  return capability?.kind === 'standard-json-render' ? 'standard-json' : capability?.kind === 'special-renderer' ? 'special-renderer-required' : capability?.kind === 'intentionally-invisible' ? 'intentionally-invisible' : undefined;
}

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}
