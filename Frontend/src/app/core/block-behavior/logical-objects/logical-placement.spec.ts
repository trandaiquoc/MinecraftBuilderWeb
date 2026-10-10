import { describe, expect, it } from 'vitest';
import { expandLogicalPlacement, logicalPlacementForBehavior } from './logical-placement';

const block = (id: string, state: Readonly<Record<string, string>>) => ({
  kind: 'resolved' as const,
  id,
  namespace: id.split(':')[0] ?? 'example',
  position: { x: 4, y: 2, z: 4 },
  state,
});

describe('logical placement contract', () => {
  it('materializes a generic vertical pair without registry-name assumptions', () => {
    const metadata = logicalPlacementForBehavior({
      kind: 'double-height',
      halfProperty: 'half',
      requiresFloor: false,
    });
    expect(metadata).toMatchObject({
      layout: 'vertical-two-part',
      identityProperty: 'half',
      firstIdentity: 'lower',
      secondIdentity: 'upper',
    });
    const parts = expandLogicalPlacement(
      block('example:neutral_content', { half: 'lower', facing: 'north', custom: 'shared' }),
      metadata!,
    );
    expect(parts).toHaveLength(2);
    expect(parts.map((part) => part.position)).toEqual([
      { x: 4, y: 2, z: 4 },
      { x: 4, y: 3, z: 4 },
    ]);
    expect(parts.map((part) => part.state['half'])).toEqual(['lower', 'upper']);
    expect(parts.every((part) => part.state['custom'] === 'shared')).toBe(true);
  });

  it.each([
    ['north', { x: 4, y: 2, z: 3 }],
    ['east', { x: 5, y: 2, z: 4 }],
    ['south', { x: 4, y: 2, z: 5 }],
    ['west', { x: 3, y: 2, z: 4 }],
  ] as const)('materializes a generic horizontal pair facing %s', (facing, head) => {
    const metadata = logicalPlacementForBehavior({
      kind: 'paired-horizontal',
      partProperty: 'part',
      facingProperty: 'facing',
      firstPart: 'foot',
      secondPart: 'head',
    });
    const parts = expandLogicalPlacement(
      block('example:neutral_pair', { part: 'foot', facing, occupied: 'false' }),
      metadata!,
    );
    expect(parts).toHaveLength(2);
    expect(parts[1]?.position).toEqual(head);
    expect(parts.map((part) => part.state['part'])).toEqual(['foot', 'head']);
    expect(parts.every((part) => part.state['facing'] === facing)).toBe(true);
    expect(parts.every((part) => part.state['occupied'] === 'false')).toBe(true);
  });
});
