import { AssetBlockRecord, BlockDefinition } from './block-definition.types';

export interface BlockCatalogSource {
  readonly minecraftVersion: '1.21.1';
  readonly blocks: readonly AssetBlockRecord[];
}

export class BlockCatalog {
  private readonly entries = new Map<string, BlockDefinition>();
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

  get(id: string): BlockDefinition | undefined { return this.entries.get(id); }
  all(): readonly BlockDefinition[] { return [...this.entries.values()]; }

  search(query: string): readonly BlockDefinition[] {
    const normalized = normalizeSearchText(query);
    if (!normalized) return this.all();
    return this.all().filter((block) => this.searchIndex.get(block.id)?.includes(normalized) ?? false);
  }
}

function toDefinition(record: AssetBlockRecord): BlockDefinition {
  const separator = record.id.indexOf(':');
  if (separator <= 0 || separator === record.id.length - 1) throw new Error(`Invalid block registry ID: ${record.id}`);
  const namespace = record.id.slice(0, separator);
  const support = record.support ?? 'fallback';
  return {
    ...record,
    namespace,
    support,
    behaviorSupport: record.behaviorSupport ?? (record.behavior ? support === 'full' ? 'full' : 'partial' : 'unknown'),
    visualSupport: record.visualSupport ?? (support === 'full' ? 'real' : support),
    visualClassification: record.visualClassification ?? 'standard-json',
    defaultStateSource: record.defaultStateSource ?? 'unknown',
  };
}

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}
