import { describe, expect, it } from 'vitest';
import type { ProjectDocument, PlacedBlock, ProjectSize } from '../../domain/project.types';
import { NbtifyMinecraftJavaCodec } from './nbtify-minecraft-java-codec';
import { exportMinecraftStructure } from './minecraft-structure-exporter';
import { MinecraftJavaStructureAdapter } from './minecraft-structure-adapter';

const block = (
  id: string,
  position: { x: number; y: number; z: number },
  state: Readonly<Record<string, string>> = {},
  kind: 'resolved' | 'missing' = 'resolved',
): PlacedBlock => ({
  kind,
  id,
  namespace: id.split(':')[0],
  position,
  state,
});

const project = (
  size: ProjectSize,
  blocks: readonly PlacedBlock[],
  overrides: Partial<ProjectDocument> = {},
): ProjectDocument => ({
  schemaVersion: 3,
  id: 'export-test',
  metadata: { name: 'Export test', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  size,
  structureMode: 'vanilla-structure-block',
  blocks,
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
  ...overrides,
});

async function exported(document: ProjectDocument) {
  return exportMinecraftStructure(document, new NbtifyMinecraftJavaCodec(), undefined, () => 64);
}

describe('core Minecraft Structure NBT exporter', () => {
  it('materializes every empty voxel as explicit Air', async () => {
    const result = await exported(
      project({ x: 2, y: 1, z: 2 }, [block('minecraft:stone', { x: 0, y: 0, z: 0 })]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.voxelCount).toBe(4);
    expect(result.template.blocks).toHaveLength(4);
    expect(
      result.template.blocks.filter(
        (entry) => result.template.palette[entry.state].name === 'minecraft:air',
      ),
    ).toHaveLength(3);
    expect(result.template.blocks.map((entry) => entry.pos)).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
    ]);
  });

  it('uses one Air palette identity for explicit and implicit Air voxels', async () => {
    const result = await exported(
      project({ x: 3, y: 1, z: 1 }, [
        block('minecraft:air', { x: 0, y: 0, z: 0 }),
        block('minecraft:stone', { x: 2, y: 0, z: 0 }),
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const airEntries = result.template.palette
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.name === 'minecraft:air');
    expect(airEntries).toHaveLength(1);
    expect(result.template.blocks).toHaveLength(3);
    expect(result.template.blocks[0].state).toBe(airEntries[0].index);
    expect(result.template.blocks[1].state).toBe(airEntries[0].index);
  });

  it('keeps a fully explicit Air structure to one Air palette entry', async () => {
    const result = await exported(
      project({ x: 1, y: 1, z: 1 }, [block('minecraft:air', { x: 0, y: 0, z: 0 })]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.palette).toEqual([{ name: 'minecraft:air' }]);
      expect(result.template.blocks).toEqual([{ pos: [0, 0, 0], state: 0 }]);
    }
  });

  it('omits an unused Air palette entry for a completely filled structure', async () => {
    const result = await exported(
      project({ x: 1, y: 1, z: 1 }, [block('minecraft:stone', { x: 0, y: 0, z: 0 })]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.template.palette).toEqual([{ name: 'minecraft:stone' }]);
  });

  it('materializes a typical 64x18x64 sparse structure without a per-voxel project scan', async () => {
    const result = await exported(
      project({ x: 64, y: 18, z: 64 }, [block('minecraft:stone', { x: 32, y: 9, z: 32 })]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.voxelCount).toBe(73_728);
      expect(result.template.blocks).toHaveLength(73_728);
      expect(
        result.template.blocks.filter(
          (entry) => result.template.palette[entry.state].name === 'minecraft:air',
        ),
      ).toHaveLength(73_727);
    }
  });

  it('preserves missing and modded IDs/states without requiring catalog assets', async () => {
    const result = await exported(
      project({ x: 2, y: 1, z: 1 }, [
        block('example:unknown_block', { x: 1, y: 0, z: 0 }, { variant: 'raw' }, 'missing'),
        block('minecraft:stone', { x: 0, y: 0, z: 0 }),
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.template.palette).toEqual([
        { name: 'example:unknown_block', properties: { variant: 'raw' } },
        { name: 'minecraft:stone' },
      ]);
  });

  it('is deterministic when input blocks and property keys are reordered', async () => {
    const first = await exported(
      project({ x: 2, y: 1, z: 1 }, [
        block('minecraft:oak_stairs', { x: 1, y: 0, z: 0 }, { facing: 'north', half: 'bottom' }),
        block('minecraft:stone', { x: 0, y: 0, z: 0 }),
      ]),
    );
    const second = await exported(
      project({ x: 2, y: 1, z: 1 }, [
        block('minecraft:stone', { x: 0, y: 0, z: 0 }),
        block('minecraft:oak_stairs', { x: 1, y: 0, z: 0 }, { half: 'bottom', facing: 'north' }),
      ]),
    );
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.template).toEqual(first.template);
  });

  it('rejects duplicate coordinates, invalid versions, bounds, and unsupported semantic data', async () => {
    const duplicate = await exported(
      project({ x: 1, y: 1, z: 1 }, [
        block('minecraft:stone', { x: 0, y: 0, z: 0 }),
        block('minecraft:dirt', { x: 0, y: 0, z: 0 }),
      ]),
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok)
      expect(duplicate.diagnostics.map((entry) => entry.code)).toContain('duplicate-coordinate');

    const wrongVersion = await exported(
      project({ x: 1, y: 1, z: 1 }, [], {
        metadata: { ...project({ x: 1, y: 1, z: 1 }, []).metadata, minecraftVersion: '26.3' },
      }),
    );
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok)
      expect(wrongVersion.diagnostics.map((entry) => entry.code)).toContain('unsupported-version');

    const outOfBounds = await exported(
      project({ x: 1, y: 1, z: 1 }, [block('minecraft:stone', { x: 1, y: 0, z: 0 })]),
    );
    expect(outOfBounds.ok).toBe(false);
    if (!outOfBounds.ok)
      expect(outOfBounds.diagnostics.map((entry) => entry.code)).toContain('out-of-bounds');

    const tooLarge = await exported(project({ x: 513, y: 1, z: 1 }, []));
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok)
      expect(tooLarge.diagnostics.map((entry) => entry.code)).toContain('unsupported-size');

    const entity = await exported(
      project({ x: 1, y: 1, z: 1 }, [
        { ...block('minecraft:chest', { x: 0, y: 0, z: 0 }), blockEntityData: { kind: 'unknown' } },
      ]),
    );
    expect(entity.ok).toBe(false);
    if (!entity.ok)
      expect(entity.diagnostics.map((entry) => entry.code)).toContain('unsupported-raw-nbt');

    const sign = await exported(
      project({ x: 1, y: 1, z: 1 }, [
        {
          ...block('minecraft:oak_sign', { x: 0, y: 0, z: 0 }),
          blockEntityData: {
            kind: 'sign',
            waxed: false,
            front: { lines: ['front', '', '', ''] as const, color: 'black', glowing: false },
            back: { lines: ['', '', '', ''] as const, color: 'black', glowing: false },
          },
        },
      ]),
    );
    expect(sign.ok).toBe(true);
    if (sign.ok)
      expect(sign.template.blocks[0].nbt?.value['id']).toEqual({
        type: 'string',
        value: 'minecraft:sign',
      });

    const decoratedPot = await exported(
      project({ x: 1, y: 1, z: 1 }, [
        {
          ...block('minecraft:decorated_pot', { x: 0, y: 0, z: 0 }),
          blockEntityData: {
            kind: 'decorated-pot',
            decorations: {
              back: 'minecraft:brick',
              left: 'minecraft:brick',
              right: 'minecraft:brick',
              front: 'minecraft:angler_pottery_sherd',
            },
          },
        },
      ]),
    );
    expect(decoratedPot.ok).toBe(true);
    if (decoratedPot.ok)
      expect(decoratedPot.template.blocks[0].nbt?.value['sherds']).toMatchObject({
        type: 'list',
        elementType: 'string',
      });

    const decoration = await exported(
      project({ x: 1, y: 1, z: 1 }, [], {
        decorations: [
          {
            instanceId: 'painting-1',
            kind: 'painting',
            entityTypeId: 'minecraft:painting',
            anchor: { x: 0, y: 0, z: 0 },
            facing: 'north',
            variantId: 'minecraft:kebab',
          },
        ],
      }),
    );
    expect(decoration.ok).toBe(false);
    if (!decoration.ok)
      expect(decoration.diagnostics.map((entry) => entry.code)).toContain('invalid-decoration');

    const supportedPainting = await exported(
      project({ x: 2, y: 1, z: 2 }, [block('minecraft:stone', { x: 0, y: 0, z: 1 })], {
        decorations: [
          {
            instanceId: 'painting-supported',
            kind: 'painting',
            entityTypeId: 'minecraft:painting',
            anchor: { x: 0, y: 0, z: 0 },
            facing: 'north',
            variantId: 'minecraft:kebab',
          },
        ],
      }),
    );
    expect(supportedPainting.ok).toBe(true);

    const completeLargePainting = await exported(
      project(
        { x: 3, y: 3, z: 3 },
        [
          block('minecraft:stone', { x: 1, y: 1, z: 2 }),
          block('minecraft:stone', { x: 2, y: 1, z: 2 }),
          block('minecraft:stone', { x: 1, y: 2, z: 2 }),
          block('minecraft:stone', { x: 2, y: 2, z: 2 }),
        ],
        {
          decorations: [
            {
              instanceId: 'painting-large',
              kind: 'painting',
              entityTypeId: 'minecraft:painting',
              anchor: { x: 1, y: 1, z: 1 },
              facing: 'north',
              variantId: 'minecraft:match',
            },
          ],
        },
      ),
    );
    expect(completeLargePainting.ok).toBe(true);
    const partialLargePainting = await exported(
      project(
        { x: 3, y: 3, z: 3 },
        [
          block('minecraft:stone', { x: 1, y: 1, z: 2 }),
          block('minecraft:stone', { x: 2, y: 1, z: 2 }),
          block('minecraft:stone', { x: 1, y: 2, z: 2 }),
        ],
        {
          decorations: [
            {
              instanceId: 'painting-partial',
              kind: 'painting',
              entityTypeId: 'minecraft:painting',
              anchor: { x: 1, y: 1, z: 1 },
              facing: 'north',
              variantId: 'minecraft:match',
            },
          ],
        },
      ),
    );
    expect(partialLargePainting.ok).toBe(false);
    if (!partialLargePainting.ok)
      expect(partialLargePainting.diagnostics.map((entry) => entry.code)).toContain(
        'invalid-decoration',
      );

    for (const [facing, support] of Object.entries({
      north: { x: 1, y: 0, z: 2 },
      south: { x: 1, y: 0, z: 0 },
      east: { x: 0, y: 0, z: 1 },
      west: { x: 2, y: 0, z: 1 },
    } as const)) {
      const frame = await exported(
        project({ x: 3, y: 1, z: 3 }, [block('minecraft:stone', support)], {
          decorations: [
            {
              instanceId: `frame-${facing}`,
              kind: 'item-frame',
              entityTypeId: 'minecraft:item_frame',
              anchor: { x: 1, y: 0, z: 1 },
              facing: facing as 'north' | 'south' | 'east' | 'west',
              rotation: 0,
              invisible: false,
              fixed: false,
              itemDropChance: 1,
            },
          ],
        }),
      );
      expect(frame.ok, facing).toBe(true);
    }
    const fixedFrame = await exported(
      project({ x: 1, y: 1, z: 1 }, [], {
        decorations: [
          {
            instanceId: 'fixed-frame',
            kind: 'glow-item-frame',
            entityTypeId: 'minecraft:glow_item_frame',
            anchor: { x: 0, y: 0, z: 0 },
            facing: 'north',
            rotation: 0,
            invisible: false,
            fixed: true,
            itemDropChance: 1,
          },
        ],
      }),
    );
    expect(fixedFrame.ok).toBe(true);

    const mismatchedDecoration = await exported(
      project({ x: 1, y: 1, z: 1 }, [], {
        decorations: [
          {
            instanceId: 'painting-2',
            kind: 'painting',
            entityTypeId: 'minecraft:item_frame',
            anchor: { x: 0, y: 0, z: 0 },
            facing: 'north',
            variantId: 'minecraft:kebab',
          },
        ],
      }),
    );
    expect(mismatchedDecoration.ok).toBe(false);
    if (!mismatchedDecoration.ok)
      expect(mismatchedDecoration.diagnostics.map((entry) => entry.code)).toContain(
        'invalid-decoration',
      );

    const outsideDecoration = await exported(
      project({ x: 1, y: 1, z: 1 }, [], {
        decorations: [
          {
            instanceId: 'painting-3',
            kind: 'painting',
            entityTypeId: 'minecraft:painting',
            anchor: { x: 1, y: 0, z: 0 },
            facing: 'north',
            variantId: 'minecraft:kebab',
          },
        ],
      }),
    );
    expect(outsideDecoration.ok).toBe(false);
    if (!outsideDecoration.ok)
      expect(outsideDecoration.diagnostics.map((entry) => entry.code)).toContain('out-of-bounds');
  });

  it('round-trips a supported exported structure through the typed adapter and codec', async () => {
    const result = await exported(
      project({ x: 2, y: 1, z: 1 }, [block('minecraft:stone', { x: 0, y: 0, z: 0 })]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const codec = new NbtifyMinecraftJavaCodec();
    const adapter = new MinecraftJavaStructureAdapter();
    const decoded = adapter.decodeStructure(await codec.decode(result.bytes));
    expect(decoded).toEqual(result.template);
  });

  it('round-trips editor container and pot block entities through the production codec', async () => {
    const result = await exported(
      project({ x: 4, y: 1, z: 1 }, [
        {
          ...block('minecraft:chest', { x: 0, y: 0, z: 0 }),
          blockEntityData: {
            kind: 'item-container',
            hostKind: 'inventory-storage',
            slots: [{ slot: 0, stack: { id: 'minecraft:diamond', count: 2 } }],
          },
        },
        {
          ...block('minecraft:barrel', { x: 1, y: 0, z: 0 }),
          blockEntityData: {
            kind: 'item-container',
            hostKind: 'inventory-storage',
            slots: [{ slot: 26, stack: { id: 'minecraft:stone', count: 7 } }],
          },
        },
        {
          ...block('minecraft:hopper', { x: 2, y: 0, z: 0 }),
          blockEntityData: {
            kind: 'item-container',
            hostKind: 'inventory-storage',
            slots: [{ slot: 4, stack: { id: 'minecraft:apple', count: 1 } }],
          },
        },
        {
          ...block('minecraft:decorated_pot', { x: 3, y: 0, z: 0 }),
          blockEntityData: {
            kind: 'decorated-pot',
            decorations: {
              back: 'minecraft:heart_pottery_sherd',
              left: 'minecraft:brick',
              right: 'minecraft:brick',
              front: 'minecraft:brick',
            },
            item: { id: 'minecraft:diamond', count: 3 },
          },
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decoded = new MinecraftJavaStructureAdapter().decodeStructure(
      await new NbtifyMinecraftJavaCodec().decode(result.bytes),
    );
    expect(
      decoded.blocks.filter((entry) => entry.nbt).map((entry) => entry.nbt?.value['id']),
    ).toEqual([
      { type: 'string', value: 'minecraft:chest' },
      { type: 'string', value: 'minecraft:barrel' },
      { type: 'string', value: 'minecraft:hopper' },
      { type: 'string', value: 'minecraft:decorated_pot' },
    ]);
  });

  it('generates and decodes the deterministic exporter smoke structure', async () => {
    const result = await exported(
      project({ x: 3, y: 2, z: 3 }, [
        block('minecraft:stone', { x: 0, y: 0, z: 0 }),
        block(
          'minecraft:oak_stairs',
          { x: 1, y: 0, z: 0 },
          { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' },
        ),
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const codec = new NbtifyMinecraftJavaCodec();
    const adapter = new MinecraftJavaStructureAdapter();
    const decoded = adapter.decodeStructure(await codec.decode(result.bytes));
    expect(decoded.dataVersion).toBe(3955);
    expect(decoded.size).toEqual({ x: 3, y: 2, z: 3 });
    expect(decoded.blocks).toHaveLength(18);
    expect(decoded.palette).toEqual([
      { name: 'minecraft:air' },
      {
        name: 'minecraft:oak_stairs',
        properties: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' },
      },
      { name: 'minecraft:stone' },
    ]);
    expect(
      decoded.blocks.filter((entry) => decoded.palette[entry.state].name === 'minecraft:air'),
    ).toHaveLength(16);
    expect(
      decoded.blocks.find(
        (entry) => entry.pos[0] === 0 && entry.pos[1] === 0 && entry.pos[2] === 0,
      ),
    ).toEqual({ pos: [0, 0, 0], state: 2 });
    expect(
      decoded.blocks.find(
        (entry) => entry.pos[0] === 1 && entry.pos[1] === 0 && entry.pos[2] === 0,
      ),
    ).toEqual({ pos: [1, 0, 0], state: 1 });
  });
});
