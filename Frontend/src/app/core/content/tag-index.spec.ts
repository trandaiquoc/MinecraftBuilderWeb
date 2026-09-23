import { describe, expect, it } from 'vitest';
import { TagIndex } from './tag-index';
import type { AssetResourceProvider } from '../blocks/resolver/resolver.types';

class Tags implements AssetResourceProvider {
  reads = 0;
  constructor(private readonly data: Readonly<Record<string, unknown>>) {}
  readJson(path: string): unknown | undefined { this.reads += 1; return this.data[path]; }
  paths(): readonly string[] { return Object.keys(this.data); }
}

describe('TagIndex', () => {
  it('resolves nested tags, object values and optional missing members', () => {
    const index = new TagIndex([new Tags({
      'data/minecraft/tags/block/base.json': { values: ['minecraft:stone'] },
      'data/minecraft/tags/block/derived.json': { values: [{ id: '#minecraft:base' }, { id: 'minecraft:missing', required: false }] },
      'assets/minecraft/blockstates/stone.json': {},
    })]);
    const result = index.get('block', 'minecraft:derived');
    expect(result.members).toEqual([{ id: 'minecraft:missing', required: false, present: false, sources: ['unknown'] }, { id: 'minecraft:stone', required: true, present: true, sources: ['unknown'] }]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'missing-optional-tag-member')).toBe(true);
  });
  it('reports cycles and applies the last replace contribution deterministically', () => {
    const index = new TagIndex([new Tags({
      'data/example/tags/block/a.json': { values: ['#example:b'] },
      'data/example/tags/block/b.json': { values: ['#example:a'] },
    })]);
    expect(index.get('block', 'example:a').diagnostics.some((diagnostic) => diagnostic.code === 'tag-cycle')).toBe(true);
    const override = new TagIndex([new Tags({
      'data/example/tags/block/replaced.json': { values: ['example:old'] },
    }), new Tags({
      'data/example/tags/block/replaced.json': { replace: true, values: ['example:new'] },
      'assets/example/blockstates/new.json': {},
    })]);
    expect(override.get('block', 'example:replaced').members.map((member) => member.id)).toEqual(['example:new']);
    expect(override.diagnostics().some((diagnostic) => diagnostic.code === 'tag-replacement-unsupported')).toBe(true);
  });

  it('merges contributions from multiple sources while retaining provenance', () => {
    const index = new TagIndex([new Tags({ 'data/example/tags/item/tools.json': { values: ['example:hammer'] }, 'assets/example/items/hammer.json': {} }), new Tags({ 'data/example/tags/item/tools.json': { values: ['example:wrench'] }, 'assets/example/items/wrench.json': {} })]);
    const tag = index.get('item', 'example:tools');
    expect(tag.members.map((member) => member.id)).toEqual(['example:hammer', 'example:wrench']);
    expect(tag.contributions).toHaveLength(2);
  });
  it('reuses resolved tag data until a provider contribution is added', () => {
    const provider = new Tags({
      'data/example/tags/block/tools.json': { values: ['example:hammer'] },
      'assets/example/blockstates/hammer.json': {},
    });
    const index = new TagIndex([provider]);
    const first = index.get('block', 'example:tools');
    const readsAfterFirst = provider.reads;
    expect(index.get('block', 'example:tools')).toBe(first);
    expect(provider.reads).toBe(readsAfterFirst);
  });
});
