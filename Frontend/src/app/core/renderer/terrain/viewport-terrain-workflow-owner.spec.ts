import { describe, expect, it, vi } from 'vitest';
import type { HydratedBlockVisualResult } from '../visuals/block-representation-contracts';
import {
  ViewportTerrainWorkflowOwner,
  type TerrainWorkflowPorts,
} from './viewport-terrain-workflow-owner';

function visual(terrainTemplates: readonly [] = []): HydratedBlockVisualResult {
  return {
    object: undefined,
    terrainTemplates,
    resolved: { diagnostics: [] } as unknown as HydratedBlockVisualResult['resolved'],
    mode: 'real',
    diagnostics: [],
    trace: {
      texturePaths: [],
      pngBytesFound: true,
      textureDecoded: true,
      geometryBuilt: true,
      meshBuilt: true,
    },
  };
}

function ports(
  cacheTemplates: ReturnType<typeof vi.fn>,
  disposeTemplates: ReturnType<typeof vi.fn>,
): TerrainWorkflowPorts {
  return {
    renderer: { cacheTemplates } as unknown as TerrainWorkflowPorts['renderer'],
    visual: {
      disposeTemplates,
      acquireProviderReference: () => vi.fn(),
      create: vi.fn(),
    } as unknown as TerrainWorkflowPorts['visual'],
  } as unknown as TerrainWorkflowPorts;
}

describe('ViewportTerrainWorkflowOwner lifecycle', () => {
  it('does not cache or leak templates when resolution finishes after disposal', async () => {
    let resolve!: (value: HydratedBlockVisualResult) => void;
    const request = new Promise<HydratedBlockVisualResult>((next) => {
      resolve = next;
    });
    const cacheTemplates = vi.fn();
    const disposeTemplates = vi.fn();
    const owner = new ViewportTerrainWorkflowOwner(ports(cacheTemplates, disposeTemplates));

    const pending = owner.resolveTemplatesFor('stone', () => request);
    owner.dispose();
    resolve(visual());

    await expect(pending).rejects.toThrow('disposed');
    expect(cacheTemplates).not.toHaveBeenCalled();
    expect(disposeTemplates).toHaveBeenCalledOnce();
  });
});
