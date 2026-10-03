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
  readonly bounds?: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
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
export function runTerrainAtlasGpuProbe(renderer: THREE.WebGLRenderer, source: TerrainAtlasGpuProbeDraw, atlas: TerrainAtlasGpuProbeDraw, size = 32): TerrainAtlasGpuProbeResult {
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, stencilBuffer: false });
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
    draw.geometry = atlas.geometry;
    draw.material = atlas.material;
    const atlasCapture = renderAndRead(renderer, scene, camera, target, size);
    return {
      source: sourceCapture.evidence,
      atlas: atlasCapture.evidence,
      sourceGlError: sourceCapture.glError,
      atlasGlError: atlasCapture.glError,
      parity: sourceCapture.glError === 0 && atlasCapture.glError === 0 && framebuffersEqual(sourceCapture.pixels, atlasCapture.pixels),
    };
  } catch (error) {
    return {
      sourceGlError: safeGlError(renderer),
      atlasGlError: safeGlError(renderer),
      parity: false,
      failureStage: error instanceof Error && error.message.includes('read') ? 'readback' : 'source-render',
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

interface Capture { readonly evidence: TerrainAtlasFramebufferEvidence; readonly pixels: Uint8Array; readonly glError: number; }

function renderAndRead(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, size: number): Capture {
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
  return { evidence: summarizeTerrainFramebuffer(pixels, size, size), pixels, glError: before || after };
}

export function summarizeTerrainFramebuffer(pixels: Uint8Array, width: number, height: number): TerrainAtlasFramebufferEvidence {
  let nonTransparentPixels = 0;
  let alphaMin = 255;
  let alphaMax = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let checksum = 0x811c9dc5;
  for (let index = 0; index < pixels.length; index += 1) {
    checksum ^= pixels[index]; checksum = Math.imul(checksum, 0x01000193) >>> 0;
    if (index % 4 !== 3) continue;
    const alpha = pixels[index];
    if (alpha === 0) continue;
    alphaMin = Math.min(alphaMin, alpha); alphaMax = Math.max(alphaMax, alpha);
    const pixel = Math.floor(index / 4);
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    nonTransparentPixels += 1;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { width, height, nonTransparentPixels, alphaMin: nonTransparentPixels ? alphaMin : 0, alphaMax, checksum, ...(maxX < 0 ? {} : { bounds: { minX, minY, maxX, maxY } }) };
}

function framebuffersEqual(source: Uint8Array, atlas: Uint8Array): boolean {
  if (source.length !== atlas.length) return false;
  for (let index = 0; index < source.length; index += 1) if (source[index] !== atlas[index]) return false;
  return true;
}

function safeGlError(renderer: THREE.WebGLRenderer): number {
  try { return renderer.getContext().getError(); } catch { return -1; }
}
