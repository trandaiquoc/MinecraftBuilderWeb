import type { PlacedBlock, ProjectDocument } from '../../../domain/project.types';

const stone = (x: number, y: number, z: number): PlacedBlock => ({
  kind: 'resolved',
  id: 'minecraft:stone',
  namespace: 'minecraft',
  position: { x, y, z },
  state: {},
});
const signSide = (line: string) => ({
  lines: [line, '', '', ''] as const,
  color: 'black',
  glowing: false,
});

const supportWall: readonly PlacedBlock[] = Array.from({ length: 10 * 4 }, (_, index) =>
  stone(index % 10, Math.floor(index / 10), 6),
);

/** Deterministic production-export input for runtime smoke coverage. */
export const exporterSmokeProject: ProjectDocument = {
  schemaVersion: 3,
  id: 'exporter-be-entity-smoke-1-21-1',
  metadata: {
    name: 'Exporter Datapack Smoke 1.21.1',
    minecraftVersion: '1.21.1',
    createdAt: '',
    updatedAt: '',
  },
  size: { x: 10, y: 4, z: 8 },
  structureMode: 'vanilla-structure-block',
  blocks: [
    ...supportWall,
    {
      kind: 'resolved',
      id: 'minecraft:oak_sign',
      namespace: 'minecraft',
      position: { x: 0, y: 0, z: 0 },
      state: {},
      blockEntityData: {
        kind: 'sign',
        waxed: false,
        front: signSide('NBT smoke'),
        back: signSide(''),
      },
    },
    {
      kind: 'resolved',
      id: 'minecraft:oak_hanging_sign',
      namespace: 'minecraft',
      position: { x: 1, y: 3, z: 0 },
      state: {},
      blockEntityData: {
        kind: 'sign',
        waxed: false,
        front: signSide('Hanging'),
        back: signSide(''),
      },
    },
    {
      kind: 'resolved',
      id: 'minecraft:decorated_pot',
      namespace: 'minecraft',
      position: { x: 3, y: 0, z: 0 },
      state: {},
      blockEntityData: {
        kind: 'decorated-pot',
        decorations: {
          back: 'minecraft:angler_pottery_sherd',
          left: 'minecraft:brick',
          right: 'minecraft:skull_pottery_sherd',
          front: 'minecraft:heart_pottery_sherd',
        },
        item: { id: 'minecraft:apple', count: 2 },
      },
    },
    {
      kind: 'resolved',
      id: 'minecraft:chest',
      namespace: 'minecraft',
      position: { x: 5, y: 0, z: 0 },
      state: {},
      blockEntityData: {
        kind: 'item-container',
        hostKind: 'inventory-storage',
        slots: [{ slot: 0, stack: { id: 'minecraft:diamond', count: 1 } }],
      },
    },
    {
      kind: 'resolved',
      id: 'minecraft:barrel',
      namespace: 'minecraft',
      position: { x: 7, y: 0, z: 0 },
      state: {},
      blockEntityData: {
        kind: 'item-container',
        hostKind: 'inventory-storage',
        slots: [{ slot: 0, stack: { id: 'minecraft:gold_ingot', count: 3 } }],
      },
    },
    {
      kind: 'resolved',
      id: 'minecraft:hopper',
      namespace: 'minecraft',
      position: { x: 8, y: 0, z: 0 },
      state: {},
      blockEntityData: {
        kind: 'item-container',
        hostKind: 'inventory-storage',
        slots: [{ slot: 0, stack: { id: 'minecraft:iron_ingot', count: 5 } }],
      },
    },
  ],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.5 },
  decorations: [
    {
      instanceId: 'painting-smoke',
      kind: 'painting',
      entityTypeId: 'minecraft:painting',
      anchor: { x: 1, y: 1, z: 5 },
      facing: 'north',
      variantId: 'minecraft:match',
    },
    {
      instanceId: 'frame-smoke',
      kind: 'item-frame',
      entityTypeId: 'minecraft:item_frame',
      anchor: { x: 4, y: 1, z: 5 },
      facing: 'north',
      item: { id: 'minecraft:emerald', count: 1 },
      rotation: 0,
      invisible: false,
      fixed: false,
      itemDropChance: 1,
    },
    {
      instanceId: 'glow-frame-smoke',
      kind: 'glow-item-frame',
      entityTypeId: 'minecraft:glow_item_frame',
      anchor: { x: 6, y: 1, z: 5 },
      facing: 'north',
      item: { id: 'minecraft:diamond', count: 1 },
      rotation: 0,
      invisible: false,
      fixed: false,
      itemDropChance: 1,
    },
  ],
};
