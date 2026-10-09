import { AssetResourceProvider } from '../../blocks/resolver/resolver.types';
import { ContentSourceDescriptor, ContentSourceProvider, RenderableAssetResourceProvider } from './content-source.types';
import { resolveResourceLocation } from '../../content/resource-location';

export interface ResourceContributionConflict {
  readonly path: string;
  readonly sourceIds: readonly string[];
  readonly kind: 'resource-collision' | 'tag-replacement';
}

export interface ContentSourcePublication {
  readonly provider: ContentSourceProvider;
  readonly replaceExisting?: boolean;
}

export interface ContentSourceCleanupFailure {
  readonly sourceId: string;
  readonly error: unknown;
}

/** Indicates publication succeeded, but one or more retired providers failed cleanup. */
export class ContentSourceCleanupError extends Error {
  readonly committed = true;

  constructor(readonly failures: readonly ContentSourceCleanupFailure[]) {
    super(`Content source publication committed, but cleanup failed for: ${failures.map(({ sourceId }) => sourceId).join(', ')}.`);
    this.name = 'ContentSourceCleanupError';
  }
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
  get activeMinecraftVersion(): string { return this.activeVersion; }
  get revision(): number { return this.revisionValue; }
  get generation(): number { return this.revisionValue; }
  get gameVersion(): string | undefined { return this.sources()[0]?.minecraftVersion; }
  sources(): readonly ContentSourceDescriptor[] { return [...this.providers.values()].map((provider) => provider.source); }

  register(provider: ContentSourceProvider): void {
    this.commitBatch([{ provider }]);
  }

  remove(sourceId: string): boolean {
    const provider = this.providers.get(sourceId); if (!provider) return false;
    this.providers.delete(sourceId);
    this.providerPaths.delete(sourceId);
    this.revisionValue += 1;
    this.disposeRetired([{ sourceId, provider }]);
    return true;
  }

  replace(provider: ContentSourceProvider): void {
    this.commitBatch([{ provider, replaceExisting: true }]);
  }

  /** Prepares every route before publishing any, then retires replaced providers. */
  commitBatch(publications: readonly ContentSourcePublication[]): void {
    if (!publications.length) return;

    const publicationIds = new Set<string>();
    const prepared = publications.map(({ provider, replaceExisting }) => {
      const id = provider.source.id;
      if (provider.source.minecraftVersion !== this.activeVersion) throw new Error(`Unsupported content source Minecraft version: ${provider.source.minecraftVersion}. Expected ${this.activeVersion}.`);
      if (publicationIds.has(id)) throw new Error(`Content source is duplicated in batch: ${id}`);
      publicationIds.add(id);
      const existing = this.providers.get(id);
      if (existing && !replaceExisting) throw new Error(`Content source is already registered: ${id}`);
      const paths = existing === provider
        ? [...(this.providerPaths.get(id) ?? [])]
        : [...new Set(provider.paths?.() ?? [])];
      return { id, provider, paths, existing };
    });

    const conflicts = this.findPublicationConflicts(prepared);
    if (conflicts.length) throw new Error(formatConflict(conflicts[0]));

    const retired: { sourceId: string; provider: ContentSourceProvider }[] = [];
    let changed = 0;
    for (const entry of prepared) {
      if (entry.existing === entry.provider) continue;
      this.providers.set(entry.id, entry.provider);
      this.providerPaths.set(entry.id, entry.paths);
      changed += 1;
      if (entry.existing) retired.push({ sourceId: entry.id, provider: entry.existing });
    }
    this.revisionValue += changed;
    this.disposeRetired(retired);
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
  private findPublicationConflicts(prepared: readonly { readonly id: string; readonly provider: ContentSourceProvider; readonly paths: readonly string[] }[]): ResourceContributionConflict[] {
    const replacingIds = new Set(prepared.map(({ id }) => id));
    const candidatesAtPath = (path: string): ContentSourceProvider[] => {
      const explicit = [...this.providers.values()].filter((candidate) => !replacingIds.has(candidate.source.id) && this.providerPaths.get(candidate.source.id)?.includes(path));
      if (explicit.length) return explicit;
      const namespace = /^assets\/([^/]+)\//.exec(path)?.[1] ?? /^data\/([^/]+)\//.exec(path)?.[1];
      return namespace ? [...this.providers.values()].filter((candidate) => !replacingIds.has(candidate.source.id) && candidate.source.namespaces.includes(namespace) && !(this.providerPaths.get(candidate.source.id)?.length)) : [];
    };
    const conflicts: ResourceContributionConflict[] = [];
    const staged = new Map<string, ContentSourceProvider[]>();
    for (const entry of prepared) {
      for (const path of entry.paths) {
        const existing = candidatesAtPath(path);
        const previous = staged.get(path);
        const otherStaged = previous ?? [];
        const providers = [...existing, ...otherStaged];
        if (providers.length) {
          const additiveTag = isTagPath(path) && providers.every((candidate) => !isReplaceTag(candidate.readJson(path))) && !isReplaceTag(entry.provider.readJson(path));
          if (!additiveTag) conflicts.push({ path, sourceIds: [...providers.map((candidate) => candidate.source.id), entry.id].sort(), kind: isTagPath(path) ? 'tag-replacement' : 'resource-collision' });
        }
        if (previous) previous.push(entry.provider);
        else staged.set(path, [entry.provider]);
      }
    }
    return conflicts;
  }

  private disposeRetired(retired: readonly { readonly sourceId: string; readonly provider: ContentSourceProvider }[]): void {
    const failures: ContentSourceCleanupFailure[] = [];
    for (const { sourceId, provider } of retired) {
      try { provider.dispose?.(); }
      catch (error) { failures.push({ sourceId, error }); }
    }
    if (failures.length) throw new ContentSourceCleanupError(failures);
  }

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
