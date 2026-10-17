export function flipRenderTargetPixelsVertically(
  pixels: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const rowLength = width * 4;
  const flipped = new Uint8ClampedArray(pixels.length);
  for (let row = 0; row < height; row++) {
    const sourceStart = row * rowLength;
    const targetStart = (height - row - 1) * rowLength;
    flipped.set(pixels.subarray(sourceStart, sourceStart + rowLength), targetStart);
  }
  return flipped;
}

export async function renderTargetPixelsToBlob(
  pixels: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const flipped = flipRenderTargetPixelsVertically(pixels, width, height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create a 2D context for the project preview');
    const image = context.createImageData(width, height);
    image.data.set(flipped);
    context.putImageData(image, 0, 0);
    return canvas.convertToBlob({ type: 'image/webp', quality: 0.82 });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create a 2D context for the project preview');
  const image = context.createImageData(width, height);
  image.data.set(flipped);
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Unable to encode project preview'))),
      'image/webp',
      0.82,
    );
  });
}
