import { describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../domain/project.types';
import type { ProjectMutationHint } from '../../editor/mutations/project-mutation-hint';
import type { LayerBlockIndex } from '../../editor/viewport/y-layer';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { renderFilterKey } from './viewport-render-signatures';
import { ViewportStructureSyncState } from './viewport-structure-sync-state';
import { ViewportStructureUpdatePlanner } from './viewport-structure-update-planner';

const project = (): ProjectDocument => ({
  schemaVersion: 3,
  id: 'project-a',
  metadata: { name: 'Project A', minecraftVersion: '1.21.1', createdAt: '', updatedAt: '' },
  structureMode: 'vanilla-structure-block',
  size: { x: 8, y: 4, z: 8 },
  blocks: [],
  groups: [],
  editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: 0.28 },
});

const projection = (changed: boolean, inFlight = false) => ({
  visibleProject: undefined as ProjectDocument | undefined,
  plan: vi.fn(() => ({ changed, changedLayers: changed ? [1] : [] })),
  isProjectionTargetInFlight: vi.fn(() => inFlight),
});

function createPlanner(changed = false, inFlight = false) {
  const syncState = new ViewportStructureSyncState();
  const yProjection = projection(changed, inFlight);
  return {
    syncState,
    yProjection,
    planner: new ViewportStructureUpdatePlanner(syncState, yProjection as never, 8_192),
  };
}

function input(
  projectValue: ProjectDocument,
  previousProject: ProjectDocument | undefined,
  overrides: Partial<{
    previousOptions: ViewportRenderOptions;
    options: ViewportRenderOptions;
    indexedProject: ProjectDocument | undefined;
    mutationHint: ProjectMutationHint | undefined;
    suspended: boolean;
    backgroundPreparation: boolean;
  }> = {},
) {
  return {
    project: projectValue,
    previousProject,
    previousOptions: overrides.previousOptions ?? {},
    options: overrides.options ?? {},
    indexedProject: 'indexedProject' in overrides ? overrides.indexedProject : previousProject,
    mutationHint: overrides.mutationHint,
    suspended: overrides.suspended ?? false,
    backgroundPreparation: overrides.backgroundPreparation ?? false,
  };
}

describe('ViewportStructureUpdatePlanner', () => {
  it('classifies visibility-only changes without treating them as canonical mutations', () => {
    const current = project();
    const { planner, syncState } = createPlanner(true);
    syncState.commit(
      current,
      syncState.keyFor(current, renderFilterKey({ layerY: 0, visibility: 'current-only' })),
    );

    const plan = planner.plan(
      input(current, current, {
        previousOptions: { layerY: 0, visibility: 'current-only' },
        options: { layerY: 1, visibility: 'whole-structure' },
      }),
    );

    expect(plan.layerProjectionOnly).toBe(true);
    expect(plan.incrementalMutation).toBe(false);
    expect(plan.structureInputsUnchanged).toBe(true);
    expect(plan.bootstrapInitialYProjection).toBe(false);
  });

  it('classifies hinted immutable project changes as incremental only when both canonical indexes match', () => {
    const previous = project();
    const next = { ...previous, blocks: [...previous.blocks] };
    const { planner, syncState, yProjection } = createPlanner();
    syncState.commit(previous, syncState.keyFor(previous, renderFilterKey({})));
    yProjection.visibleProject = previous;
    const mutationHint = {
      kind: 'block-delta',
      changes: [],
      source: 'test',
    } as unknown as ProjectMutationHint;

    expect(
      planner.plan(input(next, previous, { indexedProject: previous, mutationHint }))
        .incrementalMutation,
    ).toBe(true);
    expect(
      planner.plan(input(next, previous, { indexedProject: undefined, mutationHint }))
        .incrementalMutation,
    ).toBe(false);
  });

  it('recognizes group presentation-only snapshots and reference opacity updates', () => {
    const previous = project();
    const groupsChanged = {
      ...previous,
      groups: [{ id: 'g', name: 'Group', visible: true, locked: false }],
    };
    const { planner, syncState } = createPlanner();
    syncState.commit(previous, syncState.keyFor(previous, renderFilterKey({})));

    const groupPlan = planner.plan(input(groupsChanged, previous));
    const opacityPlan = planner.plan(
      input(previous, previous, {
        previousOptions: { referenceOpacity: 0.28 },
        options: { referenceOpacity: 0.5 },
      }),
    );

    expect(groupPlan.groupPresentationOnly).toBe(true);
    expect(groupPlan.presentationInputsUnchanged).toBe(true);
    expect(opacityPlan.referenceOpacityOnly).toBe(true);
  });

  it('only bootstraps large saved multi-layer projects in the active foreground path', () => {
    const current = {
      ...project(),
      blocks: Array.from({ length: 8_192 }, (_, index) => ({
        kind: 'resolved' as const,
        id: 'minecraft:stone',
        namespace: 'minecraft',
        position: { x: index, y: 0, z: 0 },
        state: {},
      })),
    };
    const { planner } = createPlanner();
    const layerIndex: LayerBlockIndex = {
      blocksAtY: () => [],
      occupiedLayers: () => [0],
      allBlocks: () => current.blocks,
    };
    const savedYLayer = { layerY: 0, visibility: 'all-below' as const, layerIndex };

    expect(
      planner.plan(input(current, undefined, { options: savedYLayer })).bootstrapInitialYProjection,
    ).toBe(true);
    expect(
      planner.plan(input(current, undefined, { options: savedYLayer, suspended: true }))
        .bootstrapInitialYProjection,
    ).toBe(false);
    expect(
      planner.plan(input(current, undefined, { options: savedYLayer, backgroundPreparation: true }))
        .bootstrapInitialYProjection,
    ).toBe(false);
  });
});
