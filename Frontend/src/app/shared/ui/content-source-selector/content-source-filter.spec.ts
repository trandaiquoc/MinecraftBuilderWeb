import { describe, expect, it } from 'vitest';
import { ALL_CONTENT_SOURCE } from '../../../core/content/content-source-selection';
import { sourceOptions } from './content-source-filter';

describe('content source option presentation', () => {
  it('places All first and keeps Vanilla before external sources', () => {
    const options = sourceOptions(
      [
        { id: ALL_CONTENT_SOURCE, label: 'Duplicate All' },
        { id: 'zeta', label: 'Zeta' },
        { id: 'vanilla', label: 'Vanilla' },
        { id: 'alpha', label: 'Alpha' },
      ],
      3,
      'All',
    );
    expect(options.map((option) => option.id)).toEqual([
      ALL_CONTENT_SOURCE,
      'vanilla',
      'alpha',
      'zeta',
    ]);
    expect(options[0].count).toBe(3);
    expect(options.filter((option) => option.id === ALL_CONTENT_SOURCE)).toHaveLength(1);
    expect(options.filter((option) => option.id === 'vanilla')).toHaveLength(1);
  });
});
