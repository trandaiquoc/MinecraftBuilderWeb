import { describe, expect, it } from 'vitest';
import { buildContentContextText, buildExternalAiPrompt, externalAiInstructionSections, selectedExternalAiTotals, type ExternalAiPromptContext } from './external-ai-prompt-builder';

const context: ExternalAiPromptContext = {
  minecraftVersion: '1.21.1',
  vanillaSource: 'local cache',
  projectContext: {
    currentSize: { x: 47, y: 31, z: 47 },
    resizeSupported: true,
    maximumSize: { x: 512, y: 512, z: 512 },
    vanillaStructureBlockLimit: 48,
  },
  mods: [
    { sourceId: 'source-a', id: 'example', name: 'Example Mod', version: '1.2.0', loader: 'fabric', namespaces: ['example'], blocks: ['example:z_block', 'example:a_block'], items: [{ id: 'example:gem', maxStackSize: 16 }], decorations: [{ id: 'example:poster', kind: 'painting' }] },
    { sourceId: 'source-b', id: 'other', name: 'Other Mod', version: '2.0.0', loader: 'fabric', namespaces: ['other'], blocks: ['other:block'], items: [{ id: 'other:gear' }, { id: 'other:tool', maxStackSize: 1 }], decorations: [] },
  ],
};

describe('external Structure JSON AI prompt', () => {
  it('keeps the self-contained English guidance and exact user request last', () => {
    const prompt = buildExternalAiPrompt('Build a crescent moon above a grass clearing.', context, { includeAvailableContent: true, locale: 'en' });
    expect(prompt.indexOf('OUTPUT')).toBeLessThan(prompt.indexOf('AVAILABLE_CONTENT_JSON'));
    expect(prompt.indexOf('AVAILABLE_CONTENT_JSON')).toBeLessThan(prompt.indexOf('USER REQUEST'));
    expect(prompt).toContain('minecraftbuilder-structure');
    expect(prompt).toContain('Small JSON syntax example');
    expect(prompt).toContain('"blocks"');
    expect(prompt).toContain('"blockEntity"');
    expect(prompt).toContain('"kind": "container"');
    expect(prompt).toContain('"decorations"');
    expect(prompt).toContain('one `.json` file');
    expect(prompt).toContain('exactly one Markdown code block marked `json`');
    expect(prompt).toContain('meaningful depth across X, Y, and Z');
    expect(prompt).toContain('sapling');
    expect(prompt).toContain('open space');
    expect(prompt).toContain('custom, mature');
    expect(prompt).toContain('Java 1.21.1 growth requirements');
    expect(prompt).toContain('recognizable building');
    expect(prompt).not.toContain('current project size');
    expect(prompt).not.toContain('preferred starting size');
    expect(prompt).not.toContain('project hiện tại');
    expect(prompt).toContain('up to 512 × 512 × 512');
    expect(prompt).toContain('larger than 48 blocks');
    expect(prompt).not.toContain('formatVersion');
    expect(prompt).not.toContain('Cresselia');
  });

  it('localizes machine guidance while preserving the exact user description', () => {
    const description = 'Thiết kế đền cho pokemon Cresselia như ảnh';
    const prompt = buildExternalAiPrompt(description, context, { includeAvailableContent: false, locale: 'vi' });
    expect(prompt).toContain('Bạn đang tạo');
    expect(prompt).toContain('KÍCH THƯỚC CẤU TRÚC');
    expect(prompt).toContain('YÊU CẦU NGƯỜI DÙNG');
    expect(prompt).toContain(description);
    expect(prompt).not.toContain('You are generating a MinecraftBuilder Structure JSON document');
    expect(prompt).not.toContain('formatVersion');
  });

  it('serializes only supported structure limits for external AI', () => {
    const text = buildContentContextText(context);
    expect(text).toContain('"structureLimits"');
    expect(text).toContain('"maximumSize"');
    expect(text).toContain('"x": 512');
    expect(text).toContain('"y": 512');
    expect(text).toContain('"z": 512');
    expect(text).toContain('"vanillaStructureBlockLimit": 48');
    expect(text).not.toContain('"currentSize"');
    expect(text).not.toContain('"resizeSupported"');
    expect(text).not.toContain('47');
    const largeContext = { ...context, projectContext: { ...context.projectContext, currentSize: { x: 128, y: 64, z: 96 } } };
    expect(buildContentContextText(largeContext)).not.toContain('128');
    expect(buildContentContextText(largeContext)).toContain('"x": 512');
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
    expect(text).toContain('other:tool');
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

  it('keeps guidance-off framing localized and free of historical fields', () => {
    const prompt = buildExternalAiPrompt('Tạo một tháp.', context, { includeGuidance: false, includeAvailableContent: false, locale: 'vi' });
    expect(prompt).toContain('Nếu có thể tạo file');
    expect(prompt).toContain('code block');
    expect(prompt).toContain('YÊU CẦU NGƯỜI DÙNG');
    expect(prompt).not.toContain('MINECRAFTBUILDER STRUCTURE JSON\nKẾT QUẢ');
    expect(prompt).not.toContain('formatVersion');
  });

  it('allows the real JSON example to be disabled explicitly', () => {
    const prompt = buildExternalAiPrompt('Make a tower.', context, { includeExample: false, includeAvailableContent: false });
    expect(prompt).not.toContain('Small JSON syntax example');
    expect(prompt).not.toContain('"blockEntity"');
    expect(prompt).not.toContain('"kind": "container"');
    expect(prompt).toContain('USER REQUEST');
  });

  it('keeps guidance sections ordered and semantically equivalent in both locales', () => {
    const english = externalAiInstructionSections('1.21.1', 'en', context.projectContext);
    const vietnamese = externalAiInstructionSections('1.21.1', 'vi', context.projectContext);
    expect(english.map((section) => section.id)).toEqual(['output', 'contract', 'geometry', 'size', 'content', 'research', 'data', 'final']);
    expect(vietnamese.map((section) => section.id)).toEqual(english.map((section) => section.id));
    const englishText = english.flatMap((section) => section.lines).join('\n');
    const vietnameseText = vietnamese.flatMap((section) => section.lines).join('\n');
    for (const text of ['sapling', 'research', 'AVAILABLE_CONTENT_JSON']) expect(englishText.toLowerCase()).toContain(text.toLowerCase());
    expect(vietnameseText).toContain('sapling');
    expect(vietnameseText).toContain('AVAILABLE_CONTENT_JSON');
    expect(vietnameseText).toContain('512 × 512 × 512');
    expect(vietnameseText).toContain('48 block');
    expect(englishText).not.toContain('Cresselia');
    expect(vietnameseText).not.toContain('Cresselia');
    expect(englishText).not.toContain('formatVersion');
    expect(vietnameseText).not.toContain('formatVersion');
  });

  it('requires grounded, origin-normalized generation without banning intentional floating', () => {
    const english = externalAiInstructionSections('1.21.1', 'en', context.projectContext).flatMap((section) => section.lines).join('\n');
    const vietnamese = externalAiInstructionSections('1.21.1', 'vi', context.projectContext).flatMap((section) => section.lines).join('\n');

    for (const text of [english, vietnamese]) {
      expect(text).toContain('minX = 0');
      expect(text).toContain('minY = 0');
      expect(text).toContain('minZ = 0');
      expect(text).toContain('y = 0');
    }
    expect(english).toMatch(/translate the whole design upward/i);
    expect(english).toContain('ordinary architecture and scenery must be grounded');
    expect(english).toContain('Intentional floating is allowed only when the user explicitly requests');
    expect(english).toContain('every block needs another block directly below it');
    expect(english).toContain('sapling');
    expect(english).toContain('valid wall, floor, hanging, or other required support');
    expect(english).toContain('accidental floating');
    expect(english).not.toContain('Ordinary stable blocks may float');
    expect(vietnamese).toContain('tịnh tiến toàn bộ thiết kế lên');
    expect(vietnamese).toContain('kiến trúc và cảnh quan bình thường');
    expect(vietnamese).toContain('Chỉ giữ cấu trúc lơ lửng khi người dùng yêu cầu rõ');
    expect(vietnamese).toContain('không có nghĩa mỗi block đều phải có block ngay bên dưới');
    expect(vietnamese).not.toContain('Block ổn định thông thường có thể đặt giữa không trung');
  });
});
