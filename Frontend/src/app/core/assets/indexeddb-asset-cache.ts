import { SerializedVanillaAssets, VANILLA_ASSET_CACHE_SCHEMA_VERSION, VANILLA_ASSET_VERSION } from './vanilla-asset-provider';

const DATABASE_NAME = 'minecraft-builder-assets';
const STORE_NAME = 'asset-bundles';
const DATABASE_VERSION = 1;

export class IndexedDbAssetCache {
  async load(): Promise<SerializedVanillaAssets | undefined> {
    const database = await openDatabase();
    const stored = await request<CachedVanillaAssets | undefined>(database, 'readonly', (store) => store.get(VANILLA_ASSET_VERSION));
    if (!stored) return undefined;
    const bundle = migrateCachedVanillaAssets(stored);
    if (stored.schemaVersion !== bundle.schemaVersion) await request(database, 'readwrite', (store) => store.put({ ...bundle, id: VANILLA_ASSET_VERSION }));
    return bundle;
  }

  async save(bundle: SerializedVanillaAssets): Promise<void> {
    const database = await openDatabase();
    await request(database, 'readwrite', (store) => store.put({ ...bundle, id: VANILLA_ASSET_VERSION }));
  }
}

export type CachedVanillaAssets = Omit<SerializedVanillaAssets, 'schemaVersion'> & { readonly schemaVersion?: number; readonly id?: string };

export function migrateCachedVanillaAssets(bundle: CachedVanillaAssets): SerializedVanillaAssets {
  if (bundle.minecraftVersion !== VANILLA_ASSET_VERSION || typeof bundle.sourceName !== 'string' || !bundle.json || typeof bundle.json !== 'object' || !Array.isArray(bundle.binary)) throw new Error('Vanilla asset cache is invalid. Import the Minecraft 1.21.1 JAR again.');
  if (bundle.schemaVersion !== 1 && bundle.schemaVersion !== VANILLA_ASSET_CACHE_SCHEMA_VERSION) throw new Error('Vanilla asset cache schema is unsupported. Import the Minecraft 1.21.1 JAR again.');
  return { schemaVersion: VANILLA_ASSET_CACHE_SCHEMA_VERSION, minecraftVersion: VANILLA_ASSET_VERSION, sourceName: bundle.sourceName, json: bundle.json, binary: bundle.binary };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE_NAME)) open.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); };
    open.onerror = () => reject(open.error ?? new Error('Unable to open vanilla asset cache'));
    open.onsuccess = () => resolve(open.result);
  });
}

function request<T>(database: IDBDatabase, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode); const value = operation(transaction.objectStore(STORE_NAME));
    value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? new Error('Vanilla asset cache request failed'));
  });
}
