import { coordinateKey } from '../../../domain/coordinates';
import { stableValueKey } from '../../../domain/stable-value-key';
import type { FluidChunkRecord } from '../state/fluid-render-contracts';

/** Stable visual identity shared by record reconciliation and chunk caching. */
export function fluidRecordSignature(record: FluidChunkRecord): string {
  const groups = [
    ...new Set(record.block.groupIds ?? (record.block.groupId ? [record.block.groupId] : [])),
  ].sort();
  return `${coordinateKey(record.block.position)}|${record.block.id}|${stableValueKey(record.block.state)}|${stableValueKey(groups)}|${stableValueKey(record.state)}`;
}
