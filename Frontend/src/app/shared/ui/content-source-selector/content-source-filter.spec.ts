import { describe, expect, it } from 'vitest';
import { ALL_CONTENT_SOURCE, filterByContentSource, sourceOptions } from './content-source-filter';

describe('content source filtering', () => {
  const items = [{ id: 'minecraft:stone', sourceId: 'vanilla' }, { id: 'example:machine', sourceId: 'example' }];

  it('keeps All UI-only and filters by source without changing item identity', () => {
    expect(filterByContentSource(items, ALL_CONTENT_SOURCE)).toEqual(items);
    expect(filterByContentSource(items, 'example')).toEqual([items[1]]);
    expect(ALL_CONTENT_SOURCE).not.toBe('vanilla');
  });

  it('places All first and keeps Vanilla before external sources', () => {
    const options = sourceOptions([{ id: ALL_CONTENT_SOURCE, label: 'Duplicate All' }, { id: 'zeta', label: 'Zeta' }, { id: 'vanilla', label: 'Vanilla' }, { id: 'alpha', label: 'Alpha' }], 3, 'All');
    expect(options.map((option) => option.id)).toEqual([ALL_CONTENT_SOURCE, 'vanilla', 'alpha', 'zeta']);
    expect(options[0].count).toBe(3);
    expect(options.filter((option) => option.id === ALL_CONTENT_SOURCE)).toHaveLength(1);
    expect(options.filter((option) => option.id === 'vanilla')).toHaveLength(1);
  });
});
