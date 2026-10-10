import { describe, expect, it } from 'vitest';
import { rankSearchResults } from './relevance-search';

describe('catalog search relevance', () => {
  it('ranks exact, starts-with, word-prefix and contains matches stably', () => {
    const items = [
      { name: 'Polished Stone', id: 'mod:polished_stone' },
      { name: 'Stone', id: 'minecraft:stone' },
      { name: 'Stone Bricks', id: 'minecraft:stone_bricks' },
      { name: 'Cobblestone', id: 'minecraft:cobblestone' },
    ];
    expect(
      rankSearchResults(items, 'stone', (item) => [item.name, item.id]).map((item) => item.name),
    ).toEqual(['Stone', 'Stone Bricks', 'Polished Stone', 'Cobblestone']);
  });

  it('applies the limit after ranking every candidate', () => {
    const items = Array.from({ length: 120 }, (_, index) => ({
      name: `Contains stone ${index}`,
      id: `mod:contains_${index}`,
    }));
    items.push({ name: 'Stone', id: 'minecraft:stone' });
    expect(rankSearchResults(items, 'stone', (item) => [item.name, item.id], 100)).toEqual([
      items[items.length - 1],
      ...items.slice(0, 99),
    ]);
  });
});
