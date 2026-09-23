import { describe, expect, it } from 'vitest';
import { ZipArchive } from './zip-archive';

describe('ZipArchive', () => {
  it('reads a stored entry from the central directory', async () => {
    const archive = await ZipArchive.open(new Blob([storedZip('assets/minecraft/lang/en_us.json', '{"ok":true}')], { type: 'application/zip' }));
    expect(archive.entries.map((entry) => entry.name)).toEqual(['assets/minecraft/lang/en_us.json']);
    expect(new TextDecoder().decode(await archive.entries[0].read())).toBe('{"ok":true}');
  });

  it('reports monotonic byte progress while reading the archive', async () => {
    const values: number[] = [];
    const blob = new Blob([storedZip('progress.txt', 'progress')]);
    await ZipArchive.open(blob, (loaded, total) => { expect(total).toBe(blob.size); values.push(loaded); });
    expect(values.length).toBeGreaterThan(0);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values.at(-1)).toBe(blob.size);
  });

  it('inflates a deflated entry without a third-party ZIP dependency', async () => {
    const archive = await ZipArchive.open(new Blob([singleEntryZip('hello.txt', new Uint8Array([203, 72, 205, 201, 201, 7, 0]), 5, 8)]));
    expect(new TextDecoder().decode(await archive.entries[0].read())).toBe('hello');
  });

  it('drains large deflated output without stream backpressure deadlock', async () => {
    const compressed = new Uint8Array([237,193,49,1,0,0,0,194,160,172,235,95,194,26,30,64,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,175,6]);
    const archive = await ZipArchive.open(new Blob([singleEntryZip('large.txt', compressed, 95_872, 8)]));
    const output = await archive.entries[0].read();
    expect(output).toHaveLength(95_872); expect(output[0]).toBe(97); expect(output.at(-1)).toBe(97);
  });
});

function storedZip(name: string, content: string): ArrayBuffer {
  const data = new TextEncoder().encode(content); return singleEntryZip(name, data, data.length, 0);
}

function singleEntryZip(name: string, data: Uint8Array, uncompressedSize: number, method: number): ArrayBuffer {
  const nameBytes = new TextEncoder().encode(name);
  const localLength = 30 + nameBytes.length + data.length; const centralLength = 46 + nameBytes.length;
  const bytes = new Uint8Array(localLength + centralLength + 22); const view = new DataView(bytes.buffer); let offset = 0;
  view.setUint32(offset, 0x04034b50, true); view.setUint16(offset + 8, method, true); view.setUint32(offset + 18, data.length, true); view.setUint32(offset + 22, uncompressedSize, true); view.setUint16(offset + 26, nameBytes.length, true); bytes.set(nameBytes, offset + 30); bytes.set(data, offset + 30 + nameBytes.length); offset = localLength;
  view.setUint32(offset, 0x02014b50, true); view.setUint16(offset + 10, method, true); view.setUint32(offset + 20, data.length, true); view.setUint32(offset + 24, uncompressedSize, true); view.setUint16(offset + 28, nameBytes.length, true); view.setUint32(offset + 42, 0, true); bytes.set(nameBytes, offset + 46); offset += centralLength;
  view.setUint32(offset, 0x06054b50, true); view.setUint16(offset + 8, 1, true); view.setUint16(offset + 10, 1, true); view.setUint32(offset + 12, centralLength, true); view.setUint32(offset + 16, localLength, true);
  return bytes.buffer;
}
