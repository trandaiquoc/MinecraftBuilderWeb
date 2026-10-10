import { PlacedBlock } from '../../domain/project.types';
import { resolveResourceLocation } from '../../content/resource-location';
import { createCommonSignAdapter, SignVisualProvider } from './sign-visual-provider';
import { BedVisualProvider } from './bed-visual-provider';
import { HeadSkullVisualProvider } from './head-skull-visual-provider';
import { ChestVisualProvider } from './chest-visual-provider';
import { ShulkerBoxVisualProvider } from './shulker-box-visual-provider';
import { DecoratedPotVisualProvider } from './decorated-pot-visual-provider';
import { BannerVisualProvider } from './banner-visual-provider';
import { ConduitVisualProvider } from './conduit-visual-provider';
import { BarrelFallbackVisualProvider } from './barrel-fallback-provider';
import type {
  BedVisualDescriptor,
  NormalizedSpecialVisualDescriptor,
  SpecialBlockVisualAdapter,
  SpecialVisualCompatibility,
  SpecialVisualResourceProvider,
} from './special-visual-contracts';
import { SPECIAL_VISUAL_COMPATIBILITY } from './special-visual-contracts';

/** Static editor visuals for vanilla blocks which have no generic JSON elements. */
export class SpecialBlockVisualRegistry {
  private readonly beds: BedVisualProvider;
  private readonly signs: SignVisualProvider;
  private readonly heads: HeadSkullVisualProvider;
  private readonly adapters: SpecialBlockVisualAdapter[];
  private readonly descriptorAdapters = new Map<string, SpecialBlockVisualAdapter>();
  private readonly resources?: SpecialVisualResourceProvider;
  constructor(gameVersionOrResources: string | SpecialVisualResourceProvider = '1.21.1') {
    this.resources =
      typeof gameVersionOrResources === 'string' ? undefined : gameVersionOrResources;
    this.beds = new BedVisualProvider();
    this.signs = new SignVisualProvider();
    this.heads = new HeadSkullVisualProvider();
    this.adapters = [
      this.beds,
      new ChestVisualProvider(),
      new BarrelFallbackVisualProvider(),
      this.signs,
      new BannerVisualProvider(),
      this.heads,
      new ShulkerBoxVisualProvider(),
      new DecoratedPotVisualProvider(),
      new ConduitVisualProvider(),
    ];
  }
  registerBed(descriptor: BedVisualDescriptor): void {
    this.beds.register(descriptor);
  }
  /** Replace transient content descriptors with the current authoritative set. */
  setDescriptors(descriptors: readonly NormalizedSpecialVisualDescriptor[]): void {
    this.descriptorAdapters.clear();
    for (const descriptor of descriptors) this.registerDescriptor(descriptor);
  }
  registerDescriptor(descriptor: NormalizedSpecialVisualDescriptor): void {
    const adapter = createCommonSignAdapter(descriptor);
    if (!adapter) return;
    const texture = descriptor.resources['default'] ?? descriptor.resources['front']!;
    const key = `${descriptor.contentId}|${descriptor.contractId}|${texture}`;
    if (this.descriptorAdapters.has(key)) return;
    this.descriptorAdapters.set(key, adapter);
  }
  private candidates(): readonly SpecialBlockVisualAdapter[] {
    return [...this.descriptorAdapters.values(), ...this.adapters];
  }
  resolve(block: PlacedBlock): SpecialBlockVisualAdapter | undefined {
    return this.resolveCompatible(block) ?? this.resolveDiagnosticFallback(block);
  }
  resolveCompatible(block: PlacedBlock): SpecialBlockVisualAdapter | undefined {
    return this.inspect(block).adapter;
  }
  reusableVisualKey(block: PlacedBlock): string | undefined {
    const adapter = this.resolveCompatible(block);
    if (!adapter?.staticBatchable) return undefined;
    const state = Object.entries(block.state)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name}=${value}`)
      .join(',');
    return `special-template-v1|${adapter.family}|${block.id}|${state}`;
  }
  resolveDiagnosticFallback(block: PlacedBlock): SpecialBlockVisualAdapter | undefined {
    return this.candidates().find((candidate) => candidate.matches(block));
  }
  /** Resolve only verified static item-backed special visuals. This is a
   * capability boundary, not a namespace/name heuristic for arbitrary items. */
  resolveItemVisual(
    itemId: string,
    components?: Readonly<Record<string, unknown>>,
  ): SpecialBlockVisualAdapter | undefined {
    return this.heads.matchesItemVisual(itemId, components) ? this.heads : undefined;
  }
  inspect(block: PlacedBlock): SpecialVisualCompatibility {
    const adapter = this.candidates().find((candidate) => candidate.matches(block));
    if (!adapter) return { missingResources: [] };
    const missingResources = this.resourcesSupport(adapter, block);
    return {
      adapter: missingResources.length ? undefined : adapter,
      family: adapter.family,
      missingResources,
    };
  }
  private resourcesSupport(
    adapter: SpecialBlockVisualAdapter,
    block: PlacedBlock,
  ): readonly string[] {
    if (!this.resources) return [];
    const resources =
      adapter.textureResources?.(block) ??
      (adapter.textureResource?.(block) ? { default: adapter.textureResource(block)! } : {});
    return Object.values(resources)
      .map(resourcePath)
      .filter((path) => !this.resources?.readBinary(path));
  }
}

function resourcePath(resource: string): string {
  if (resource.startsWith('assets/'))
    return resource.endsWith('.png') ? resource : `${resource}.png`;
  const normalized = resolveResourceLocation(
    resource.replace(/^textures\//, '').replace(/\.png$/, ''),
  );
  if (!normalized) return resource;
  const [namespace, path] = normalized.split(':', 2);
  return `assets/${namespace}/textures/${path}.png`;
}
