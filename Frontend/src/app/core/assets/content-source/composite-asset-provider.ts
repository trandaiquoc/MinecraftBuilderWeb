import { AssetResourceProvider } from '../../blocks/resolver/resolver.types';
import { ContentSourceDescriptor, ContentSourceProvider, RenderableAssetResourceProvider } from './content-source.types';

/** Routes namespaced resources to their explicitly registered owner. */
export class CompositeAssetResourceProvider implements AssetResourceProvider, RenderableAssetResourceProvider {
  private readonly owners = new Map<string, ContentSourceProvider>();
  private readonly providers = new Map<string, ContentSourceProvider>();
  private revisionValue = 0;

  get revision(): number { return this.revisionValue; }
  get generation(): number { return this.revisionValue; }
  get gameVersion(): string | undefined { return this.sources()[0]?.minecraftVersion; }
  sources(): readonly ContentSourceDescriptor[] { return [...this.providers.values()].map((provider) => provider.source); }

  register(provider: ContentSourceProvider): void {
    if (this.providers.has(provider.source.id)) throw new Error(`Content source is already registered: ${provider.source.id}`);
    for (const namespace of provider.source.namespaces) {
      if (this.owners.has(namespace)) throw new Error(`Content namespace is already owned: ${namespace}`);
    }
    this.providers.set(provider.source.id, provider);
    for (const namespace of provider.source.namespaces) this.owners.set(namespace, provider);
    this.revisionValue += 1;
  }

  remove(sourceId: string): boolean {
    const provider = this.providers.get(sourceId);
    if (!provider) return false;
    this.providers.delete(sourceId);
    for (const namespace of provider.source.namespaces) if (this.owners.get(namespace) === provider) this.owners.delete(namespace);
    provider.dispose?.();
    this.revisionValue += 1;
    return true;
  }

  replace(provider: ContentSourceProvider): void {
    const existing = this.providers.get(provider.source.id);
    for (const namespace of provider.source.namespaces) {
      const owner = this.owners.get(namespace);
      if (owner && owner !== existing) throw new Error(`Content namespace is already owned: ${namespace}`);
    }
    if (existing) this.remove(provider.source.id);
    this.register(provider);
  }

  providerForNamespace(namespace: string): ContentSourceProvider | undefined { return this.owners.get(namespace); }
  providerForSource(sourceId: string): ContentSourceProvider | undefined { return this.providers.get(sourceId); }

  readJson(path: string): unknown | undefined { return this.providerForPath(path)?.readJson(path); }
  readBinary(path: string): Uint8Array | undefined { return this.providerForPath(path)?.readBinary?.(path); }
  textureUrl(resource: string): string | undefined {
    const [namespace, path] = resource.includes(':') ? resource.split(':', 2) : ['minecraft', resource];
    return this.owners.get(namespace)?.textureUrl?.(`${namespace}:${path}`);
  }
  paths(): readonly string[] { return [...this.providers.values()].flatMap((provider) => provider.paths?.() ?? []); }

  private providerForPath(path: string): ContentSourceProvider | undefined {
    const match = /^assets\/([^/]+)\//.exec(path);
    return match ? this.owners.get(match[1]) : undefined;
  }
}
