import { describe, expect, it } from 'vitest';
import { validateItemStack } from './item-stack-validation';

describe('item stack validation', () => {
  const max = (id: string) =>
    id === 'minecraft:bed'
      ? 1
      : id === 'minecraft:banner'
        ? 16
        : id === 'minecraft:stone'
          ? 64
          : undefined;

  it('uses authoritative max stack sizes without clamping', () => {
    expect(validateItemStack({ id: 'minecraft:stone', count: 64 }, max).valid).toBe(true);
    expect(validateItemStack({ id: 'minecraft:stone', count: 65 }, max).code).toBe(
      'exceeds-max-stack-size',
    );
    expect(validateItemStack({ id: 'minecraft:bed', count: 2 }, max).code).toBe(
      'exceeds-max-stack-size',
    );
    expect(validateItemStack({ id: 'minecraft:banner', count: 17 }, max).code).toBe(
      'exceeds-max-stack-size',
    );
  });

  it('allows unknown items only as a single item', () => {
    expect(validateItemStack({ id: 'example:widget', count: 1 }, max).valid).toBe(true);
    expect(validateItemStack({ id: 'example:widget', count: 2 }, max).code).toBe(
      'unknown-max-stack-size',
    );
  });

  it('allows components in project/Structure JSON validation and lets NBT opt into rejection', () => {
    const stack = { id: 'minecraft:stone', count: 1, components: { custom_name: 'Stone' } };
    expect(validateItemStack(stack, max).valid).toBe(true);
    expect(validateItemStack(stack, max, { rejectComponents: true }).code).toBe(
      'unsupported-components',
    );
  });
});
