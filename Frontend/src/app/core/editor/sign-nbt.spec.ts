import { describe, expect, it } from 'vitest';
import { defaultSignData } from './structure-editor.service';
import { toMinecraftSignBlockEntityNbt } from './sign-nbt';

describe('Minecraft sign block entity mapper', () => {
  it('serializes four plain lines as stringified text components', () => {
    const data = defaultSignData();
    const mapped = toMinecraftSignBlockEntityNbt('minecraft:oak_sign', { ...data, front: { ...data.front, lines: ['Hello', '"quoted"', 'Đỏ\\x', ''] } });
    expect(mapped).toEqual({
      id: 'minecraft:sign',
      front_text: { messages: ['"Hello"', '"\\\"quoted\\\""', '"Đỏ\\\\x"', '""'], color: 'black', has_glowing_text: false },
      back_text: { messages: ['""', '""', '""', '""'], color: 'black', has_glowing_text: false },
      is_waxed: false,
    });
  });

  it('uses hanging sign block entity id and preserves filtered messages', () => {
    const data = defaultSignData();
    const mapped = toMinecraftSignBlockEntityNbt('minecraft:oak_wall_hanging_sign', {
      ...data,
      front: { ...data.front, filteredMessages: ['"safe"', '""', '""', '""'], color: 'red', glowing: true },
      waxed: true,
    });
    expect(mapped.id).toBe('minecraft:hanging_sign');
    expect(mapped.front_text.filtered_messages).toEqual(['"safe"', '""', '""', '""']);
    expect(mapped.front_text.color).toBe('red');
    expect(mapped.front_text.has_glowing_text).toBe(true);
    expect(mapped.is_waxed).toBe(true);
  });

  it('does not emit editor-only fields or arbitrary colors', () => {
    const data = defaultSignData();
    const mapped = toMinecraftSignBlockEntityNbt('minecraft:oak_sign', { ...data, front: { ...data.front, color: '#fff' } });
    expect(mapped.front_text.color).toBe('black');
    expect(mapped).not.toHaveProperty('kind');
    expect(mapped.front_text).not.toHaveProperty('lines');
  });
});
