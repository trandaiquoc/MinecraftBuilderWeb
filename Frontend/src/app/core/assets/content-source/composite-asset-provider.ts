import { AssetResourceProvider } from '../../blocks/resolver/resolver.types';
import { ContentSourceDescriptor, ContentSourceProvider, RenderableAssetResourceProvider } from './content-source.types';
import { resolveResourceLocation } from '../../content/resource-location';

export interface ResourceContributionConflict {
  readonly path: string;
  readonly sourceIds: readonly string[];
  readonly kind: 'resource-collision' | 'tag-replacement';
}

/** Routes resources by exact path while allowing additive cross-namespace contributions. */
export class CompositeAssetResourceProvider implements AssetResourceProvider, RenderableAssetResourceProvider {
  private readonly providers = new Map<string, ContentSourceProvider>();
  private readonly providerPaths = new Map<string, readonly string[]>();
  private revisionValue = 0;
  private activeVersion = '1.21.1';

  setActiveVersion(version: string): void {
    if (this.providers.size && [...this.providers.values()].some((provider) => provider.source.minecraftVersion !== version)) throw new Error('Remove content sources before changing the active Minecraft version.');
    this.activeVersion = version;
  }
  get revision(): number { return this.revisionValue; }
  get generation(): number { return this.revisionValue; }
  get gameVersion(): string | undefined { return this.sources()[0]?.minecraftVersion; }
  sources(): readonly ContentSourceDescriptor[] { return [...this.providers.values()].map((provider) => provider.source); }

  register(provider: ContentSourceProvider): void {
    if (provider.source.minecraftVersion !== this.activeVersion) throw new Error(`Unsupported content source Minecraft version: ${provider.source.minecraftVersion}. Expected ${this.activeVersion}.`);
    if (this.providers.has(provider.source.id)) throw new Error(`Content source is already registered: ${provider.source.id}`);
    const conflicts = this.inspectProvider(provider);
    if (conflicts.length) throw new Error(formatConflict(conflicts[0]));
    this.providers.set(provider.source.id, provider);
    this.providerPaths.set(provider.source.id, [...(provider.paths?.() ?? [])]);
    this.revisionValue += 1;
  }

  remove(sourceId: string): boolean {
    const provider = this.providers.get(sourceId); if (!provider) return false;
    this.providers.delete(sourceId); this.providerPaths.delete(sourceId); provider.dispose?.(); this.revisionValue += 1; return true;
  }

  replace(provider: ContentSourceProvider): void {
    const existing = this.providers.get(provider.source.id);
    if (!existing) { this.register(provider); return; }
    const previousPaths = this.providerPaths.get(existing.source.id) ?? [];
    this.providers.delete(existing.source.id);
    this.providerPaths.delete(existing.source.id);
    this.revisionValue += 1;
    try {
      this.register(provider);
      existing.dispose?.();
    } catch (error) {
      this.providers.set(existing.source.id, existing);
      this.providerPaths.set(existing.source.id, [...previousPaths]);
      this.revisionValue += 1;
      throw error;
    }
  }

  providerForSource(sourceId: string): ContentSourceProvider | undefined { return this.providers.get(sourceId); }
  providersForNamespace(namespace: string): readonly ContentSourceProvider[] { return [...this.providers.values()].filter((provider) => provider.source.namespaces.includes(namespace)); }
  /** @deprecated Namespace is not exclusive ownership. Use providersForNamespace or effectiveResource. */
  providerForNamespace(namespace: string): ContentSourceProvider | undefined { return this.providersForNamespace(namespace)[0]; }
  providerForExactPath(path: string): readonly ContentSourceProvider[] {
    const explicit = [...this.providers.values()].filter((provider) => this.providerPaths.get(provider.source.id)?.includes(path));
    if (explicit.length) return explicit;
    const namespace = /^assets\/([^/]+)\//.exec(path)?.[1] ?? /^data\/([^/]+)\//.exec(path)?.[1];
    return namespace ? this.providersForNamespace(namespace).filter((provider) => !(this.providerPaths.get(provider.source.id)?.length)) : [];
  }
  inspectConflicts(): readonly ResourceContributionConflict[] { return this.collectConflicts(); }
  inspectProvider(provider: ContentSourceProvider): readonly ResourceContributionConflict[] {
    const conflicts: ResourceContributionConflict[] = [];
    for (const path of provider.paths?.() ?? []) {
      const existing = this.providerForExactPath(path).filter((candidate) => candidate.source.id !== provider.source.id);
      if (!existing.length) continue;
      if (isTagPath(path)) {
        const replacement = provider.readJson(path); const replaces = isReplaceTag(replacement);
        if (replaces || existing.some((candidate) => isReplaceTag(candidate.readJson(path)))) conflicts.push({ path, sourceIds: [...existing.map((candidate) => candidate.source.id), provider.source.id].sort(), kind: 'tag-replacement' });
      } else conflicts.push({ path, sourceIds: [...existing.map((candidate) => candidate.source.id), provider.source.id].sort(), kind: 'resource-collision' });
    }
    return conflicts;
  }

  readJson(path: string): unknown | undefined {
    const candidates = this.providerForExactPath(path);
    if (isTagPath(path) && candidates.length > 1) return mergeTagValues(candidates.map((provider) => provider.readJson(path)));
    return candidates[0]?.readJson(path);
  }
  readBinary(path: string): Uint8Array | undefined { return this.effectiveResource(path)?.readBinary?.(path); }
  textureUrl(resource: string): string | undefined {
    const location = resolveResourceLocation(resource.replace(/^textures\//, '').replace(/\.png$/, ''));
    if (!location) return undefined;
    const [namespace, path] = location.split(':', 2);
    const assetPath = `assets/${namespace}/textures/${path}.png`;
    return this.effectiveResource(assetPath)?.textureUrl?.(location);
  }
  paths(): readonly string[] { return [...new Set([...this.providerPaths.values()].flat())].sort(); }

  private effectiveResource(path: string): ContentSourceProvider | undefined { return this.providerForExactPath(path)[0]; }
  private collectConflicts(): readonly ResourceContributionConflict[] {
    const byPath = new Map<string, ContentSourceProvider[]>();
    for (const provider of this.providers.values()) for (const path of this.providerPaths.get(provider.source.id) ?? []) byPath.set(path, [...(byPath.get(path) ?? []), provider]);
    return [...byPath].flatMap(([path, providers]): ResourceContributionConflict[] => providers.length < 2 ? [] : isTagPath(path) ? (providers.some((provider) => isReplaceTag(provider.readJson(path))) ? [{ path, sourceIds: providers.map((provider) => provider.source.id).sort(), kind: 'tag-replacement' }] : []) : [{ path, sourceIds: providers.map((provider) => provider.source.id).sort(), kind: 'resource-collision' }]);
  }
}

function isTagPath(path: string): boolean { return /^data\/[^/]+\/tags\/(?:block|item|painting_variant)\/.+\.json$/.test(path); }
function isReplaceTag(value: unknown): boolean { return !!value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>)['replace'] === true; }
function formatConflict(conflict: ResourceContributionConflict): string { return `${conflict.kind === 'tag-replacement' ? 'Tag replacement' : 'Resource collision'} at ${conflict.path} (${conflict.sourceIds.join(', ')})`; }
function mergeTagValues(values: readonly unknown[]): unknown {
  const merged: Record<string, unknown> = { replace: false, values: [] };
  const entries = new Set<string>();
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record['values'])) for (const entry of record['values']) if (typeof entry === 'string' && !entries.has(entry)) { entries.add(entry); (merged['values'] as string[]).push(entry); }
  }
  return merged;
}
