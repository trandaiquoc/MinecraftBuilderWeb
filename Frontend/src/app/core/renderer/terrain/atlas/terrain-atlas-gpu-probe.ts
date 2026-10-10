import * as THREE from 'three';

export interface TerrainAtlasGpuProbeDraw {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
}

export interface TerrainAtlasFramebufferEvidence {
  readonly width: number;
  readonly height: number;
  readonly nonTransparentPixels: number;
  readonly alphaMin: number;
  readonly alphaMax: number;
  readonly checksum: number;
  readonly glError?: number;
  readonly bounds?: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export interface TerrainAtlasGpuProbeVariantDraw {
  readonly name: string;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
}

export type TerrainAtlasGpuProbeBeforeVariant = (name: string) => void;

export interface TerrainAtlasGpuProbeVariantsResult {
  readonly source?: TerrainAtlasFramebufferEvidence;
  readonly variants: Readonly<Record<string, TerrainAtlasFramebufferEvidence>>;
  readonly parityByVariant: Readonly<Record<string, boolean>>;
  readonly sourceGlError: number;
  readonly failureStage?: 'source-render' | 'variant-render' | 'readback' | 'renderer-state';
}

export interface TerrainAtlasGpuProbeResult {
  readonly source?: TerrainAtlasFramebufferEvidence;
  readonly atlas?: TerrainAtlasFramebufferEvidence;
  readonly sourceGlError: number;
  readonly atlasGlError: number;
  readonly parity: boolean;
  readonly failureStage?: 'source-render' | 'atlas-render' | 'readback' | 'renderer-state';
}

/**
 * Renders source and atlas draw calls into a real WebGLRenderTarget and reads
 * back numeric evidence. This is diagnostic infrastructure only; it is never
 * called by normal terrain rendering or used as a runtime fallback.
 */
export function runTerrainAtlasGpuProbe(
  renderer: THREE.WebGLRenderer,
  source: TerrainAtlasGpuProbeDraw,
  atlas: TerrainAtlasGpuProbeDraw,
  size = 32,
): TerrainAtlasGpuProbeResult {
  const result = runTerrainAtlasGpuProbeVariants(
    renderer,
    source,
    [{ name: 'atlas', ...atlas }],
    size,
  );
  const atlasEvidence = result.variants['atlas'];
  return {
    source: result.source,
    atlas: atlasEvidence,
    sourceGlError: result.sourceGlError,
    atlasGlError: atlasEvidence?.glError ?? -1,
    parity: result.parityByVariant['atlas'] ?? false,
    failureStage: result.failureStage === 'variant-render' ? 'atlas-render' : result.failureStage,
  };
}

/** Runs one source draw followed by a named sequence of atlas/control draws. */
export function runTerrainAtlasGpuProbeVariants(
  renderer: THREE.WebGLRenderer,
  source: TerrainAtlasGpuProbeDraw,
  variants: readonly TerrainAtlasGpuProbeVariantDraw[],
  size = 32,
  beforeVariant?: TerrainAtlasGpuProbeBeforeVariant,
): TerrainAtlasGpuProbeVariantsResult {
  const target = new THREE.WebGLRenderTarget(size, size, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const previousTarget = renderer.getRenderTarget();
  const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
  const previousClearAlpha = renderer.getClearAlpha();
  const previousViewport = renderer.getViewport(new THREE.Vector4()).clone();
  const previousScissor = renderer.getScissor(new THREE.Vector4()).clone();
  const previousScissorTest = renderer.getScissorTest();
  const previousAutoClear = renderer.autoClear;
  const draw = new THREE.Mesh(source.geometry, source.material);
  scene.add(draw);
  try {
    const sourceCapture = renderAndRead(renderer, scene, camera, target, size);
    const evidence: Record<string, TerrainAtlasFramebufferEvidence> = {};
    const parityByVariant: Record<string, boolean> = {};
    for (const variant of variants) {
      beforeVariant?.(variant.name);
      draw.geometry = variant.geometry;
      draw.material = variant.material;
      const capture = renderAndRead(renderer, scene, camera, target, size);
      evidence[variant.name] = capture.evidence;
      parityByVariant[variant.name] =
        sourceCapture.glError === 0 &&
        capture.glError === 0 &&
        framebuffersEqual(sourceCapture.pixels, capture.pixels);
    }
    return {
      source: sourceCapture.evidence,
      variants: evidence,
      parityByVariant,
      sourceGlError: sourceCapture.glError,
    };
  } catch (error) {
    return {
      variants: {},
      parityByVariant: {},
      sourceGlError: safeGlError(renderer),
      failureStage:
        error instanceof Error && error.message.includes('read')
          ? 'readback'
          : variants.length
            ? 'variant-render'
            : 'source-render',
    };
  } finally {
    try {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
      renderer.autoClear = previousAutoClear;
    } catch {
      // State restoration is best effort; the probe result remains diagnostic.
    }
    scene.remove(draw);
    target.dispose();
  }
}

function framebuffersEqual(source: Uint8Array, atlas: Uint8Array): boolean {
  if (source.length !== atlas.length) return false;
  for (let index = 0; index < source.length; index += 1)
    if (source[index] !== atlas[index]) return false;
  return true;
}

interface Capture {
  readonly evidence: TerrainAtlasFramebufferEvidence;
  readonly pixels: Uint8Array;
  readonly glError: number;
}

function renderAndRead(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  target: THREE.WebGLRenderTarget,
  size: number,
): Capture {
  renderer.setRenderTarget(target);
  renderer.setViewport(0, 0, size, size);
  renderer.setScissorTest(false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  const before = safeGlError(renderer);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
  const after = safeGlError(renderer);
  const glError = before || after;
  return {
    evidence: { ...summarizeTerrainFramebuffer(pixels, size, size), glError },
    pixels,
    glError,
  };
}

export function summarizeTerrainFramebuffer(
  pixels: Uint8Array,
  width: number,
  height: number,
): TerrainAtlasFramebufferEvidence {
  let nonTransparentPixels = 0;
  let alphaMin = 255;
  let alphaMax = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let checksum = 0x811c9dc5;
  for (let index = 0; index < pixels.length; index += 1) {
    checksum ^= pixels[index];
    checksum = Math.imul(checksum, 0x01000193) >>> 0;
    if (index % 4 !== 3) continue;
    const alpha = pixels[index];
    if (alpha === 0) continue;
    alphaMin = Math.min(alphaMin, alpha);
    alphaMax = Math.max(alphaMax, alpha);
    const pixel = Math.floor(index / 4);
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    nonTransparentPixels += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    width,
    height,
    nonTransparentPixels,
    alphaMin: nonTransparentPixels ? alphaMin : 0,
    alphaMax,
    checksum,
    ...(maxX < 0 ? {} : { bounds: { minX, minY, maxX, maxY } }),
  };
}

function safeGlError(renderer: THREE.WebGLRenderer): number {
  try {
    return renderer.getContext().getError();
  } catch {
    return -1;
  }
}
