import { describe, expect, it } from 'vitest';
import { BlockUsageHighlightService } from './block-usage-highlight.service';

describe('BlockUsageHighlightService', () => {
  it('toggles view-only block IDs without owning project or selection state', () => {
    const service = new BlockUsageHighlightService();
    expect(service.highlightedBlockId()).toBeUndefined();
    service.set('minecraft:stone');
    expect(service.highlightedBlockId()).toBe('minecraft:stone');
    service.toggle('minecraft:dirt');
    expect(service.highlightedBlockId()).toBe('minecraft:dirt');
    service.toggle('minecraft:dirt');
    expect(service.highlightedBlockId()).toBeUndefined();
    service.set('minecraft:stone');
    service.clear();
    expect(service.highlightedBlockId()).toBeUndefined();
  });
});
