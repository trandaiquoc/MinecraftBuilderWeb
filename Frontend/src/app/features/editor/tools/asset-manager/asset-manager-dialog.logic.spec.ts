import { describe, expect, it } from 'vitest';
import { AssetActivityEntry } from '../../../../core/assets/asset-activity.service';
import { compactContentCount, diagnosticPresentation, filterAssetActivity, importStageForPhase, progressPercentForProgress } from './asset-manager-dialog.component';

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
    expect(importStageForPhase('finalizing-cache')).toBe('import');
    expect(importStageForPhase('activating')).toBe('import');
  });

  it('compacts equal counts while preserving ratios for partial imports', () => {
    expect(compactContentCount(355, 355, 'Blocks')).toBe('355 Blocks');
    expect(compactContentCount(340, 355, 'Blocks')).toBe('340 / 355 Blocks');
  });

  it('reports determinate progress at 25, 50 and 100 percent', () => {
    expect(progressPercentForProgress({ processed: 1, total: 4 })).toBe(25);
    expect(progressPercentForProgress({ processed: 1, total: 2 })).toBe(50);
    expect(progressPercentForProgress({ processed: 4, total: 4 })).toBe(100);
    expect(progressPercentForProgress({ processed: undefined, total: undefined })).toBeUndefined();
  });

  it('keeps info-only diagnostics in a collapsed technical presentation', () => {
    expect(diagnosticPresentation({ diagnostics: [{ code: 'nested-jar-skipped', severity: 'info', category: 'info', message: 'informational' }] })).toBe('technical');
    expect(diagnosticPresentation({ diagnostics: [] })).toBe('none');
  });

  it('keeps warnings and blocking diagnostics prominent', () => {
    expect(diagnosticPresentation({ diagnostics: [{ code: 'warning', severity: 'warning', category: 'warning', message: 'warning' }] })).toBe('prominent');
    expect(diagnosticPresentation({ diagnostics: [{ code: 'blocked', severity: 'error', category: 'blocking', message: 'blocked' }] })).toBe('prominent');
  });
});
