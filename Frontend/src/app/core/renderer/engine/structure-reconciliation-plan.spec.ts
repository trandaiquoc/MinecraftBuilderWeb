import { describe, expect, it } from 'vitest';
import { coordinateKey } from '../../domain/coordinates';
import type { VoxelCoordinate } from '../../domain/project.types';
import {
  planStructureReconciliation,
  type ReconciliationRepresentation,
} from './structure-reconciliation-plan';
import type { VisibleBlockProjectionEntry } from './y-layer-projection-coordinator';

function projection(position: VoxelCoordinate, signature = 'stone'): VisibleBlockProjectionEntry {
  return {
    block: { kind: 'resolved', id: 'minecraft:stone', namespace: 'minecraft', position, state: {} },
    signature,
    role: 'normal',
    occlusionClass: 'opaque-full-cube',
  };
}

function representation(entry: VisibleBlockProjectionEntry): ReconciliationRepresentation {
  return { block: entry.block, signature: entry.signature, role: entry.role };
}

describe('planStructureReconciliation', () => {
  it('plans only changed entries and their visible dependency neighbors for incremental sync', () => {
    const unchanged = projection({ x: 0, y: 0, z: 0 });
    const changed = projection({ x: 1, y: 0, z: 0 }, 'changed');
    const visible = new Map([
      [coordinateKey(unchanged.block.position), unchanged],
      [coordinateKey(changed.block.position), changed],
    ]);
    const current = new Map([
      [coordinateKey(unchanged.block.position), representation(unchanged)],
      [
        coordinateKey(changed.block.position),
        representation(projection(changed.block.position, 'old')),
      ],
    ]);
    const plan = planStructureReconciliation({
      visibleByKey: visible,
      representations: current,
      previousVisiblePositions: new Map(),
      pendingSignatureMatches: () => false,
      placeholderSignatures: new Map(),
      providerAvailable: true,
      full: false,
    });

    expect(plan.changedKeys).toContain(coordinateKey(changed.block.position));
    expect(plan.changedKeys).toContain(coordinateKey(unchanged.block.position));
    expect(plan.terrainAffectedPositions).toContainEqual(changed.block.position);
    expect(plan.terrainAffectedPositions).toContainEqual(unchanged.block.position);
  });

  it('keeps pending and fallback placeholder signatures out of the work plan under their existing conditions', () => {
    const pending = projection({ x: 1, y: 0, z: 0 });
    const pendingKey = coordinateKey(pending.block.position);
    const pendingPlan = planStructureReconciliation({
      visibleByKey: new Map([[pendingKey, pending]]),
      representations: new Map(),
      previousVisiblePositions: new Map(),
      pendingSignatureMatches: () => true,
      placeholderSignatures: new Map(),
      providerAvailable: true,
      full: false,
    });
    expect(pendingPlan.changedKeys).not.toContain(pendingKey);

    const placeholderPlan = planStructureReconciliation({
      visibleByKey: new Map([[pendingKey, pending]]),
      representations: new Map(),
      previousVisiblePositions: new Map(),
      pendingSignatureMatches: () => false,
      placeholderSignatures: new Map([[pendingKey, pending.signature]]),
      providerAvailable: false,
      full: false,
    });
    expect(placeholderPlan.changedKeys).not.toContain(pendingKey);

    const promotePlan = planStructureReconciliation({
      visibleByKey: new Map([[pendingKey, pending]]),
      representations: new Map(),
      previousVisiblePositions: new Map(),
      pendingSignatureMatches: () => false,
      placeholderSignatures: new Map([[pendingKey, pending.signature]]),
      providerAvailable: true,
      full: false,
    });
    expect(promotePlan.changedKeys).toContain(pendingKey);
  });

  it('reconciles stale physical and previously visible keys including their old coordinates', () => {
    const staleEntry = projection({ x: 4, y: 2, z: 3 });
    const staleKey = coordinateKey(staleEntry.block.position);
    const previous = new Map([[staleKey, { ...staleEntry.block.position }]]);
    const plan = planStructureReconciliation({
      visibleByKey: new Map(),
      representations: new Map([[staleKey, representation(staleEntry)]]),
      previousVisiblePositions: previous,
      pendingSignatureMatches: () => false,
      placeholderSignatures: new Map(),
      providerAvailable: true,
      full: false,
    });
    expect(plan.changedKeys).toContain(staleKey);
    expect(plan.terrainAffectedPositions).toContainEqual(staleEntry.block.position);
  });
});
