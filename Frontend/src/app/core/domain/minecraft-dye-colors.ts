export const MINECRAFT_DYE_COLORS = [
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black',
] as const;

export type MinecraftDyeColor = (typeof MINECRAFT_DYE_COLORS)[number];

const minecraftDyeColorSet: ReadonlySet<string> = new Set(MINECRAFT_DYE_COLORS);

export function isMinecraftDyeColor(value: string): value is MinecraftDyeColor {
  return minecraftDyeColorSet.has(value);
}
