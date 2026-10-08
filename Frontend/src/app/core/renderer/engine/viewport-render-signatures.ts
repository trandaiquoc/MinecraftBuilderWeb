import type { ProjectDocument } from '../../domain/project.types';
import type { ViewportRenderOptions } from './viewport-engine-contracts';
import { stableValueKey } from '../../domain/stable-value-key';

export function blockRenderSignature(block: ProjectDocument['blocks'][number]): string {
  const state = Object.entries(block.state).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join(',');
  const entity = block.blockEntityData === undefined ? '' : `|entity=${stableValueKey(block.blockEntityData)}`;
  return `${block.kind}|${block.id}|${block.namespace}|${block.position.x},${block.position.y},${block.position.z}|${state}${entity}`;
}

export function renderFilterKey(options: ViewportRenderOptions): string {
  const layerY = options.visibility ? undefined : options.layerY;
  return stableValueKey({ layerY, visibility: options.visibility, exposedFaceRendering: options.exposedFaceRendering === true });
}

export function isolateKey(options: ViewportRenderOptions): string {
  return stableValueKey({ isolatedGroupId: options.isolatedGroupId, isolatedGroupPositions: options.isolatedGroupPositions });
}

export function canonicalRenderOptions(options: ViewportRenderOptions): ViewportRenderOptions {
  if (options.isolatedGroupId === undefined && options.isolatedGroupPositions === undefined) return options;
  const { isolatedGroupId: _isolatedGroupId, isolatedGroupPositions: _isolatedGroupPositions, ...canonical } = options;
  return canonical;
}
