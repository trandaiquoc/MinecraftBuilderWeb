import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { BlockVisualResult, BlockVisualProvider } from '../../geometry/block-model-geometry';
import { classifyTerrainAtlasGpuResult, runTerrainAtlasProbe } from './terrain-atlas-browser-runner';
import type { TerrainAtlasFramebufferEvidence } from './terrain-atlas-gpu-probe';
import type { TerrainAtlasGpuProbeResult, TerrainAtlasGpuProbeVariantsResult } from './terrain-atlas-gpu-probe';

function providerWithFace(options: { readonly map?: THREE.Texture } = {}): Pick<BlockVisualProvider, 'create'> {
  const root = new THREE.Group();
  const texture = options.map ?? (() => {
    const value = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]), 2, 2, THREE.RGBAFormat);
    value.flipY = true;
    value.magFilter = THREE.NearestFilter;
    value.minFilter = THREE.NearestFilter;
    value.generateMipmaps = false;
    value.needsUpdate = true;
    return value;
  })();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  mesh.userData['face'] = 'south';
  root.add(mesh);
  return { create: async () => ({ object: root } as unknown as BlockVisualResult) };
}

const gpuResult: TerrainAtlasGpuProbeResult = { sourceGlError: 0, atlasGlError: 0, parity: true, source: { width: 8, height: 8, nonTransparentPixels: 64, alphaMin: 255, alphaMax: 255, checksum: 1 }, atlas: { width: 8, height: 8, nonTransparentPixels: 64, alphaMin: 255, alphaMax: 255, checksum: 1 } };

describe('terrain atlas browser probe runner', () => {
  it('reports a clear provider failure without invoking the host', async () => {
    const host = { runTerrainAtlasGpuProbe: vi.fn() };
    const result = await runTerrainAtlasProbe(host, undefined);
    expect(result).toMatchObject({ ok: false, block: 'minecraft:stone', stage: 'provider' });
    expect(host.runTerrainAtlasGpuProbe).not.toHaveBeenCalled();
  });

  it('reports a clear renderer failure when the mounted engine has no renderer', async () => {
    const result = await runTerrainAtlasProbe({ runTerrainAtlasGpuProbe: () => undefined }, providerWithFace());
    expect(result).toMatchObject({ ok: false, stage: 'renderer', extractionRoute: 'data-buffer' });
    expect(result.sourcePixels?.alphaMin).toBe(255);
    expect(result.atlasSprite?.width).toBe(2);
  });

  it('reports atlas conversion failure instead of claiming a pass', async () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
    const provider = { create: async () => ({ object: root } as unknown as BlockVisualResult) } as Pick<BlockVisualProvider, 'create'>;
    const result = await runTerrainAtlasProbe({ runTerrainAtlasGpuProbe: () => gpuResult }, provider);
    expect(result).toMatchObject({ ok: false, stage: 'source-texture' });
  });

  it('forwards GPU evidence and returns a JSON-friendly trace for the active provider face', async () => {
    const result = await runTerrainAtlasProbe({ runTerrainAtlasGpuProbe: vi.fn(() => gpuResult) }, providerWithFace(), 'minecraft:stone', { axis: 'y' });
    expect(result).toMatchObject({ ok: true, block: 'minecraft:stone', state: { axis: 'y' }, extractionRoute: 'data-buffer', gpu: { source: gpuResult.source, current: gpuResult.atlas, sourceGlError: 0, diagnosis: 'inconclusive' } });
    expect(result.sourceTexture).toMatchObject({ type: 'DataTexture', width: 2, height: 2, flipY: true });
    expect(result.sourceMaterial).toMatchObject({ type: 'MeshBasicMaterial', side: THREE.DoubleSide });
    expect(result.sourcePixels).toMatchObject({ width: 2, height: 2, alphaMin: 255, alphaMax: 255 });
    expect(result.normalizedPixels).toEqual(result.sourcePixels);
    expect(result.atlasPageSpritePixels).toMatchObject({ width: 2, height: 2, alphaMin: 255, alphaMax: 255 });
    expect(result.atlasTexture).toMatchObject({ pageBufferMatchesTextureSource: true, premultiplyAlpha: false, unpackAlignment: 1, versionBeforeGpu: expect.any(Number), versionAfterProbe: expect.any(Number) });
    expect(result.atlasMaterial).toMatchObject({ mapMatchesAtlasPage: true, mapFlipY: true, alphaTest: 0 });
    expect(result.atlasPageByteProbes).toMatchObject({ spriteCenter: [255, 255, 0, 255], topLeftContent: [255, 0, 0, 255], emptyPage: [0, 0, 0, 0] });
    expect(result.uvProbes).toHaveLength(3);
    expect(result.uvProbes?.find((probe) => probe.name === 'center')?.insideSprite).toBe(true);
    expect(result).not.toHaveProperty('sourceTexture.map');
  });

  it('does not dispose provider-owned textures', async () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    texture.flipY = true; texture.needsUpdate = true;
    const dispose = vi.spyOn(texture, 'dispose');
    await runTerrainAtlasProbe({ runTerrainAtlasGpuProbe: () => gpuResult }, providerWithFace({ map: texture }));
    expect(dispose).not.toHaveBeenCalled();
  });

  it('forwards named A/B/C/D controls and records one diagnostic refresh', async () => {
    let names: string[] = [];
    const host = {
      runTerrainAtlasGpuProbeVariants: (_source: unknown, variants: readonly { name: string }[], _size: number, beforeVariant?: (name: string) => void): TerrainAtlasGpuProbeVariantsResult => {
        names = variants.map((variant) => variant.name);
        beforeVariant?.('currentAfterRefresh');
        return { source: gpuResult.source, variants: Object.fromEntries(names.map((name) => [name, gpuResult.atlas!])), parityByVariant: Object.fromEntries(names.map((name) => [name, false])), sourceGlError: 0 };
      },
    };
    const result = await runTerrainAtlasProbe(host, providerWithFace());
    expect(names).toEqual(['current', 'center', 'mirroredCenter', 'mirroredCurrent', 'noAlphaTest', 'geometryControl', 'currentAfterRefresh']);
    expect(result.gpu).toMatchObject({ current: gpuResult.atlas, center: gpuResult.atlas, mirroredCenter: gpuResult.atlas, mirroredCurrent: gpuResult.atlas, noAlphaTest: gpuResult.atlas, geometryControl: gpuResult.atlas, currentAfterRefresh: gpuResult.atlas });
    expect(result.atlasTexture?.versionAfterRefresh).toBeGreaterThan(result.atlasTexture?.versionBeforeGpu ?? -1);
  });

  it('disposes the temporary atlas page after the host has consumed the draw', async () => {
    let atlasTexture: THREE.Texture | undefined;
    let atlasDispose: ReturnType<typeof vi.spyOn> | undefined;
    const result = await runTerrainAtlasProbe({ runTerrainAtlasGpuProbe: (_source, atlas) => {
      atlasTexture = (atlas.material as THREE.Material & { map?: THREE.Texture }).map;
      if (atlasTexture) atlasDispose = vi.spyOn(atlasTexture, 'dispose');
      return gpuResult;
    } }, providerWithFace());
    expect(result.ok).toBe(true);
    expect(atlasTexture).toBeDefined();
    expect(atlasDispose).toHaveBeenCalled();
  });

  it('classifies the four diagnostic outcomes conservatively', () => {
    const visible = (nonTransparentPixels: number): TerrainAtlasFramebufferEvidence => ({ width: 8, height: 8, nonTransparentPixels, alphaMin: nonTransparentPixels ? 255 : 0, alphaMax: nonTransparentPixels ? 255 : 0, checksum: nonTransparentPixels, glError: 0 });
    const base = { source: visible(1), current: visible(0), center: visible(1), mirroredCenter: visible(0), mirroredCurrent: visible(0), geometryControl: visible(1), sourceGlError: 0 };
    expect(classifyTerrainAtlasGpuResult(base)).toBe('current-uv');
    expect(classifyTerrainAtlasGpuResult({ ...base, center: visible(0), mirroredCenter: visible(1) })).toBe('vertical-orientation');
    expect(classifyTerrainAtlasGpuResult({ ...base, center: visible(0), mirroredCenter: visible(0), geometryControl: visible(1) })).toBe('atlas-upload-or-material');
    expect(classifyTerrainAtlasGpuResult({ ...base, center: visible(0), mirroredCenter: visible(0), geometryControl: visible(0) })).toBe('inconclusive');
  });
});
