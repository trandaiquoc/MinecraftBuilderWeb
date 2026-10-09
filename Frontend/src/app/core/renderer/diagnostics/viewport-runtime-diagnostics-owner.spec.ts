import { describe, expect, it } from 'vitest';
import type { ViewportGhostSceneSnapshot, ViewportInstanceOwnershipEvent } from './viewport-diagnostics-contracts';
import { ViewportRuntimeDiagnosticsOwner } from './viewport-runtime-diagnostics-owner';

const snapshot = (): ViewportGhostSceneSnapshot => ({
  capturedAt: 'now',
  authoritativeProjectBlockCount: 0,
  ownership: {
    authoritativeVisibleBlockCount: 0,
    renderedBlockCount: 0,
    placeholderVisualCount: 0,
    placeholderBatchCount: 0,
    placeholderIndexCount: 0,
    instanceBatchCount: 0,
    instanceMemberCount: 0,
    blocksGroupChildCount: 0,
    visibleMeshCount: 0,
    visibleMeshesOutsideBlocksGroup: 0,
    hydrationState: { queued: 0, running: 0, pendingSignatureCount: 0, placeholderSignatureCount: 0, runningOwnershipCount: 0 },
  },
  visibleMeshes: [],
  suspiciousVisualCount: 0,
  suspiciousVisuals: [],
  directSceneChildren: [],
  instanceOwnershipTrace: [],
  previewState: { ghostVisible: false, ghostModelPresent: false, ghostModelVisible: false, ghostModelKey: '', ghostGeneration: 0, movePreviewChildren: 0, decorationGhostChildren: 0, logicalSelectionChildren: 0, selectionOutlineVisible: false, reusableTemplateCount: 0 },
});

const event = (generation: number): ViewportInstanceOwnershipEvent => ({ phase: 'after-reconcile', generation, physicalMemberships: [], violations: [] });

describe('ViewportRuntimeDiagnosticsOwner', () => {
  it('tracks bounded empty transitions and ownership history only while enabled', () => {
    const owner = new ViewportRuntimeDiagnosticsOwner();
    owner.setEnabled(true, 2);
    owner.observeProjectBlockCount(0, snapshot);
    owner.observeProjectBlockCount(2, snapshot);
    owner.observeProjectBlockCount(0, snapshot);
    expect(owner.emptyTransitionSnapshots).toHaveLength(2);

    for (let generation = 0; generation < 300; generation += 1) owner.recordInstanceOwnership(event(generation));
    expect(owner.instanceOwnershipTrace).toHaveLength(256);
    expect(owner.instanceOwnershipTrace[0].generation).toBe(44);
  });

  it('clears diagnostic history when toggled and ignores events while disabled', () => {
    const owner = new ViewportRuntimeDiagnosticsOwner();
    owner.setEnabled(true, 1);
    owner.observeProjectBlockCount(0, snapshot);
    owner.recordInstanceOwnership(event(1));
    owner.setEnabled(false, 0);
    owner.recordInstanceOwnership(event(2));
    expect(owner.emptyTransitionSnapshots).toEqual([]);
    expect(owner.instanceOwnershipTrace).toEqual([]);
    expect(owner.enabled).toBe(false);
    expect(owner.observedProjectBlockCount).toBe(0);
  });
});
