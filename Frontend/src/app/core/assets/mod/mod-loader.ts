export type SupportedModLoader = 'fabric' | 'forge' | 'neoforge' | 'quilt' | 'unknown';

export type ModCompatibilityStatus = 'compatible' | 'incompatible' | 'unknown';

export interface ModCompatibilityResult {
  readonly status: ModCompatibilityStatus;
  readonly reason: string;
  readonly expression?: string | readonly string[];
}

export interface NormalizedModMetadata {
  readonly loader: SupportedModLoader;
  readonly schemaVersion?: number;
  readonly modId: string;
  readonly displayName: string;
  readonly modVersion: string;
  readonly description?: string;
  readonly minecraftRequirement?: string | readonly string[];
  readonly runtimeDependencies: Readonly<Record<string, unknown>>;
  readonly optionalDependencies: Readonly<Record<string, unknown>>;
  readonly environment?: string;
  readonly icon?: string;
  readonly breaks: Readonly<Record<string, unknown>>;
  readonly conflicts: Readonly<Record<string, unknown>>;
  readonly nestedJars: readonly unknown[];
}

export interface ModLoaderAdapter {
  readonly loader: SupportedModLoader;
  detect(paths: readonly string[]): boolean;
  inspectMetadata(value: unknown): NormalizedModMetadata;
}

export class FabricModLoaderAdapter implements ModLoaderAdapter {
  readonly loader = 'fabric' as const;
  detect(paths: readonly string[]): boolean { return paths.includes('fabric.mod.json'); }
  inspectMetadata(value: unknown): NormalizedModMetadata { return normalizeFabricMetadata(value); }
}

export function modLoaderAdapter(loader: SupportedModLoader): ModLoaderAdapter | undefined { return loader === 'fabric' ? new FabricModLoaderAdapter() : undefined; }

export function detectLoader(paths: readonly string[]): SupportedModLoader {
  if (paths.includes('fabric.mod.json')) return 'fabric';
  if (paths.includes('quilt.mod.json')) return 'quilt';
  if (paths.includes('META-INF/neoforge.mods.toml')) return 'neoforge';
  if (paths.includes('META-INF/mods.toml')) return 'forge';
  return 'unknown';
}

export function normalizeFabricMetadata(value: unknown): NormalizedModMetadata {
  const source = record(value);
  const id = stringValue(source['id']);
  if (!id || !/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error('fabric.mod.json has an invalid mod id');
  const version = stringValue(source['version']);
  if (!version) throw new Error('fabric.mod.json has no valid version');
  const depends = record(source['depends']);
  const recommends = record(source['recommends']);
  const suggestions = record(source['suggests']);
  return {
    loader: 'fabric',
    schemaVersion: typeof source['schemaVersion'] === 'number' ? source['schemaVersion'] as number : undefined,
    modId: id,
    displayName: stringValue(source['name']) ?? id,
    modVersion: version,
    description: stringValue(source['description']),
    minecraftRequirement: dependencyValue(depends['minecraft']),
    runtimeDependencies: depends,
    optionalDependencies: { ...recommends, ...suggestions },
    environment: stringValue(source['environment']),
    icon: safeIcon(source['icon']),
    breaks: record(source['breaks']),
    conflicts: record(source['conflicts']),
    nestedJars: Array.isArray(source['jars']) ? source['jars'] : [],
  };
}

function dependencyValue(value: unknown): string | readonly string[] | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim())) return value.map((entry) => (entry as string).trim());
  return undefined;
}
function safeIcon(value: unknown): string | undefined {
  if (typeof value === 'string' && value.startsWith('assets/') && !value.includes('..')) return value;
  return undefined;
}
function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
