import type { VoxelCoordinate } from '../../domain/project.types';
import { coordinateKey } from '../../domain/coordinates';

export interface InstanceOwnershipBatchView {
  readonly key: string;
  readonly keys: readonly string[];
  readonly positions: readonly VoxelCoordinate[];
  readonly parts: readonly { readonly count: number; readonly userData: Readonly<Record<string, unknown>> }[];
}

export interface InstanceOwnershipDiagnosticsPort {
  readonly batches: Iterable<InstanceOwnershipBatchView>;
  readonly ownershipIndex: ReadonlyMap<string, { readonly batchKey: string; readonly index: number }>;
  readonly renderedEntries: ReadonlyMap<string, { readonly instanceBatchKey?: string; readonly instanceIndex?: number }>;
  readonly runtimeChecks: boolean;
}

export function collectInstanceOwnershipViolations(port: InstanceOwnershipDiagnosticsPort): readonly string[] {
  const violations: string[] = [];
  const memberships = new Map<string, { batchKey: string; index: number }[]>();
  const batches = [...port.batches];
  for (const batch of batches) {
    if (batch.keys.length !== batch.positions.length) violations.push(`${batch.key}: keys/positions length mismatch`);
    for (const [index, key] of batch.keys.entries()) {
      const list = memberships.get(key) ?? [];
      list.push({ batchKey: batch.key, index }); memberships.set(key, list);
      const position = batch.positions[index];
      if (port.runtimeChecks && (!position || coordinateKey(position) !== key)) violations.push(`${batch.key}: position mismatch at ${index} (${key})`);
      const entry = port.renderedEntries.get(key);
      if (!entry || entry.instanceBatchKey !== batch.key || entry.instanceIndex !== index) violations.push(`${batch.key}: ownership mismatch at ${index} (${key})`);
    }
    for (const [partIndex, part] of batch.parts.entries()) {
      const keys = part.userData['instanceKeys'];
      const voxels = part.userData['instanceVoxels'];
      if (!Array.isArray(keys) || keys.length !== batch.keys.length) violations.push(`${batch.key}: part ${partIndex} keys length mismatch`);
      if (!Array.isArray(voxels) || voxels.length !== batch.keys.length) violations.push(`${batch.key}: part ${partIndex} voxels length mismatch`);
      if (part.count !== batch.keys.length) violations.push(`${batch.key}: part ${partIndex} count mismatch`);
      if (port.runtimeChecks && Array.isArray(keys)) for (let index = 0; index < batch.keys.length; index += 1) if (keys[index] !== batch.keys[index]) violations.push(`${batch.key}: part ${partIndex} key mismatch at ${index}`);
      if (port.runtimeChecks && Array.isArray(voxels)) for (let index = 0; index < batch.positions.length; index += 1) {
        const voxel = voxels[index] as VoxelCoordinate | undefined;
        if (!voxel || coordinateKey(voxel) !== coordinateKey(batch.positions[index])) violations.push(`${batch.key}: part ${partIndex} voxel mismatch at ${index}`);
      }
    }
  }
  for (const [key, list] of memberships) {
    if (list.length !== 1) violations.push(`${key}: physical membership count ${list.length}`);
    const indexed = port.ownershipIndex.get(key);
    if (!indexed || indexed.batchKey !== list[0].batchKey || indexed.index !== list[0].index) violations.push(`${key}: ownership index does not match physical membership`);
  }
  for (const [key, indexed] of port.ownershipIndex) {
    const list = memberships.get(key) ?? [];
    if (list.length !== 1 || list[0].batchKey !== indexed.batchKey || list[0].index !== indexed.index) violations.push(`${key}: indexed membership is stale`);
  }
  for (const [key, entry] of port.renderedEntries) {
    if (entry.instanceBatchKey === undefined) continue;
    const list = memberships.get(key) ?? [];
    if (list.length !== 1 || list[0].batchKey !== entry.instanceBatchKey || list[0].index !== entry.instanceIndex) violations.push(`${key}: rendered entry does not resolve to exactly one physical membership`);
  }
  return [...new Set(violations)];
}

export function collectInstanceOwnershipViolationsForKey(port: InstanceOwnershipDiagnosticsPort, key: string): readonly string[] {
  const violations: string[] = [];
  const indexed = port.ownershipIndex.get(key);
  const entry = port.renderedEntries.get(key);
  if (!indexed) {
    if (entry?.instanceBatchKey !== undefined || entry?.instanceIndex !== undefined) violations.push(`${key}: rendered entry has no indexed physical membership`);
    return violations;
  }
  const batch = [...port.batches].find((candidate) => candidate.key === indexed.batchKey);
  if (!batch || batch.keys[indexed.index] !== key) violations.push(`${key}: index does not point to requested physical member`);
  if (!entry || entry.instanceBatchKey !== indexed.batchKey || entry.instanceIndex !== indexed.index) violations.push(`${key}: rendered entry does not match indexed physical membership`);
  return violations;
}
