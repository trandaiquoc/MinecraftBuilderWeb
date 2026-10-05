import { coordinateKey } from '../../domain/coordinates';
import type { PlacedBlock, VoxelCoordinate } from '../../domain/project.types';
import type { ProjectMutationHint } from '../../editor/mutations/project-mutation-hint';
import type { FluidChunkChange, FluidChunkRecord } from '../fluids/fluid-chunk-renderer';
import type { FluidRenderCoordinator } from '../fluids/fluid-render-coordinator';
import type { FluidRenderResolver, FluidWorldLookup } from '../fluids/fluid-state';

export interface LocalFluidVisibleEntry { readonly block: PlacedBlock; readonly signature: string; readonly role: 'normal' | 'reference' | 'missing'; }
export interface LocalFluidRenderedEntry { readonly key: string; readonly block: PlacedBlock; readonly fluidChunkKey?: string; }
export interface LocalFluidDeltaHost {
  readonly resolver?: FluidRenderResolver;
  readonly hasTexture: boolean;
  readonly getBlock: (position: VoxelCoordinate) => PlacedBlock | undefined;
  readonly getVisibleEntry: (key: string) => LocalFluidVisibleEntry | undefined;
  readonly getRenderedEntry: (key: string) => LocalFluidRenderedEntry | undefined;
  readonly removeRenderedEntry: (key: string) => void;
  readonly removeBlockEntry: (key: string, entry: LocalFluidRenderedEntry) => void;
  readonly setFluidEntry: (key: string, block: PlacedBlock, entry: LocalFluidVisibleEntry) => void;
  readonly fluidCoordinator: FluidRenderCoordinator;
  readonly worldContext: FluidWorldLookup;
  readonly hydrationGeneration: number;
  readonly layerY?: number;
  readonly onComplete: () => void;
}

/** Applies local fluid ownership without rebuilding the visible fluid set. */
export function applyLocalFluidDelta(hint: ProjectMutationHint, changedPositions: readonly VoxelCoordinate[], host: LocalFluidDeltaHost): ReadonlySet<string> {
  const resolver = host.resolver;
  if (!resolver || !host.hasTexture) return new Set<string>();
  const changes: FluidChunkChange[] = [];
  const currentFluidKeys = new Set<string>();
  for (const change of hint.changes) {
    const before = fluidRecord(change.before, resolver, host.worldContext, host.layerY);
    const afterBlock = change.after ? host.getBlock(change.after.position) ?? change.after : undefined;
    const after = fluidRecord(afterBlock, resolver, host.worldContext, host.layerY);
    if (after) currentFluidKeys.add(coordinateKey(after.block.position));
    if (before || after) changes.push({ position: change.position, before, after });
    const key = coordinateKey(change.after?.position ?? change.before?.position ?? change.position);
    if (before && !after) {
      const current = host.getRenderedEntry(key);
      if (current?.fluidChunkKey !== undefined) host.removeRenderedEntry(key);
    }
    if (after) {
      const current = host.getRenderedEntry(key);
      if (current && current.fluidChunkKey === undefined) host.removeBlockEntry(key, current);
      const entry = host.getVisibleEntry(key);
      if (entry) host.setFluidEntry(key, entry.block, entry);
    }
  }
  for (const position of changedPositions) {
    const block = host.getBlock(position);
    if (block && resolver.resolve(block, host.worldContext)) currentFluidKeys.add(coordinateKey(position));
  }
  void host.fluidCoordinator.syncDelta(changes, changedPositions, host.worldContext, host.hydrationGeneration).then(host.onComplete);
  return currentFluidKeys;
}

function fluidRecord(block: PlacedBlock | undefined, resolver: FluidRenderResolver, worldContext: FluidWorldLookup, layerY: number | undefined): FluidChunkRecord | undefined {
  if (!block) return undefined;
  const state = resolver.resolve(block, worldContext);
  return state ? { block, state, role: layerY !== undefined && block.position.y !== layerY ? 'reference' : 'normal' } : undefined;
}
