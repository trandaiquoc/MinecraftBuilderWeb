import { describe, expect, it } from 'vitest';
import { buildContentContextText, buildExternalAiPrompt, externalAiInstructionSections, selectedExternalAiTotals } from './external-ai-prompt-builder';

const context = {
  minecraftVersion: '1.21.1',
  vanillaSource: 'local cache',
  projectBounds: { x: 32, y: 24, z: 32 },
  mods: [
    { sourceId: 'source-a', id: 'example', name: 'Example Mod', version: '1.2.0', loader: 'fabric', namespaces: ['example'], blocks: ['example:z_block', 'example:a_block'], items: [{ id: 'example:gem', maxStackSize: 16 }], decorations: [{ id: 'example:poster', kind: 'painting' }] },
    { sourceId: 'source-b', id: 'other', name: 'Other Mod', version: '2.0.0', loader: 'fabric', namespaces: ['other'], blocks: ['other:block'], items: [{ id: 'other:gear' }, { id: 'other:tool', maxStackSize: 1 }], decorations: [] },
  ],
} as const;

describe('external Structure JSON AI prompt', () => {
  it('keeps the self-contained guidance and puts the exact user request last', () => {
    const prompt = buildExternalAiPrompt('Build a crescent moon above a grass clearing.', context, { includeAvailableContent: true });
    expect(prompt.indexOf('Return JSON only')).toBeLessThan(prompt.indexOf('AVAILABLE_CONTENT_JSON'));
    expect(prompt.indexOf('AVAILABLE_CONTENT_JSON')).toBeLessThan(prompt.indexOf('USER REQUEST'));
    expect(prompt).toContain('minecraftbuilder-structure');
    expect(prompt).toContain('Do not output `formatVersion`');
    expect(prompt).toContain('meaningful depth across X, Y, and Z');
    expect(prompt).toContain('sapling');
    expect(prompt).toContain('open space');
    expect(prompt).toContain('custom, mature');
    expect(prompt).toContain('Java 1.21.1 growth requirements');
    expect(prompt).toContain('research would improve the result');
    expect(prompt).not.toContain('for the requested crescent moon');
    expect(prompt).not.toContain('Cresselia');
  });

  it('serializes only the selected categories for each exact source', () => {
    const text = buildContentContextText(context, { modSelections: [
      { sourceId: 'source-a', includeBlocks: true, includeItems: false, includeDecorations: true },
      { sourceId: 'source-b', includeBlocks: false, includeItems: true, includeDecorations: false },
    ] });
    expect(text).toContain('example:a_block');
    expect(text).not.toContain('example:gem');
    expect(text).toContain('example:poster');
    expect(text).not.toContain('other:block');
    expect(text).toContain('other:gear');
    expect(text).not.toContain('other:tool (max 1)');
    expect(text).toContain('"maxStackSize": 1');
  });

  it('defaults blocks and decorations on, items off for every source', () => {
    const prompt = buildExternalAiPrompt('Make a tower.', context, { includeAvailableContent: true });
    expect(prompt).toContain('example:a_block');
    expect(prompt).toContain('example:poster');
    expect(prompt).not.toContain('example:gem');
    expect(prompt).toContain('other:block');
    expect(prompt).not.toContain('other:gear');
    expect(selectedExternalAiTotals(context, undefined)).toEqual({ mods: 2, blocks: 3, items: 0, decorations: 1 });
  });

  it('supports the master content toggle without changing selection data', () => {
    const selection = [{ sourceId: 'source-a', includeBlocks: false, includeItems: true, includeDecorations: false }] as const;
    expect(buildContentContextText(context, { includeAvailableContent: false, modSelections: selection })).toBe('');
    const restored = buildContentContextText(context, { includeAvailableContent: true, modSelections: selection });
    expect(restored).not.toContain('example:a_block');
    expect(restored).toContain('example:gem');
  });

  it('keeps guidance sections canonical and concise', () => {
    const sections = externalAiInstructionSections('1.21.1');
    const guidance = sections.flatMap((section) => section.lines).join('\n');
    expect(guidance).toContain('sapling');
    expect(guidance).toContain('web tools are available');
    expect(guidance).not.toContain('Cresselia');
    expect(sections.map((section) => section.id)).toEqual(['contract', 'content', 'geometry', 'output']);
  });
});
