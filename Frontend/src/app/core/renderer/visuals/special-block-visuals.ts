import * as THREE from 'three';
import { PlacedBlock } from '../../domain/project.types';
import { SpecialModelDescriptor } from './special-model-descriptor';
import { createSpecialModel } from './special-model-geometry';
import { resolveResourceLocation } from '../../content/resource-location';
import { createCommonSignAdapter, SignVisualProvider } from './sign-visual-provider';
import { BedVisualProvider } from './bed-visual-provider';
import { HeadSkullVisualProvider } from './head-skull-visual-provider';
import { ChestVisualProvider } from './chest-visual-provider';
import { ShulkerBoxVisualProvider } from './shulker-box-visual-provider';
import { DecoratedPotVisualProvider } from './decorated-pot-visual-provider';
import type { BedVisualDescriptor, NormalizedSpecialVisualDescriptor, SpecialBlockVisualAdapter, SpecialVisualCompatibility, SpecialVisualContext, SpecialVisualResourceProvider } from './special-visual-contracts';
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
    this.resources = typeof gameVersionOrResources === 'string' ? undefined : gameVersionOrResources;
    this.beds = new BedVisualProvider(); this.signs = new SignVisualProvider(); this.heads = new HeadSkullVisualProvider();
    this.adapters = [this.beds, new ChestVisualProvider(), barrelAdapter, this.signs, bannerAdapter, this.heads, new ShulkerBoxVisualProvider(), new DecoratedPotVisualProvider(), conduitAdapter];
  }
  registerBed(descriptor: BedVisualDescriptor): void { this.beds.register(descriptor); }
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
  private candidates(): readonly SpecialBlockVisualAdapter[] { return [...this.descriptorAdapters.values(), ...this.adapters]; }
  resolve(block: PlacedBlock): SpecialBlockVisualAdapter | undefined {
    return this.resolveCompatible(block) ?? this.resolveDiagnosticFallback(block);
  }
  resolveCompatible(block: PlacedBlock): SpecialBlockVisualAdapter | undefined {
    return this.inspect(block).adapter;
  }
  reusableVisualKey(block: PlacedBlock): string | undefined {
    const adapter = this.resolveCompatible(block);
    if (!adapter?.staticBatchable) return undefined;
    const state = Object.entries(block.state).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join(',');
    return `special-template-v1|${adapter.family}|${block.id}|${state}`;
  }
  resolveDiagnosticFallback(block: PlacedBlock): SpecialBlockVisualAdapter | undefined {
    return this.candidates().find((candidate) => candidate.matches(block));
  }
  /** Resolve only verified static item-backed special visuals. This is a
   * capability boundary, not a namespace/name heuristic for arbitrary items. */
  resolveItemVisual(itemId: string, components?: Readonly<Record<string, unknown>>): SpecialBlockVisualAdapter | undefined {
    return this.heads.matchesItemVisual(itemId, components) ? this.heads : undefined;
  }
  inspect(block: PlacedBlock): SpecialVisualCompatibility {
    const adapter = this.candidates().find((candidate) => candidate.matches(block));
    if (!adapter) return { missingResources: [] };
    const missingResources = this.resourcesSupport(adapter, block);
    return { adapter: missingResources.length ? undefined : adapter, family: adapter.family, missingResources };
  }
  private resourcesSupport(adapter: SpecialBlockVisualAdapter, block: PlacedBlock): readonly string[] {
    if (!this.resources) return [];
    const resources = adapter.textureResources?.(block) ?? (adapter.textureResource?.(block) ? { default: adapter.textureResource(block)! } : {});
    return Object.values(resources).map(resourcePath).filter((path) => !this.resources?.readBinary(path));
  }
}

const material = (color: number, texture?: THREE.Texture) => new THREE.MeshLambertMaterial({ color, map: texture, transparent: true, opacity: .98 });
const box = (root: THREE.Group, size: readonly [number, number, number], at: readonly [number, number, number], color: number, texture?: THREE.Texture) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, texture)); mesh.position.set(...at); root.add(mesh); };
const named = (family: string, match: (id: string) => boolean, build: (block: PlacedBlock) => THREE.Group): SpecialBlockVisualAdapter => ({ family, matches: (block) => match(block.id), create: build });
const colorFromId = (id: string, fallback: number): number => { const name = id.split(':').at(-1) ?? ''; const colors: Record<string, number> = { red: 0xb83832, blue: 0x3f61b7, green: 0x4f8c4e, black: 0x252525, white: 0xe8e6df, yellow: 0xd6b432, purple: 0x744a9c, orange: 0xcb7b32, pink: 0xd47aa4, cyan: 0x4aa7ae, gray: 0x6b6b6b, brown: 0x6e4a31 }; return Object.entries(colors).find(([key]) => name.startsWith(key))?.[1] ?? fallback; };

/** Diagnostic-only fallback. A barrel with usable JSON elements stays on the generic path. */
const barrelAdapter: SpecialBlockVisualAdapter = { family: 'containers', staticBatchable: true, matches: (block) => block.namespace === 'minecraft' && /(?:^|_)barrel$/.test(block.id.split(':').at(-1) ?? block.id), create: (block) => { const root = new THREE.Group(); root.userData['visualFallback'] = 'diagnostic'; root.userData['fallbackReason'] = 'BARREL_GENERIC_RESOURCE_UNAVAILABLE'; box(root, [.92, .58, .92], [.5, .29, .5], 0x8c6035); box(root, [.94, .12, .94], [.5, .64, .5], 0xc28a47); return root; } };
const bannerAdapter: SpecialBlockVisualAdapter = {
  family: 'banners',
  staticBatchable: true,
  matches: (block) => block.namespace === 'minecraft' && (block.id.endsWith('_banner') || block.id.endsWith('_wall_banner')),
  create: (block) => createBannerVisual(block),
};

function createBannerVisual(block: PlacedBlock): THREE.Group {
  const root = new THREE.Group();
  const color = colorFromId(block.id, 0xa23d3d);
  const wall = block.id.endsWith('_wall_banner');
  if (!wall) {
    box(root, [.62, .92, .05], [.5, .57, .5], color);
    box(root, [.07, .2, .07], [.5, .1, .5], 0x55514b);
    return root;
  }
  // Wall banner geometry is authored along +Z, the support side for the
  // north-facing state. Rotating this local group keeps all four facings on
  // the same support plane instead of applying a screen-space offset.
  const orientation = new THREE.Group();
  orientation.position.set(.5, 0, .5);
  orientation.rotation.y = wallFacingRotation(block.state['facing']);
  box(orientation, [.62, .92, .05], [0, .57, .465], color);
  box(orientation, [.07, .2, .07], [0, .1, .465], 0x55514b);
  root.add(orientation);
  root.userData['wallFacing'] = block.state['facing'] ?? 'north';
  return root;
}

function wallFacingRotation(facing: string | undefined): number { return ({ north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 } as Record<string, number>)[facing ?? 'north'] ?? 0; }
export const conduitInactiveModel: SpecialModelDescriptor = {
  id: 'minecraft-java-conduit-inactive-1.21.1', textureSize: [32, 16],
  parts: [{ id: 'shell', cuboids: [{ id: 'shell', uv: [0, 0], from: [-3, -3, -3], size: [6, 6, 6] }] }],
};
const conduitAdapter: SpecialBlockVisualAdapter = {
  family: 'conduits',
  staticBatchable: true,
  overrideGeneric: true,
  matches: (block) => block.namespace === 'minecraft' && block.id === 'minecraft:conduit',
  textureResource: () => 'minecraft:entity/conduit/base',
  create: (_block, context) => {
    const root = new THREE.Group(); root.position.set(.5, .5, .5);
    root.add(createSpecialModel(conduitInactiveModel, context?.texture));
    root.userData['specialModel'] = conduitInactiveModel.id; root.userData['conduitState'] = 'inactive';
    return root;
  },
};
function resourcePath(resource: string): string {
  if (resource.startsWith('assets/')) return resource.endsWith('.png') ? resource : `${resource}.png`;
  const normalized = resolveResourceLocation(resource.replace(/^textures\//, '').replace(/\.png$/, ''));
  if (!normalized) return resource;
  const [namespace, path] = normalized.split(':', 2);
  return `assets/${namespace}/textures/${path}.png`;
}
