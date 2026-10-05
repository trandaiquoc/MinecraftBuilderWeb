import { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';

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
export interface FluidWorldLookup { readonly getBlock: (position: VoxelCoordinate) => PlacedBlock | undefined; readonly getDefinition?: (blockId: string) => BlockDefinition | undefined; }

export interface FluidRenderResolver {
  resolve(block: PlacedBlock | undefined, world?: FluidWorldLookup): ResolvedFluidRenderState | undefined;
}

/** Registry used by the renderer. Block IDs belong in adapters, never in mesh code. */
export class RegistryFluidRenderResolver implements FluidRenderResolver {
  private readonly adapters = new Map<string, (block: PlacedBlock, world?: FluidWorldLookup) => ResolvedFluidRenderState | undefined>();
  register(blockId: string, adapter: (block: PlacedBlock, world?: FluidWorldLookup) => ResolvedFluidRenderState | undefined): this { this.adapters.set(blockId, adapter); return this; }
  resolve(block: PlacedBlock | undefined, world?: FluidWorldLookup): ResolvedFluidRenderState | undefined {
    if (!block) return undefined;
    return this.adapters.get(block.id)?.(block, world);
  }
}

function vanillaFluidState(block: PlacedBlock, kind: FluidKind): ResolvedFluidRenderState {
  const staticState = staticFluidState(block, kind);
  const isWater = kind === 'water';
  return { ...staticState, fluidTypeId: `minecraft:${kind}`, connectivityKey: `minecraft:${kind}`, materialKey: `minecraft:${kind}`, renderLayer: isWater ? 'translucent' : 'solid', stillTexture: `minecraft:block/${kind}_still`, flowTexture: `minecraft:block/${kind}_flow`, tint: isWater ? 0x3f76e4 : undefined, opacity: isWater ? 1 : undefined, doubleSided: true, depthWrite: !isWater };
}

export const vanillaFluidRenderResolver: FluidRenderResolver = new RegistryFluidRenderResolver()
  .register('minecraft:water', (block) => vanillaFluidState(block, 'water'))
  .register('minecraft:lava', (block) => vanillaFluidState(block, 'lava'));

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
  if (block.state['waterlogged'] === 'true' && kind === 'water') return 8 / 9;
  return world?.getDefinition?.(block.id)?.behavior?.kind === 'solid' ? -1 : 0;
}

export function fluidHeightAtResolved(position: VoxelCoordinate, state: ResolvedFluidRenderState, world: FluidWorldLookup, resolver: FluidRenderResolver): number {
  const block = world.getBlock(position); const neighbor = resolver.resolve(block, world);
  if (neighbor?.connectivityKey === state.connectivityKey) {
    const above = resolver.resolve(world.getBlock({ x: position.x, y: position.y + 1, z: position.z }), world);
    return above?.connectivityKey === state.connectivityKey ? 1 : neighbor.height;
  }
  if (!block) return 0;
  if (block.state['waterlogged'] === 'true' && state.fluidTypeId === 'minecraft:water') return 8 / 9;
  return world.getDefinition?.(block.id)?.behavior?.kind === 'solid' ? -1 : 0;
}
export function calculateFluidHeight(heights: readonly number[]): number {
  let sum = 0; let weight = 0;
  for (const height of heights) { if (height >= .8) { sum += height * 10; weight += 10; } else if (height >= 0) { sum += height; weight++; } }
  return weight ? sum / weight : 0;
}
export function fluidCornerHeights(position: VoxelCoordinate, state: StaticFluidState, world?: FluidWorldLookup): { readonly northWest: number; readonly northEast: number; readonly southWest: number; readonly southEast: number } {
  // Without a world snapshot there are no known boundary samples. Keep the
  // source face level rather than inventing empty neighbours for previews.
  if (!world) return { northWest: state.height, northEast: state.height, southWest: state.height, southEast: state.height };
  const sample = (dx: number, dz: number): number => dx === 0 && dz === 0 && !world ? state.height : fluidHeightAt({ x: position.x + dx, y: position.y, z: position.z + dz }, state.kind, world);
  const current = sample(0, 0); const north = sample(0, -1); const south = sample(0, 1); const west = sample(-1, 0); const east = sample(1, 0);
  // A matching fluid source immediately above, or a full adjacent fluid,
  // produces a continuous full-height surface at every corner.
  if (current >= 1 || north >= 1 || south >= 1 || west >= 1 || east >= 1) return { northWest: 1, northEast: 1, southWest: 1, southEast: 1 };
  const diagonalSamples = [sample(-1, -1), sample(1, -1), sample(-1, 1), sample(1, 1)];
  if ([north, south, west, east, ...diagonalSamples].every((height) => height === 0)) return { northWest: current, northEast: current, southWest: current, southEast: current };
  const nw = calculateFluidHeight([current, north, west, diagonalSamples[0]]); const ne = calculateFluidHeight([current, north, east, diagonalSamples[1]]);
  const sw = calculateFluidHeight([current, south, west, diagonalSamples[2]]); const se = calculateFluidHeight([current, south, east, diagonalSamples[3]]);
  return { northWest: nw, northEast: ne, southWest: sw, southEast: se };
}

export function fluidCornerHeightsResolved(position: VoxelCoordinate, state: ResolvedFluidRenderState, world: FluidWorldLookup, resolver: FluidRenderResolver): { readonly northWest: number; readonly northEast: number; readonly southWest: number; readonly southEast: number } {
  const sample = (dx: number, dz: number): number => fluidHeightAtResolved({ x: position.x + dx, y: position.y, z: position.z + dz }, state, world, resolver);
  const current = sample(0, 0); const north = sample(0, -1); const south = sample(0, 1); const west = sample(-1, 0); const east = sample(1, 0);
  if (current >= 1 || north >= 1 || south >= 1 || west >= 1 || east >= 1) return { northWest: 1, northEast: 1, southWest: 1, southEast: 1 };
  const diagonalSamples = [sample(-1, -1), sample(1, -1), sample(-1, 1), sample(1, 1)];
  if ([north, south, west, east, ...diagonalSamples].every((height) => height === 0)) return { northWest: current, northEast: current, southWest: current, southEast: current };
  return { northWest: calculateFluidHeight([current, north, west, diagonalSamples[0]]), northEast: calculateFluidHeight([current, north, east, diagonalSamples[1]]), southWest: calculateFluidHeight([current, south, west, diagonalSamples[2]]), southEast: calculateFluidHeight([current, south, east, diagonalSamples[3]]) };
}
export function fluidVelocity(position: VoxelCoordinate, state: StaticFluidState, world?: FluidWorldLookup): { readonly x: number; readonly z: number } {
  let x = 0; let z = 0; const current = state.height;
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    const neighbor = fluidHeightAt({ x: position.x + dx, y: position.y, z: position.z + dz }, state.kind, world);
    if (neighbor >= 0) { const difference = current - neighbor; x += dx * difference; z += dz * difference; }
  }
  const length = Math.hypot(x, z); return length ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}

export function fluidVelocityResolved(position: VoxelCoordinate, state: ResolvedFluidRenderState, world: FluidWorldLookup, resolver: FluidRenderResolver): { readonly x: number; readonly z: number } {
  let x = 0; let z = 0;
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    const neighbor = fluidHeightAtResolved({ x: position.x + dx, y: position.y, z: position.z + dz }, state, world, resolver);
    if (neighbor >= 0) { const difference = state.height - neighbor; x += dx * difference; z += dz * difference; }
  }
  const length = Math.hypot(x, z); return length ? { x: x / length, z: z / length } : { x: 0, z: 0 };
}
