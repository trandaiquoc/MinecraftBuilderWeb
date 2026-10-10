import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { FflateZipArchiveWriter } from './fflate-zip-archive-writer';
import { validateZipArchiveEntryPath } from './zip-archive-writer';

function centralDirectoryMethods(bytes: Uint8Array): readonly number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = 0x02014b50;
  const methods: number[] = [];
  for (let cursor = 0; cursor + 46 <= view.byteLength;) {
    if (view.getUint32(cursor, true) !== signature) {
      cursor += 1;
      continue;
    }
    methods.push(view.getUint16(cursor + 10, true));
    cursor +=
      46 +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
  }
  return methods;
}

describe('FflateZipArchiveWriter', () => {
  it('writes requested STORE and DEFLATE methods and preserves UTF-8 entry bytes', async () => {
    const nbt = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00]);
    const meta = new TextEncoder().encode('{"description":"Nhà"}');
    const bytes = await new FflateZipArchiveWriter().write([
      { path: 'pack.mcmeta', bytes: meta, compression: 'deflate' },
      {
        path: 'data/minecraftbuilder/structure/houses/castle.nbt',
        bytes: nbt,
        compression: 'store',
      },
    ]);
    expect(Object.keys(unzipSync(bytes))).toEqual([
      'pack.mcmeta',
      'data/minecraftbuilder/structure/houses/castle.nbt',
    ]);
    expect([...unzipSync(bytes)['data/minecraftbuilder/structure/houses/castle.nbt']]).toEqual([
      ...nbt,
    ]);
    expect(centralDirectoryMethods(bytes)).toEqual([8, 0]);
  });

  it('rejects unsafe and duplicate entry paths before producing bytes', async () => {
    for (const path of [
      '/absolute',
      '\\absolute',
      '../escape',
      'folder/../escape',
      'folder/./escape',
      'folder//escape',
      'C:/escape',
      'folder:file',
      'folder/escape\u0000',
    ]) {
      expect(validateZipArchiveEntryPath(path)).not.toEqual([]);
    }
    await expect(
      new FflateZipArchiveWriter().write([
        { path: 'pack.mcmeta', bytes: new Uint8Array(), compression: 'store' },
        { path: 'pack.mcmeta', bytes: new Uint8Array(), compression: 'store' },
      ]),
    ).rejects.toThrow('duplicated');
    await expect(
      new FflateZipArchiveWriter().write([
        { path: '../escape', bytes: new Uint8Array(), compression: 'store' },
      ]),
    ).rejects.toThrow('parent segments');
  });
});
