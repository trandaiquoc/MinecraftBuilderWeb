import { describe, expect, it } from 'vitest';
import { buildContentContextText, buildExternalAiPrompt } from './external-ai-prompt-builder';

const context = { minecraftVersion: '1.21.1', vanillaSource: 'local cache', mods: [{ id: 'example', name: 'Example Mod', version: '1.2.0', loader: 'fabric', namespaces: ['example'] }], blockIds: ['example:z_block', 'example:a_block'], itemIds: ['example:gem'], paintingIds: ['example:poster'] } as const;

describe('external Structure JSON AI prompt', () => {
  it('keeps canonical instructions, dynamic context, example and exact description in order', () => {
    const prompt = buildExternalAiPrompt('Build a crescent moon above a grass clearing.', context);
    expect(prompt.indexOf('Return JSON only')).toBeLessThan(prompt.indexOf('Active Minecraft/content context'));
    expect(prompt.indexOf('Active Minecraft/content context')).toBeLessThan(prompt.indexOf('Canonical example'));
    expect(prompt.indexOf('Canonical example')).toBeLessThan(prompt.indexOf('Exact user design description'));
    expect(prompt).toContain('example:a_block');
    expect(prompt).toContain('example:z_block');
    expect(buildExternalAiPrompt('Use the gem.', { ...context, itemMaxStackSizes: { 'example:gem': 16 } })).toContain('example:gem (maxStackSize=16)');
    expect(prompt).toContain('Build a crescent moon above a grass clearing.');
    expect(prompt).toContain('Do not add formatVersion');
    expect(prompt).not.toContain('"formatVersion"');
  });

  it('sorts and de-duplicates active external IDs without dumping vanilla content', () => {
    const text = buildContentContextText({ ...context, blockIds: ['example:z_block', 'example:z_block', 'example:a_block'] });
    expect(text.indexOf('example:a_block')).toBeLessThan(text.indexOf('example:z_block'));
    expect(text.match(/example:z_block/g)?.length).toBe(1);
    expect(text).not.toContain('minecraft:stone');
  });
});
