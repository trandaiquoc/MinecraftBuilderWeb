import { AssetResourceProvider } from '../blocks/resolver/resolver.types';
import { VanillaItemRegistry } from '../items/vanilla-item-registry';

export interface DecorationItemDefinition { readonly id: string; readonly displayName: string; }

/** Indexes registered item IDs; model resources are visual-only and never determine eligibility. */
export class ItemCatalog {
  private entries: readonly DecorationItemDefinition[] = [];
  load(provider: AssetResourceProvider, registry: VanillaItemRegistry): void {
    this.entries = registry.all().filter((entry) => entry.id !== 'minecraft:air').map(({ id }) => {
      const [namespace, path] = id.split(':', 2);
      const language = provider.readJson(`assets/${namespace}/lang/en_us.json`);
      const values = language && typeof language === 'object' ? language as Record<string, unknown> : {};
      const translated = values[`item.${namespace}.${path.replaceAll('/', '.')}`] ?? values[`block.${namespace}.${path.replaceAll('/', '.')}`];
      return { id, displayName: typeof translated === 'string' ? translated : humanize(path) };
    }).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
  }
  search(query: string): readonly DecorationItemDefinition[] {
    const value = normalize(query);
    return (value ? this.entries.filter((entry) => normalize(`${entry.displayName} ${entry.id}`).includes(value)) : this.entries).slice(0, 100);
  }
  all(): readonly DecorationItemDefinition[] { return this.entries; }
}

function normalize(value: string): string { return value.trim().toLowerCase().replace(/\s+/g, ' '); }
function humanize(value: string): string { return value.split('/').at(-1)!.split('_').map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(' '); }
