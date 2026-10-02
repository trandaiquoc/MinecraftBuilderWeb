import { describe, expect, it } from 'vitest';
import { buildContentContextText, buildExternalAiPrompt, externalAiInstructionSections } from './external-ai-prompt-builder';

const context = {
  minecraftVersion: '1.21.1',
  vanillaSource: 'local cache',
  projectBounds: { x: 32, y: 24, z: 32 },
  mods: [{ id: 'example', name: 'Example Mod', version: '1.2.0', loader: 'fabric', namespaces: ['example'] }],
  blockIds: ['example:z_block', 'example:a_block'],
  itemIds: ['example:gem'],
  itemMaxStackSizes: { 'example:gem': 16 },
  paintingIds: ['example:poster'],
} as const;

describe('external Structure JSON AI prompt', () => {
  it('keeps the self-contained guidance and puts the exact user request last', () => {
    const prompt = buildExternalAiPrompt('Build a crescent moon above a grass clearing.', context, { includeAvailableContent: true, includeBlocks: true, includeItems: false, includePaintings: true });
    expect(prompt.indexOf('Return JSON only')).toBeLessThan(prompt.indexOf('AVAILABLE_CONTENT_JSON'));
    expect(prompt.indexOf('AVAILABLE_CONTENT_JSON')).toBeLessThan(prompt.indexOf('USER REQUEST'));
    expect(prompt).toContain('minecraftbuilder-structure');
    expect(prompt).toContain('Minecraft Java 1.21.1');
    expect(prompt).toContain('Do not output `formatVersion`');
    expect(prompt).toContain('meaningful depth across X, Y, and Z');
    expect(prompt).toContain('research would improve the result');
    expect(prompt).toContain('Build a crescent moon above a grass clearing.');
    expect(prompt).not.toContain('for the requested crescent moon');
    expect(prompt).not.toContain('Cresselia');
    expect(prompt).not.toContain('example:gem');
  });

  it('changes clipboard sections without changing the user description', () => {
    const minimal = buildExternalAiPrompt('Make a tower.', context, { includeGuidance: false, includeAvailableContent: false, includeExample: false });
    expect(minimal).toContain('Generate MinecraftBuilder Structure JSON');
    expect(minimal).not.toContain('MINECRAFTBUILDER STRUCTURE JSON');
    expect(minimal).not.toContain('AVAILABLE_CONTENT_JSON');
    expect(minimal).not.toContain('Canonical example');
    expect(minimal.endsWith('USER REQUEST\nMake a tower.')).toBe(true);

    const full = buildExternalAiPrompt('Make a tower.', context, { includeGuidance: true, includeAvailableContent: true, includeBlocks: true, includeItems: true, includePaintings: true, includeExample: true });
    expect(full).toContain('AVAILABLE_CONTENT_JSON');
    expect(full).toContain('example:gem');
    expect(full).toContain('maxStackSize');
    expect(full).toContain('Small JSON syntax example');
    expect(full.endsWith('USER REQUEST\nMake a tower.')).toBe(true);
  });

  it('sorts and de-duplicates active IDs and includes project bounds', () => {
    const text = buildContentContextText({ ...context, blockIds: ['example:z_block', 'example:z_block', 'example:a_block'] });
    expect(text.indexOf('example:a_block')).toBeLessThan(text.indexOf('example:z_block'));
    expect(text.match(/example:z_block/g)?.length).toBe(1);
    expect(text).toContain('"projectBounds"');
    expect(text).toContain('"x": 32');
    expect(text).not.toContain('minecraft:stone');
  });

  it('exposes the same concise canonical guidance sections used by the copied prompt', () => {
    const sections = externalAiInstructionSections('1.21.1');
    const guidance = sections.flatMap((section) => section.lines).join('\n');
    expect(guidance).toContain('Do not output `formatVersion`');
    expect(guidance).toContain('Ordinary stable blocks may float');
    expect(guidance).toContain('web or search tools are available');
    expect(guidance).not.toContain('Cresselia');
    expect(buildExternalAiPrompt('test', context)).toContain(guidance);
    expect(sections.map((section) => section.id)).toEqual(['contract', 'content', 'geometry', 'output']);
  });

  it('keeps large content selectable without forcing item IDs into the default prompt', () => {
    const largeContext = {
      ...context,
      blockIds: Array.from({ length: 350 }, (_, index) => `cobblemon:block_${String(index).padStart(3, '0')}`),
      itemIds: Array.from({ length: 884 }, (_, index) => `cobblemon:item_${String(index).padStart(3, '0')}`),
      paintingIds: Array.from({ length: 4 }, (_, index) => `cobblemon:painting_${index}`),
    };
    const defaultPrompt = buildExternalAiPrompt('Build a catalog test.', largeContext, { includeAvailableContent: true, includeBlocks: true, includeItems: false, includePaintings: true });
    expect(defaultPrompt).toContain('cobblemon:block_349');
    expect(defaultPrompt).toContain('cobblemon:painting_3');
    expect(defaultPrompt).not.toContain('cobblemon:item_883');
    const withItems = buildExternalAiPrompt('Build a catalog test.', largeContext, { includeAvailableContent: true, includeBlocks: true, includeItems: true, includePaintings: true });
    expect(withItems).toContain('cobblemon:item_883');
  });
});
