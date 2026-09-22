import { describe, expect, it } from 'vitest';
import { lanternChainAttachmentTarget, placementStatus, projectGridBounds, resolveAttachmentPlacement, targetFromBlockFace, targetFromEditingPlaneHit, targetFromGridHit } from './placement';

describe('placement math', () => {
  it('targets the neighboring voxel from a block face', () => {
    expect(targetFromBlockFace({ x: 10, y: 20, z: 10 }, { x: 1, y: 0, z: 0 })).toEqual({ x: 11, y: 20, z: 10 });
    expect(targetFromBlockFace({ x: 10, y: 20, z: 10 }, { x: 0, y: -1, z: 0 })).toEqual({ x: 10, y: 19, z: 10 });
  });

  it('floors grid hits to integer voxel coordinates', () => {
    expect(targetFromGridHit({ x: 1.9, z: 3.1 })).toEqual({ x: 1, y: 0, z: 3 });
  });

  it('maps an editing-plane ray hit to Current Y without requiring support', () => {
    expect(targetFromEditingPlaneHit({ x: 1.8, z: 0.2 }, 4, { x: 3, y: 8, z: 3 })).toEqual({ x: 1, y: 4, z: 0 });
    expect(targetFromEditingPlaneHit({ x: 3, z: 0 }, 4, { x: 3, y: 8, z: 3 })).toBeUndefined();
  });

  it('blocks out-of-bounds and exposes warning/unknown hooks', () => {
    const size = { x: 2, y: 2, z: 2 };
    expect(placementStatus({ x: 2, y: 0, z: 0 }, size)).toBe('invalid');
    expect(placementStatus({ x: 0, y: 0, z: 0 }, size, 'fallback')).toBe('warning');
    expect(placementStatus({ x: 0, y: 0, z: 0 }, size, 'unknown')).toBe('unknown');
  });

  it('maps project size to exact X/Y/Z voxel and boundary extents', () => {
    expect(projectGridBounds({ x: 20, y: 10, z: 30 })).toEqual({
      min: { x: 0, y: 0, z: 0 },
      maxEdge: { x: 20, y: 10, z: 30 },
      maxVoxel: { x: 19, y: 9, z: 29 },
    });
  });
});

describe('Lantern to Chain attachment snap', () => {
  const chain = { kind: 'resolved' as const, id: 'minecraft:chain', namespace: 'minecraft', position: { x: 3, y: 4, z: 5 }, state: { axis: 'y' } };

  it('targets the voxel directly below a vertical chain', () => {
    expect(lanternChainAttachmentTarget('minecraft:lantern', chain.position, [chain])).toEqual({ x: 3, y: 3, z: 5 });
  });

  it('does not snap another active block or a horizontal chain', () => {
    expect(lanternChainAttachmentTarget('minecraft:stone', chain.position, [chain])).toBeUndefined();
    expect(lanternChainAttachmentTarget('minecraft:lantern', chain.position, [{ ...chain, state: { axis: 'x' } }])).toBeUndefined();
  });

  it('leaves occupied and out-of-bounds candidates for normal validation', () => {
    const occupied = { ...chain, id: 'minecraft:stone', position: { x: 3, y: 3, z: 5 }, state: {} };
    expect(lanternChainAttachmentTarget('minecraft:lantern', chain.position, [chain, occupied])).toEqual(occupied.position);
    const floorChain = { ...chain, position: { x: 1, y: 0, z: 1 } };
    expect(lanternChainAttachmentTarget('minecraft:lantern', floorChain.position, [floorChain])).toEqual({ x: 1, y: -1, z: 1 });
  });
  it('extends a vertical chain above or below based on the hit half', () => {
    expect(resolveAttachmentPlacement('minecraft:chain', chain.position, { y: 4.8 }, [chain])).toMatchObject({ target: { x: 3, y: 5, z: 5 }, stateOverride: { axis: 'y' } });
    expect(resolveAttachmentPlacement('minecraft:chain', chain.position, { y: 4.2 }, [chain])).toMatchObject({ target: { x: 3, y: 3, z: 5 }, stateOverride: { axis: 'y' } });
  });
  it('snaps lantern variants below a chain with canonical hanging state', () => {
    expect(resolveAttachmentPlacement('minecraft:soul_lantern', chain.position, { y: 4.5 }, [chain])).toMatchObject({ target: { x: 3, y: 3, z: 5 }, stateOverride: { hanging: 'true' } });
  });
  it('snaps a hanging sign below a vertical chain or compatible hanging sign', () => {
    expect(resolveAttachmentPlacement('minecraft:oak_hanging_sign', chain.position, { y: 4.5 }, [chain])).toMatchObject({ target: { x: 3, y: 3, z: 5 }, snapType: 'hanging-sign-chain' });
    const sign = { ...chain, id: 'minecraft:oak_hanging_sign', state: { rotation: '0', attached: 'false', waterlogged: 'false' } };
    expect(resolveAttachmentPlacement('minecraft:oak_hanging_sign', sign.position, { y: 4.5 }, [sign])).toMatchObject({ target: { x: 3, y: 3, z: 5 }, snapType: 'hanging-sign-stack' });
  });
  it('uses verified external hanging-sign and vertical-chain behavior without namespace rules', () => {
    const definition = (id: string) => id === 'example:hanging' ? ({ behavior: { kind: 'hanging-sign', rotationProperty: 'rotation', attachedProperty: 'attached', wallBlockId: '' } } as never) : ({ behavior: { kind: 'vertical-chain', axisProperty: 'axis', verticalAxis: 'y' } } as never);
    const externalChain = { ...chain, id: 'example:chain', namespace: 'example' };
    expect(resolveAttachmentPlacement('example:hanging', externalChain.position, { y: 4.5 }, [externalChain], definition)).toMatchObject({ target: { x: 3, y: 3, z: 5 }, snapType: 'hanging-sign-chain' });
  });
});
