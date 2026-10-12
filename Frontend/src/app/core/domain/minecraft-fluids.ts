export const MINECRAFT_FLUID_BLOCK_IDS = {
  water: 'minecraft:water',
  lava: 'minecraft:lava',
} as const;

export type MinecraftFluidKind = keyof typeof MINECRAFT_FLUID_BLOCK_IDS;

export function minecraftFluidKindForBlockId(id: string): MinecraftFluidKind | undefined {
  if (id === MINECRAFT_FLUID_BLOCK_IDS.water) return 'water';
  if (id === MINECRAFT_FLUID_BLOCK_IDS.lava) return 'lava';
  return undefined;
}

export function isMinecraftFluidBlockId(id: string): boolean {
  return minecraftFluidKindForBlockId(id) !== undefined;
}
