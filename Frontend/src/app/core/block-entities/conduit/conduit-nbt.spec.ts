import { describe, expect, it } from 'vitest';
import { toMinecraftConduitBlockEntityNbt } from './conduit-nbt';

describe('Conduit block entity NBT', () => {
  it('emits only the vanilla block entity id', () => {
    expect(toMinecraftConduitBlockEntityNbt()).toEqual({ id: 'minecraft:conduit' });
  });
});
