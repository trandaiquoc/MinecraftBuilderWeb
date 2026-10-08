import * as THREE from 'three';

export function isGrassTintBlock(blockId: string): boolean {
  return blockId === 'minecraft:grass_block' || blockId === 'minecraft:short_grass' || blockId === 'minecraft:tall_grass';
}

export function tintColorForFace(blockId: string, tintIndex: number | undefined, grassColor: number | undefined): number | undefined {
  return tintIndex === undefined || !isGrassTintBlock(blockId) ? undefined : grassColor;
}

export function grassColormapSampleCoordinate(width: number, height: number, temperature = 0.5, humidity = 1): readonly [number, number] {
  const effectiveHumidity = humidity * temperature;
  return [Math.floor((1 - temperature) * Math.max(width - 1, 0)), Math.floor((1 - effectiveHumidity) * Math.max(height - 1, 0))];
}

export function sampleGrassColormap(texture: THREE.Texture): number | undefined {
  const image = texture.image as { readonly width?: number; readonly height?: number; readonly data?: ArrayLike<number> } | undefined;
  const width = image?.width ?? 0; const height = image?.height ?? 0;
  if (!image || !width || !height) return undefined;
  const [x, y] = grassColormapSampleCoordinate(width, height);
  if (image.data && image.data.length >= width * height * 4) {
    const offset = (y * width + x) * 4;
    return ((image.data[offset] ?? 255) << 16) | ((image.data[offset + 1] ?? 255) << 8) | (image.data[offset + 2] ?? 255);
  }
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) return undefined;
  context.drawImage(image as CanvasImageSource, 0, 0);
  const pixel = context.getImageData(x, y, 1, 1).data;
  return (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
}
