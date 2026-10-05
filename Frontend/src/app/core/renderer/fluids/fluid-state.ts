import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { OcclusionClass } from '../visibility/interior-occlusion';
import { fluidHorizontalVelocity, sampleFluidCornerHeights } from './fluid-surface-sampler';
export { calculateFluidHeight } from './fluid-surface-sampler';

export type FluidKind = 'water' | 'lava';
export type FluidRenderLayer = 'solid' | 'cutout' | 'translucent';
export interface StaticFluidState { readonly kind: FluidKind; readonly blockLevel: number; readonly fluidLevel: number; readonly falling: boolean; readonly still: boolean; readonly height: number; }
export interface ResolvedFluidRenderState extends StaticFluidState {
  readonly fluidTypeId: string;
  readonly connectivityKey: string;
  readonly materialKey: string;
  readonly renderLayer: FluidRenderLayer;
  readonly stillTexture: string;
  readonly flowTexture: string;
  readonly tint?: number;
  readonly opacity?: number;
  readonly doubleSided: boolean;
  readonly depthWrite: boolean;
}
export interface FluidWorldLookup {
  readonly getBlock: (position: VoxelCoordinate) => PlacedBlock | undefined;
  readonly getDefinition?: (blockId: string) => BlockDefinition | undefined;
  readonly getOcclusionClass?: (block: PlacedBlock) => OcclusionClass;
}

export interface FluidRenderResolver {
  resolve(block: PlacedBlock | undefined, world?: FluidWorldLookup): ResolvedFluidRenderState | undefined;
  /** Content adapters may expose fluid embedded by a non-fluid block, such as a waterlogged block. */
  embeddedFluidHeight?(block: PlacedBlock, state: ResolvedFluidRenderState, world: FluidWorldLookup): number | undefined;
}

/** Registry used by the renderer. Block IDs belong in adapters, never in mesh code. */
export class RegistryFluidRenderResolver implements FluidRenderResolver {
  private readonly adapters = new Map<string, (block: PlacedBlock, world?: FluidWorldLookup) => ResolvedFluidRenderState | undefined>();
  private embeddedHeightPolicy?: (block: PlacedBlock, state: ResolvedFluidRenderState, world: FluidWorldLookup) => number | undefined;
  register(blockId: string, adapter: (block: PlacedBlock, world?: FluidWorldLookup) => ResolvedFluidRenderState | undefined): this { this.adapters.set(blockId, adapter); return this; }
  registerEmbeddedFluidHeight(policy: (block: PlacedBlock, state: ResolvedFluidRenderState, world: FluidWorldLookup) => number | undefined): this { this.embeddedHeightPolicy = policy; return this; }
  resolve(block: PlacedBlock | undefined, world?: FluidWorldLookup): ResolvedFluidRenderState | undefined {
    if (!block) return undefined;
    return this.adapters.get(block.id)?.(block, world);
  }
  embeddedFluidHeight(block: PlacedBlock, state: ResolvedFluidRenderState, world: FluidWorldLookup): number | undefined { return this.embeddedHeightPolicy?.(block, state, world); }
}

function vanillaFluidState(block: PlacedBlock, kind: FluidKind): ResolvedFluidRenderState {
  const staticState = staticFluidState(block, kind);
  const isWater = kind === 'water';
  return { ...staticState, fluidTypeId: `minecraft:${kind}`, connectivityKey: `minecraft:${kind}`, materialKey: `minecraft:${kind}`, renderLayer: isWater ? 'translucent' : 'solid', stillTexture: `minecraft:block/${kind}_still`, flowTexture: `minecraft:block/${kind}_flow`, tint: isWater ? 0x3f76e4 : undefined, opacity: isWater ? 1 : undefined, doubleSided: true, depthWrite: !isWater };
}

export const vanillaFluidRenderResolver: FluidRenderResolver = new RegistryFluidRenderResolver()
  .register('minecraft:water', (block) => vanillaFluidState(block, 'water'))
  .register('minecraft:lava', (block) => vanillaFluidState(block, 'lava'))
  .registerEmbeddedFluidHeight((block, state) => block.state['waterlogged'] === 'true' && state.kind === 'water' ? 8 / 9 : undefined);

export function fluidKindForBlockId(id: string): FluidKind | undefined { return id === 'minecraft:water' ? 'water' : id === 'minecraft:lava' ? 'lava' : undefined; }
export function fluidStateForBlock(block: PlacedBlock | undefined): StaticFluidState | undefined {
  const kind = block && fluidKindForBlockId(block.id); if (!kind) return undefined;
  return staticFluidState(block!, kind);
}
function staticFluidState(block: PlacedBlock, kind: FluidKind): StaticFluidState {
  const parsed = Number(block.state['level'] ?? '0'); const blockLevel = Number.isInteger(parsed) && parsed >= 0 && parsed <= 15 ? parsed : 0;
  const falling = blockLevel >= 8; const fluidLevel = falling ? 8 : 8 - blockLevel;
  return { kind, blockLevel, fluidLevel, falling, still: !falling && fluidLevel === 8, height: fluidLevel / 9 };
}
export function fluidHeightAt(position: VoxelCoordinate, kind: FluidKind, world?: FluidWorldLookup): number {
  const block = world?.getBlock(position); const state = fluidStateForBlock(block);
  if (state?.kind === kind) {
    const above = world?.getBlock({ x: position.x, y: position.y + 1, z: position.z });
    return fluidStateForBlock(above)?.kind === kind ? 1 : state.height;
  }
  if (!block) return 0;
  if (world?.getOcclusionClass?.(block) === 'opaque-full-cube') return -1;
  return world?.getDefinition?.(block.id)?.behavior?.kind === 'solid' ? -1 : 0;
}

export function fluidHeightAtResolved(position: VoxelCoordinate, state: ResolvedFluidRenderState, world: FluidWorldLookup, resolver: FluidRenderResolver): number {
  const block = world.getBlock(position); const neighbor = resolver.resolve(block, world);
  if (neighbor?.connectivityKey === state.connectivityKey) {
    const above = resolver.resolve(world.getBlock({ x: position.x, y: position.y + 1, z: position.z }), world);
    return above?.connectivityKey === state.connectivityKey ? 1 : neighbor.height;
  }
  if (!block) return 0;
  const embeddedHeight = resolver.embeddedFluidHeight?.(block, state, world);
  if (embeddedHeight !== undefined) return embeddedHeight;
  if (world.getOcclusionClass?.(block) === 'opaque-full-cube') return -1;
  return world.getDefinition?.(block.id)?.behavior?.kind === 'solid' ? -1 : 0;
}
export function fluidCornerHeights(position: VoxelCoordinate, state: StaticFluidState, world?: FluidWorldLookup): { readonly northWest: number; readonly northEast: number; readonly southWest: number; readonly southEast: number } {
  // Without a world snapshot there are no known boundary samples. Keep the
  // source face level rather than inventing empty neighbours for previews.
  if (!world) return { northWest: state.height, northEast: state.height, southWest: state.height, southEast: state.height };
  const sample = (dx: number, dz: number): number => fluidHeightAt({ x: position.x + dx, y: position.y, z: position.z + dz }, state.kind, world);
  return sampleFluidCornerHeights(fluidHeightAt(position, state.kind, world), sample);
}

export function fluidCornerHeightsResolved(position: VoxelCoordinate, state: ResolvedFluidRenderState, world: FluidWorldLookup, resolver: FluidRenderResolver): { readonly northWest: number; readonly northEast: number; readonly southWest: number; readonly southEast: number } {
  const sample = (dx: number, dz: number): number => fluidHeightAtResolved({ x: position.x + dx, y: position.y, z: position.z + dz }, state, world, resolver);
  return sampleFluidCornerHeights(fluidHeightAtResolved(position, state, world, resolver), sample);
}
export function fluidVelocity(position: VoxelCoordinate, state: StaticFluidState, world?: FluidWorldLookup): { readonly x: number; readonly z: number } {
  return fluidHorizontalVelocity(state.height, (dx, dz) => fluidHeightAt({ x: position.x + dx, y: position.y, z: position.z + dz }, state.kind, world));
}

export function fluidVelocityResolved(position: VoxelCoordinate, state: ResolvedFluidRenderState, world: FluidWorldLookup, resolver: FluidRenderResolver): { readonly x: number; readonly z: number } {
  let x = 0; let z = 0;
  if (state.falling) {
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const neighbor = world.getBlock({ x: position.x + dx, y: position.y, z: position.z + dz });
      if (neighbor && world.getOcclusionClass?.(neighbor) === 'opaque-full-cube') continue;
      x += dx; z += dz;
    }
    const fallingLength = Math.hypot(x, z);
    if (fallingLength) return { x: x / fallingLength, z: z / fallingLength };
    return { x: 0, z: 0 };
  }
  return fluidHorizontalVelocity(state.height, (dx, dz) => fluidHeightAtResolved({ x: position.x + dx, y: position.y, z: position.z + dz }, state, world, resolver));
}
