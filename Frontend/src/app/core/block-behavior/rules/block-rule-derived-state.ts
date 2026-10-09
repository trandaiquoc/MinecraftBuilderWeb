import type { BlockDefinitionLookup, BlockSource } from './block-rule-types';
import type { PlacedBlock } from '../../domain/project.types';
import { add, directionOffset, find, horizontalDirections, opposite, counterClockwise } from './block-rule-geometry';
import { isSupportBlock } from './block-rule-support';

/** Owns derived state calculation; the engine owns queueing and committing updates. */
export function derivedBlockState(block: PlacedBlock, blocks: BlockSource, definitions: BlockDefinitionLookup): Readonly<Record<string, string>> | undefined {
  const behavior = definitions(block.id)?.behavior;
  if (behavior?.kind === 'horizontal-connect') {
    const state = { ...block.state };
    for (const [name, offset] of horizontalDirections) {
      const neighbor = find(blocks, add(block.position, offset)); const neighborBehavior = neighbor && definitions(neighbor.id)?.behavior;
      const connects = behavior.connectsToSolid && !!neighbor && isSupportBlock(neighbor.id, definitions)
        || neighborBehavior?.kind === 'horizontal-connect' && behavior.compatibleGroups.includes(neighborBehavior.connectionGroup);
      state[name] = behavior.family === 'wall' ? connects ? 'low' : 'none' : connects ? 'true' : 'false';
    }
    if (behavior.family === 'wall') {
      const connectedDirections = horizontalDirections.filter(([name]) => state[name] !== 'none');
      const upper = find(blocks, add(block.position, { x: 0, y: 1, z: 0 }));
      const upperIsSolid = upper && isSupportBlock(upper.id, definitions);
      if (upperIsSolid) for (const [name] of connectedDirections) state[name] = 'tall';
      state['up'] = connectedDirections.length === 4 ? 'false' : 'true';
    }
    return state;
  }
  if (behavior?.kind === 'stairs') return { ...block.state, shape: stairShape(block, blocks, definitions) };
  if (behavior?.kind === 'hanging-sign') {
    const above = find(blocks, add(block.position, { x: 0, y: 1, z: 0 }));
    return { ...block.state, [behavior.attachedProperty]: above && isSupportBlock(above.id, definitions) ? 'true' : 'false' };
  }
  return undefined;
}

function stairShape(block: PlacedBlock, blocks: BlockSource, definitions: BlockDefinitionLookup): string {
  const facing = block.state['facing'] ?? 'north'; const half = block.state['half'];
  const front = find(blocks, add(block.position, directionOffset(facing)));
  if (isCompatibleStair(front, half, definitions) && axis(front!.state['facing']) !== axis(facing) && differentOrientation(block, blocks, opposite(front!.state['facing'] ?? 'north'), definitions)) return front!.state['facing'] === rotateCounterClockwise(facing) ? 'outer_left' : 'outer_right';
  const back = find(blocks, add(block.position, directionOffset(opposite(facing))));
  if (isCompatibleStair(back, half, definitions) && axis(back!.state['facing']) !== axis(facing) && differentOrientation(block, blocks, back!.state['facing'] ?? 'north', definitions)) return back!.state['facing'] === rotateCounterClockwise(facing) ? 'inner_left' : 'inner_right';
  return 'straight';
}

function differentOrientation(block: PlacedBlock, blocks: BlockSource, direction: string, definitions: BlockDefinitionLookup): boolean {
  const neighbor = find(blocks, add(block.position, directionOffset(direction)));
  return !isCompatibleStair(neighbor, block.state['half'], definitions) || neighbor?.state['facing'] !== block.state['facing'];
}
function isCompatibleStair(block: PlacedBlock | undefined, half: string | undefined, definitions: BlockDefinitionLookup): boolean { return !!block && definitions(block.id)?.behavior?.kind === 'stairs' && block.state['half'] === half; }
function axis(direction: string | undefined): 'x' | 'z' { return direction === 'east' || direction === 'west' ? 'x' : 'z'; }
function rotateCounterClockwise(direction: string): string { return counterClockwise(direction); }
