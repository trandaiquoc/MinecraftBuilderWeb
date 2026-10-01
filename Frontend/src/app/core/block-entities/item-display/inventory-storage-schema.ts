/** Verified vanilla inventory contracts shared by editor, capabilities and NBT export. */
export interface VerifiedInventoryContainerSchema {
  readonly blockId: string;
  readonly nbtId: string;
  readonly slotCount: number;
  readonly editable: boolean;
  readonly nbtSupported: boolean;
}

const schemas: Readonly<Record<string, VerifiedInventoryContainerSchema>> = {
  'minecraft:chest': { blockId: 'minecraft:chest', nbtId: 'minecraft:chest', slotCount: 27, editable: true, nbtSupported: true },
  'minecraft:barrel': { blockId: 'minecraft:barrel', nbtId: 'minecraft:barrel', slotCount: 27, editable: true, nbtSupported: true },
  'minecraft:hopper': { blockId: 'minecraft:hopper', nbtId: 'minecraft:hopper', slotCount: 5, editable: true, nbtSupported: true },
  'minecraft:furnace': { blockId: 'minecraft:furnace', nbtId: 'minecraft:furnace', slotCount: 3, editable: false, nbtSupported: false },
};

export function verifiedInventoryContainerSchema(blockId: string): VerifiedInventoryContainerSchema | undefined { return schemas[blockId]; }
export function verifiedInventoryContainerSchemas(): readonly VerifiedInventoryContainerSchema[] { return Object.values(schemas); }
