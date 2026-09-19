import { SignBlockEntityData, SignSide } from '../domain/project.types';

export interface MinecraftSignTextNbt {
  readonly messages: readonly string[];
  readonly filtered_messages?: readonly string[];
  readonly color: string;
  readonly has_glowing_text: boolean;
}

export interface MinecraftSignBlockEntityNbt {
  readonly id: 'minecraft:sign' | 'minecraft:hanging_sign';
  readonly front_text: MinecraftSignTextNbt;
  readonly back_text: MinecraftSignTextNbt;
  readonly is_waxed: boolean;
}

const VANILLA_SIGN_COLORS = new Set(['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']);

/** Maps editor sign data to the semantic 1.21.1 SignBlockEntity NBT shape. */
export function toMinecraftSignBlockEntityNbt(blockId: string, data: SignBlockEntityData): MinecraftSignBlockEntityNbt {
  const hanging = blockId.endsWith('_hanging_sign') || blockId.endsWith('_wall_hanging_sign');
  return {
    id: hanging ? 'minecraft:hanging_sign' : 'minecraft:sign',
    front_text: signSideNbt(data.front),
    back_text: signSideNbt(data.back),
    is_waxed: data.waxed === true,
  };
}

function signSideNbt(side: SignSide): MinecraftSignTextNbt {
  const result: { messages: readonly string[]; filtered_messages?: readonly string[]; color: string; has_glowing_text: boolean } = {
    messages: side.lines.map((line) => JSON.stringify(line)),
    color: VANILLA_SIGN_COLORS.has(side.color) ? side.color : 'black',
    has_glowing_text: side.glowing === true,
  };
  if (side.filteredMessages && side.filteredMessages.length === 4 && side.filteredMessages.every((line): line is string => typeof line === 'string')) {
    result.filtered_messages = [...side.filteredMessages];
  }
  return result;
}

export function vanillaSignColors(): readonly string[] { return [...VANILLA_SIGN_COLORS]; }
export function isVanillaSignColor(value: string): boolean { return VANILLA_SIGN_COLORS.has(value); }
