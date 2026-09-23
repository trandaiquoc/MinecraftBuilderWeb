import { SerializedVanillaAssets, VANILLA_ASSET_CACHE_SCHEMA_VERSION, VANILLA_ASSET_VERSION } from '../vanilla/vanilla-asset-provider';
import { SerializedExternalMod, EXTERNAL_MOD_CACHE_SCHEMA_VERSION } from '../mod/external-mod-provider';
import { throwIfAborted, createAbortError } from '../mod/mod-import-cancellation';

const DATABASE_NAME = 'minecraft-builder-assets';
const STORE_NAME = 'asset-bundles';
const MOD_STORE_NAME = 'external-mods';
const DATABASE_VERSION = 2;

export class IndexedDbAssetCache {
  async load(version = VANILLA_ASSET_VERSION): Promise<SerializedVanillaAssets | undefined> {
    const database = await openDatabase();
    const stored = await request<CachedVanillaAssets | undefined>(database, STORE_NAME, 'readonly', (store) => store.get(version));
    if (!stored) return undefined;
    const bundle = migrateCachedVanillaAssets(stored, version);
    if (stored.schemaVersion !== bundle.schemaVersion) await request(database, STORE_NAME, 'readwrite', (store) => store.put({ ...bundle, id: version }));
    return bundle;
  }

  async save(bundle: SerializedVanillaAssets): Promise<void> {
    const database = await openDatabase();
    await request(database, STORE_NAME, 'readwrite', (store) => store.put({ ...bundle, id: bundle.minecraftVersion }));
  }
  async listVanillaVersions(): Promise<readonly string[]> { const database = await openDatabase(); const values = await request<CachedVanillaAssets[]>(database, STORE_NAME, 'readonly', (store) => store.getAll()); return values.map((value) => value.minecraftVersion).filter((value): value is string => typeof value === 'string').sort(); }
  async deleteVanilla(version: string): Promise<void> { const database = await openDatabase(); await request(database, STORE_NAME, 'readwrite', (store) => store.delete(version)); }

  async loadExternalMods(): Promise<readonly SerializedExternalMod[]> {
    const database = await openDatabase();
    const values = await request<CachedExternalMod[]>(database, MOD_STORE_NAME, 'readonly', (store) => store.getAll());
    return values.filter((value) => value.schemaVersion === EXTERNAL_MOD_CACHE_SCHEMA_VERSION);
  }

  async saveExternalMod(mod: SerializedExternalMod, signal?: AbortSignal): Promise<void> {
    const database = await openDatabase();
    await request(database, MOD_STORE_NAME, 'readwrite', (store) => store.put({ ...mod, id: mod.sourceId }), signal);
  }

  async deleteExternalMod(sourceId: string): Promise<void> {
    const database = await openDatabase();
    await request(database, MOD_STORE_NAME, 'readwrite', (store) => store.delete(sourceId));
  }
}

export type CachedVanillaAssets = Omit<SerializedVanillaAssets, 'schemaVersion'> & { readonly schemaVersion?: number; readonly id?: string };
type CachedExternalMod = SerializedExternalMod & { readonly id: string };

export function migrateCachedVanillaAssets(bundle: CachedVanillaAssets, expectedVersion = bundle.minecraftVersion ?? VANILLA_ASSET_VERSION): SerializedVanillaAssets {
  if (bundle.minecraftVersion !== expectedVersion || typeof bundle.sourceName !== 'string' || !bundle.json || typeof bundle.json !== 'object' || !Array.isArray(bundle.binary)) throw new Error('Vanilla asset cache is invalid. Import the selected Minecraft version again.');
  if (bundle.schemaVersion !== 1 && bundle.schemaVersion !== VANILLA_ASSET_CACHE_SCHEMA_VERSION) throw new Error('Vanilla asset cache schema is unsupported. Import the selected Minecraft asset JAR again.');
  return { schemaVersion: VANILLA_ASSET_CACHE_SCHEMA_VERSION, minecraftVersion: expectedVersion, sourceName: bundle.sourceName, json: bundle.json, binary: bundle.binary };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE_NAME)) open.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); if (!open.result.objectStoreNames.contains(MOD_STORE_NAME)) open.result.createObjectStore(MOD_STORE_NAME, { keyPath: 'id' }); };
    open.onerror = () => reject(open.error ?? new Error('Unable to open vanilla asset cache'));
    open.onsuccess = () => resolve(open.result);
  });
}

function request<T>(database: IDBDatabase, storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    try { throwIfAborted(signal); } catch (error) { reject(error); return; }
    const transaction = database.transaction(storeName, mode); const value = operation(transaction.objectStore(storeName));
    const abort = (): void => { try { transaction.abort(); } catch { /* already complete */ } };
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = (): void => signal?.removeEventListener('abort', abort);
    value.onsuccess = () => { cleanup(); try { throwIfAborted(signal); resolve(value.result); } catch (error) { reject(error); } };
    value.onerror = () => { cleanup(); reject(value.error ?? new Error('Vanilla asset cache request failed')); };
    transaction.onabort = () => { cleanup(); reject(signal?.aborted ? (signal.reason instanceof Error ? signal.reason : createAbortError()) : new Error('Vanilla asset cache transaction aborted')); };
  });
}
