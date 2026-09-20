import { describe, expect, it } from 'vitest';
import { IndexedDbAssetBundleSource, LocalDefaultBundleSource, vanillaBundle } from './asset-bundle';

const serialized = { schemaVersion: 2 as const, minecraftVersion: '1.21.1' as const, sourceName: 'fixture', json: {}, binary: [] };

describe('asset bundle sources', () => {
  it('normalizes the reusable vanilla bundle contract', () => {
    expect(vanillaBundle(serialized)).toMatchObject({ type: 'vanilla', version: '1.21.1', namespaces: ['minecraft'], manifest: { format: 'minecraft-builder-asset-bundle' } });
  });
  it('adapts an IndexedDB cache payload through the common source interface', async () => {
    await expect(new IndexedDbAssetBundleSource(async () => serialized).load()).resolves.toMatchObject({ id: 'indexeddb', sourceName: 'fixture' });
  });
  it('loads a local default bundle manifest before JAR import is needed', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ ...vanillaBundle(serialized), binaryBase64: [] }), { status: 200 });
    await expect(new LocalDefaultBundleSource('/local').load()).resolves.toMatchObject({ type: 'vanilla', sourceName: 'fixture' });
    globalThis.fetch = original;
  });
});
