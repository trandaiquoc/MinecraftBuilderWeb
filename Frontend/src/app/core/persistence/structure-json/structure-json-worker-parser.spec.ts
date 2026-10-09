import { describe, expect, it } from 'vitest';
import { parseStructureJsonWithWorker } from './structure-json-worker-parser';

describe('Structure JSON worker parser owner', () => {
  it('preserves the cancellation result before worker/fallback parsing', async () => {
    const parsed = await parseStructureJsonWithWorker('{"format":"minecraftbuilder-structure"}', { isCancelled: () => true });
    expect(parsed).toEqual({ valid: false, code: 'invalid-json' });
  });

  it('parses below-threshold input through the canonical parser', async () => {
    const text = JSON.stringify({ format: 'minecraftbuilder-structure', minecraftVersion: '1.21.1', blocks: [], decorations: [] });
    const parsed = await parseStructureJsonWithWorker(text);
    expect(parsed).toMatchObject({ valid: true, value: { format: 'minecraftbuilder-structure', blocks: [], decorations: [] } });
  });
});
