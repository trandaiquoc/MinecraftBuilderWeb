import { describe, expect, it } from 'vitest';
import { AssetActivityEntry } from '../../../../core/assets/asset-activity.service';
import { compactContentCount, diagnosticPresentation, filterAssetActivity, importPhaseState, importStageForPhase, importStageState, progressPercentForProgress } from './asset-manager-dialog.component';

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

  it('keeps validation active while conflict checking is still running', () => {
    const context = { operationKind: 'preflight' as const, operationStatus: 'running' as const, prepared: false, canActivate: false, progressPhase: 'checking-conflicts' as const };
    expect(importStageState('validation', context)).toBe('active');
    expect(importStageState('import', context)).toBe('pending');
    expect(importPhaseState('checking-conflicts', context)).toBe('active');
  });

  it('marks validation complete and waits for confirmation after successful preflight', () => {
    const context = { operationKind: undefined, operationStatus: 'ready' as const, prepared: true, canActivate: true, progressPhase: 'checking-conflicts' as const };
    expect(importStageState('validation', context)).toBe('complete');
    expect(importStageState('import', context)).toBe('awaiting-user');
    expect(importPhaseState('checking-conflicts', context)).toBe('complete');
  });

  it('keeps blocked preflight truthful instead of showing ready to import', () => {
    const context = { operationKind: undefined, operationStatus: 'failed' as const, prepared: true, canActivate: false, progressPhase: 'checking-conflicts' as const };
    expect(importStageState('validation', context)).toBe('blocked');
    expect(importStageState('import', context)).toBe('blocked');
  });

  it('shows import as active during commit', () => {
    const context = { operationKind: 'commit' as const, operationStatus: 'running' as const, prepared: true, canActivate: true, progressPhase: 'saving-cache' as const };
    expect(importStageState('validation', context)).toBe('complete');
    expect(importStageState('import', context)).toBe('active');
    expect(importPhaseState('saving-cache', context)).toBe('active');
  });
});
