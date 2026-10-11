import { describe, expect, it, vi } from 'vitest';
import type { HydratedBlockVisualResult } from '../visuals/block-representation-contracts';
import type { BlockVisualProvider } from '../visuals/block-visual-provider-contract';
import type { PlacedBlock } from '../../domain/project.types';
import type { SurfaceFaceTemplate } from '../batching/surface-face-batch-renderer';
import {
  ViewportTerrainWorkflowOwner,
  type TerrainWorkflowPorts,
} from './viewport-terrain-workflow-owner';

function visual(
  terrainTemplates: readonly SurfaceFaceTemplate[] | undefined = [],
): HydratedBlockVisualResult {
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
  createVisual: TerrainWorkflowPorts['visual']['create'] = vi.fn(),
): TerrainWorkflowPorts {
  return {
    renderer: { cacheTemplates } as unknown as TerrainWorkflowPorts['renderer'],
    visual: {
      disposeTemplates,
      acquireProviderReference: () => vi.fn(),
      create: createVisual,
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

  it('returns the canonical terrain hydration result from resolved templates', async () => {
    const templates = [{}] as unknown as readonly SurfaceFaceTemplate[];
    const resolvedVisual = visual(templates);
    const cacheTemplates = vi.fn();
    const createVisual = vi.fn(async () => resolvedVisual);
    const owner = new ViewportTerrainWorkflowOwner(ports(cacheTemplates, vi.fn(), createVisual));
    const block: PlacedBlock = {
      kind: 'resolved',
      id: 'minecraft:stone',
      namespace: 'minecraft',
      position: { x: 1, y: 2, z: 3 },
      state: { axis: 'y' },
    };
    const provider = {} as BlockVisualProvider;

    const result = await owner.resolveHydrationVisual(
      '1,2,3',
      block,
      { getBlock: () => undefined },
      provider,
    );

    expect(result).toMatchObject({
      object: undefined,
      terrainTemplates: templates,
      resolved: {
        blockId: block.id,
        state: block.state,
        parts: [],
        support: 'full',
        diagnostics: [],
        trace: {
          blockstateResource: '',
          matchedVariantKeys: [],
          selectedModelIds: [],
          modelResources: [],
          parentResources: [],
          elementCount: 0,
          faceCount: 0,
          textureResources: [],
        },
      },
      mode: 'real',
      diagnostics: [],
      trace: {
        texturePaths: [],
        pngBytesFound: true,
        textureDecoded: true,
        geometryBuilt: true,
        meshBuilt: true,
      },
    });
    expect(createVisual).toHaveBeenCalledOnce();
    expect(cacheTemplates).toHaveBeenCalledWith('1,2,3', templates);
  });

  it('preserves the provider fallback when terrain templates are unavailable', async () => {
    const fallback = { ...visual(), terrainTemplates: undefined };
    const createVisual = vi.fn(async () => fallback);
    const owner = new ViewportTerrainWorkflowOwner(ports(vi.fn(), vi.fn(), createVisual));

    const result = await owner.resolveHydrationVisual(
      '1,2,3',
      {
        kind: 'resolved',
        id: 'minecraft:stone',
        namespace: 'minecraft',
        position: { x: 1, y: 2, z: 3 },
        state: {},
      },
      { getBlock: () => undefined },
      {} as BlockVisualProvider,
    );

    expect(result).toBe(fallback);
    expect(createVisual).toHaveBeenCalledTimes(2);
  });
});
