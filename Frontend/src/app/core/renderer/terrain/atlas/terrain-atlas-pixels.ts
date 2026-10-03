import * as THREE from 'three';
import type { TerrainAtlasRect } from './terrain-atlas-layout';

export interface TerrainPixelSource {
  readonly width: number;
  readonly height: number;
  /** RGBA bytes in top-row-first image order. */
  readonly data: Uint8Array;
}

/** Read raw image data without changing the provider texture. */
export function readTerrainTexturePixels(texture: THREE.Texture): TerrainPixelSource | undefined {
  const image = texture.source?.data as { readonly width?: number; readonly height?: number; readonly data?: ArrayLike<number> } | undefined;
  const width = Number(image?.width ?? 0);
  const height = Number(image?.height ?? 0);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return undefined;
  if (image?.data && image.data.length >= width * height * 3) {
    const channels = image.data.length >= width * height * 4 ? 4 : 3;
    const data = new Uint8Array(width * height * 4);
    for (let source = 0, target = 0; target < data.length; source += channels, target += 4) {
      data[target] = Number(image.data[source]) || 0;
      data[target + 1] = Number(image.data[source + 1]) || 0;
      data[target + 2] = Number(image.data[source + 2]) || 0;
      data[target + 3] = channels === 4 ? Number(image.data[source + 3]) || 0 : 255;
    }
    return { width, height, data };
  }
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : typeof document !== 'undefined'
        ? Object.assign(document.createElement('canvas'), { width, height })
        : undefined;
    const context = canvas?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!canvas || !context || !('drawImage' in context)) return undefined;
    context.drawImage(image as CanvasImageSource, 0, 0, width, height);
    return { width, height, data: new Uint8Array(context.getImageData(0, 0, width, height).data) };
  } catch {
    return undefined;
  }
}

/** Normalize source sampling to the atlas convention (top-row-first + flipY=true). */
export function normalizeTerrainPixels(source: TerrainPixelSource, sourceFlipY: boolean): TerrainPixelSource {
  if (sourceFlipY) return source;
  const data = new Uint8Array(source.data.length);
  const rowBytes = source.width * 4;
  for (let y = 0; y < source.height; y += 1) {
    const from = y * rowBytes;
    const to = (source.height - 1 - y) * rowBytes;
    data.set(source.data.subarray(from, from + rowBytes), to);
  }
  return { width: source.width, height: source.height, data };
}

export function copyTerrainPixelsWithGutter(target: Uint8Array, pageWidth: number, rect: TerrainAtlasRect, source: TerrainPixelSource): void {
  const sourceIndex = (x: number, y: number): number => (y * source.width + x) * 4;
  const write = (x: number, y: number, index: number): void => {
    const targetIndex = (y * pageWidth + x) * 4;
    target[targetIndex] = source.data[index];
    target[targetIndex + 1] = source.data[index + 1];
    target[targetIndex + 2] = source.data[index + 2];
    target[targetIndex + 3] = source.data[index + 3];
  };
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) write(rect.x + x, rect.y + y, sourceIndex(x, y));
  for (let edge = 1; edge <= rect.gutter; edge += 1) {
    for (let x = 0; x < source.width; x += 1) {
      write(rect.x + x, rect.y - edge, sourceIndex(x, 0));
      write(rect.x + x, rect.y + source.height - 1 + edge, sourceIndex(x, source.height - 1));
    }
    for (let y = 0; y < source.height; y += 1) {
      write(rect.x - edge, rect.y + y, sourceIndex(0, y));
      write(rect.x + source.width - 1 + edge, rect.y + y, sourceIndex(source.width - 1, y));
    }
    write(rect.x - edge, rect.y - edge, sourceIndex(0, 0));
    write(rect.x + source.width - 1 + edge, rect.y - edge, sourceIndex(source.width - 1, 0));
    write(rect.x - edge, rect.y + source.height - 1 + edge, sourceIndex(0, source.height - 1));
    write(rect.x + source.width - 1 + edge, rect.y + source.height - 1 + edge, sourceIndex(source.width - 1, source.height - 1));
  }
}
