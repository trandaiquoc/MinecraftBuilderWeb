import { BlockStateDefinition, DefaultStateSource } from './block-definition.types';

export const VANILLA_BLOCK_REGISTRY_URL = 'assets/vanilla-block-registry-1.21.1.json';

export interface VanillaBlockRegistryEntry {
  readonly id: string;
  readonly properties: readonly BlockStateDefinition[];
  readonly defaultState: Readonly<Record<string, string>>;
}

export interface VanillaBlockRegistryDocument {
  readonly schemaVersion: 1;
  readonly minecraftVersion: '1.21.1';
  readonly source: string;
  readonly blocks: readonly VanillaBlockRegistryEntry[];
}

export class VanillaBlockRegistry {
  private readonly entries: ReadonlyMap<string, VanillaBlockRegistryEntry>;

  constructor(readonly document: VanillaBlockRegistryDocument) {
    this.entries = new Map(document.blocks.map((entry) => [entry.id, entry]));
  }

  get(id: string): VanillaBlockRegistryEntry | undefined { return this.entries.get(id); }
  all(): readonly VanillaBlockRegistryEntry[] { return [...this.entries.values()]; }
}

export async function loadVanillaBlockRegistry(fetcher: typeof fetch = fetch): Promise<VanillaBlockRegistry> {
  const response = await fetcher(VANILLA_BLOCK_REGISTRY_URL);
  if (!response.ok) throw new Error(`Unable to load vanilla block registry (${response.status})`);
  return parseVanillaBlockRegistry(await response.json());
}

export function parseVanillaBlockRegistry(value: unknown): VanillaBlockRegistry {
  const document = record(value);
  if (document['schemaVersion'] !== 1 || document['minecraftVersion'] !== '1.21.1' || typeof document['source'] !== 'string' || !Array.isArray(document['blocks'])) throw new Error('Invalid vanilla block registry header');
  const seen = new Set<string>();
  const blocks = document['blocks'].map((item, index): VanillaBlockRegistryEntry => {
    const block = record(item); const id = block['id']; const properties = block['properties']; const defaultState = record(block['defaultState']);
    if (typeof id !== 'string' || !/^minecraft:[a-z0-9_./-]+$/.test(id) || seen.has(id) || !Array.isArray(properties)) throw new Error(`Invalid vanilla registry entry at index ${index}`);
    seen.add(id);
    const definitions = properties.map((item): BlockStateDefinition => {
      const property = record(item); const name = property['name']; const values = property['values'];
      if (typeof name !== 'string' || !Array.isArray(values) || !values.length || values.some((option) => typeof option !== 'string')) throw new Error(`Invalid property definition for ${id}`);
      const selected = defaultState[name];
      if (typeof selected !== 'string' || !values.includes(selected)) throw new Error(`Missing authoritative default for ${id}.${name}`);
      return { name, values: [...values] as string[] };
    });
    if (Object.keys(defaultState).length !== definitions.length || Object.values(defaultState).some((option) => typeof option !== 'string')) throw new Error(`Incomplete authoritative default state for ${id}`);
    return { id, properties: definitions, defaultState: { ...defaultState } as Readonly<Record<string, string>> };
  });
  return new VanillaBlockRegistry({ schemaVersion: 1, minecraftVersion: '1.21.1', source: document['source'], blocks });
}

export const AUTHORITATIVE_DEFAULT_STATE_SOURCE: DefaultStateSource = 'authoritative-report';

function record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
