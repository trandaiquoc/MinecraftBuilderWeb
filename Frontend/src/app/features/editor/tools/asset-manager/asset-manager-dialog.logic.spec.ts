import { describe, expect, it } from 'vitest';
import { AssetActivityEntry } from '../../../../core/assets/asset-activity.service';
import { compactContentCount, filterAssetActivity, importStageForPhase } from './asset-manager-dialog.component';

const entry = (category: AssetActivityEntry['category'], id: number): AssetActivityEntry => ({ id, timestamp: id, category, level: 'info', operation: `op-${id}`, message: `message-${id}` });

describe('Asset Manager presentation logic', () => {
  it('keeps the activity rail filtered by the selected source family', () => {
    const entries = [entry('vanilla', 1), entry('cache', 2), entry('mod', 3), entry('system', 4)];
    expect(filterAssetActivity(entries, 'vanilla').map(({ id }) => id)).toEqual([1, 2]);
    expect(filterAssetActivity(entries, 'mods').map(({ id }) => id)).toEqual([3]);
  });

  it('groups technical phases into user-facing import stages', () => {
    expect(importStageForPhase('opening-archive')).toBe('reading');
    expect(importStageForPhase('extracting-resources')).toBe('resources');
    expect(importStageForPhase('discovering-items')).toBe('content');
    expect(importStageForPhase('checking-conflicts')).toBe('validation');
    expect(importStageForPhase('activating')).toBe('import');
  });

  it('compacts equal counts while preserving ratios for partial imports', () => {
    expect(compactContentCount(355, 355, 'Blocks')).toBe('355 Blocks');
    expect(compactContentCount(340, 355, 'Blocks')).toBe('340 / 355 Blocks');
  });
});
