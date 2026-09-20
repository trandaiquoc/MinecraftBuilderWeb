import type { AssetBlockRecord, BlockDefinition, BlockVisualClassification, NormalizedBlockDefinition } from './block-definition.types';
import { deriveBlockCapabilities } from '../capabilities/block-capability-resolver';
import type { BlockCapability } from '../capabilities/block-capability.types';

export interface BlockCatalogSource {
  readonly minecraftVersion: '1.21.1';
  readonly blocks: readonly AssetBlockRecord[];
}

export class BlockCatalog {
  private readonly entries = new Map<string, NormalizedBlockDefinition>();
  private readonly searchIndex = new Map<string, string>();

  load(source: BlockCatalogSource): void {
    if (source.minecraftVersion !== '1.21.1') throw new Error(`Unsupported Minecraft version: ${source.minecraftVersion}`);
    for (const record of source.blocks) {
      const definition = toDefinition(record);
      if (this.entries.has(definition.id)) throw new Error(`Duplicate block ID: ${definition.id}`);
      this.entries.set(definition.id, definition);
      this.searchIndex.set(definition.id, [definition.displayName, definition.id, definition.namespace, definition.modName ?? ''].map(normalizeSearchText).join('\u0000'));
    }
  }

  get(id: string): NormalizedBlockDefinition | undefined { return this.entries.get(id); }
  all(): readonly NormalizedBlockDefinition[] { return [...this.entries.values()]; }

  search(query: string): readonly BlockDefinition[] {
    const normalized = normalizeSearchText(query);
    if (!normalized) return this.all();
    return this.all().filter((block) => this.searchIndex.get(block.id)?.includes(normalized) ?? false);
  }
}

function toDefinition(record: AssetBlockRecord): NormalizedBlockDefinition {
  const separator = record.id.indexOf(':');
  if (separator <= 0 || separator === record.id.length - 1) throw new Error(`Invalid block registry ID: ${record.id}`);
  const namespace = record.id.slice(0, separator);
  const support = record.support ?? 'fallback';
  const explicitRender = record.capabilities?.find((capability): capability is Extract<BlockCapability, { kind: 'standard-json-render' | 'special-renderer' | 'intentionally-invisible' }> => capability.kind === 'standard-json-render' || capability.kind === 'special-renderer' || capability.kind === 'intentionally-invisible');
  const visualClassification = record.visualClassification ?? renderClassification(explicitRender) ?? 'standard-json';
  const hasVisualEvidence = !!record.visualClassification || !!explicitRender || !!record.resources.blockstate || !!record.resources.model;
  return {
    ...record,
    namespace,
    support,
    behaviorSupport: record.behaviorSupport ?? (record.behavior ? support === 'full' ? 'full' : 'partial' : 'unknown'),
    visualSupport: record.visualSupport ?? (support === 'full' ? 'real' : support),
    visualClassification,
    defaultStateSource: record.defaultStateSource ?? 'unknown',
    capabilities: deriveBlockCapabilities({ behavior: record.behavior, visualClassification: hasVisualEvidence ? visualClassification : undefined, visualClassificationEvidence: record.visualClassificationEvidence ?? (record.visualClassification ? 'verified' : explicitRender?.evidence), stateDefinitions: record.stateDefinitions, explicit: record.capabilities }),
  };
}

function renderClassification(capability: Extract<BlockCapability, { kind: 'standard-json-render' | 'special-renderer' | 'intentionally-invisible' }> | undefined): BlockVisualClassification | undefined {
  return capability?.kind === 'standard-json-render' ? 'standard-json' : capability?.kind === 'special-renderer' ? 'special-renderer-required' : capability?.kind === 'intentionally-invisible' ? 'intentionally-invisible' : undefined;
}

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}
