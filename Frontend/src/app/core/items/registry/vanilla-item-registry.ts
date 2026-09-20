export const VANILLA_ITEM_REGISTRY_URL = 'assets/vanilla-item-registry-1.21.1.json';

export interface VanillaItemRegistryEntry {
  readonly id: string;
  readonly defaultComponents?: Readonly<Record<string, unknown>>;
}

export interface VanillaItemRegistryDocument {
  readonly schemaVersion: 1;
  readonly minecraftVersion: '1.21.1';
  readonly source: string;
  readonly items: readonly VanillaItemRegistryEntry[];
}

export class VanillaItemRegistry {
  private readonly entries: ReadonlyMap<string, VanillaItemRegistryEntry>;

  constructor(readonly document: VanillaItemRegistryDocument) {
    this.entries = new Map(document.items.map((entry) => [entry.id, entry]));
  }

  get(id: string): VanillaItemRegistryEntry | undefined { return this.entries.get(id); }
  all(): readonly VanillaItemRegistryEntry[] { return [...this.entries.values()]; }
}

export async function loadVanillaItemRegistry(fetcher: typeof fetch = fetch): Promise<VanillaItemRegistry> {
  const response = await fetcher(VANILLA_ITEM_REGISTRY_URL);
  if (!response.ok) throw new Error(`Unable to load vanilla item registry (${response.status})`);
  return parseVanillaItemRegistry(await response.json());
}

export function parseVanillaItemRegistry(value: unknown): VanillaItemRegistry {
  const document = record(value);
  if (document['schemaVersion'] !== 1 || document['minecraftVersion'] !== '1.21.1' || typeof document['source'] !== 'string' || !Array.isArray(document['items'])) throw new Error('Invalid vanilla item registry header');
  const seen = new Set<string>();
  const items = document['items'].map((value, index): VanillaItemRegistryEntry => {
    const item = record(value); const id = item['id']; const components = item['defaultComponents'];
    if (typeof id !== 'string' || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id) || seen.has(id)) throw new Error(`Invalid vanilla item registry entry at index ${index}`);
    seen.add(id);
    if (components !== undefined && (typeof components !== 'object' || components === null || Array.isArray(components))) throw new Error(`Invalid default components for ${id}`);
    return { id, ...(components ? { defaultComponents: { ...components as Record<string, unknown> } } : {}) };
  });
  return new VanillaItemRegistry({ schemaVersion: 1, minecraftVersion: '1.21.1', source: document['source'], items });
}

function record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
