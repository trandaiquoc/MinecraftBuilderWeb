import { AssetResourceProvider } from '../blocks/resolver/resolver.types';

export interface DecorationItemDefinition { readonly id: string; readonly displayName: string; }

/** Indexes item model paths only; model resolution remains lazy until a frame is rendered. */
export class ItemCatalog {
  private entries: readonly DecorationItemDefinition[] = [];
  load(provider: AssetResourceProvider & { paths?: () => readonly string[] }): void {
    const paths = provider.paths?.() ?? [];
    const language = provider.readJson('assets/minecraft/lang/en_us.json');
    const values = language && typeof language === 'object' ? language as Record<string, unknown> : {};
    this.entries = paths.filter((path) => /^assets\/[^/]+\/models\/item\/[^/]+\.json$/.test(path)).map((path) => {
      const match = /^assets\/([^/]+)\/models\/item\/(.+)\.json$/.exec(path)!;
      const id = `${match[1]}:${match[2]}`;
      const key = `item.${match[2]}`;
      return { id, displayName: typeof values[key] === 'string' ? values[key] as string : humanize(match[2]) };
    }).filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index && entry.id !== 'minecraft:air').sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  search(query: string): readonly DecorationItemDefinition[] { const value = query.trim().toLowerCase(); return value ? this.entries.filter((entry) => `${entry.displayName} ${entry.id}`.toLowerCase().includes(value)).slice(0, 100) : this.entries.slice(0, 100); }
  all(): readonly DecorationItemDefinition[] { return this.entries; }
}

function humanize(value: string): string { return value.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '); }
