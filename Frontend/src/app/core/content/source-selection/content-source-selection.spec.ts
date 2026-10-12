import { describe, expect, it } from 'vitest';
import { ALL_CONTENT_SOURCE, filterByContentSource } from './content-source-selection';

describe('content source selection', () => {
  const items = [
    { id: 'minecraft:stone', sourceId: 'vanilla' },
    { id: 'example:machine', sourceId: 'example' },
  ];

  it('keeps the all-source selection distinct from concrete providers', () => {
    expect(ALL_CONTENT_SOURCE).not.toBe('vanilla');
    expect(filterByContentSource(items, ALL_CONTENT_SOURCE)).toBe(items);
  });

  it('filters source-tagged content without changing item identity', () => {
    expect(filterByContentSource(items, 'example')).toEqual([items[1]]);
  });

  it('uses namespace when content has no source id', () => {
    const namespaced = [{ id: 'example:machine', namespace: 'example' }];
    expect(filterByContentSource(namespaced, 'example')).toEqual(namespaced);
  });
});
