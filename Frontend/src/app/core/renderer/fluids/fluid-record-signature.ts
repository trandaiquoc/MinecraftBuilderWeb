import { coordinateKey } from '../../domain/coordinates';
import type { FluidChunkRecord } from './fluid-render-contracts';

/** Stable visual identity shared by record reconciliation and chunk caching. */
export function fluidRecordSignature(record: FluidChunkRecord): string {
  const state = Object.entries(record.block.state).sort(([left], [right]) => left.localeCompare(right));
  const groups = record.block.groupIds ?? (record.block.groupId ? [record.block.groupId] : []);
  return `${coordinateKey(record.block.position)}|${record.block.id}|${JSON.stringify(state)}|${JSON.stringify(groups)}|${JSON.stringify(record.state)}`;
}
