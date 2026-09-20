import { migrateProject } from '../../domain/migrations';
import { ProjectDocument } from '../../domain/project.types';
import { ProjectStore, ProjectSummary } from './project-store.port';

const DATABASE_NAME = 'minecraft-builder';
const DATABASE_VERSION = 1;
const PROJECTS_STORE = 'projects';
const RECOVERY_STORE = 'recovery-snapshots';

interface StoredProject {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly document: ProjectDocument;
}

export class IndexedDbProjectStore implements ProjectStore {
  private readonly database: Promise<IDBDatabase>;

  constructor(databaseName = DATABASE_NAME) {
    this.database = openDatabase(databaseName);
  }

  async create(project: ProjectDocument): Promise<void> {
    await this.put(PROJECTS_STORE, toStoredProject(project), true);
  }

  async open(id: string): Promise<ProjectDocument | undefined> {
    return this.read(PROJECTS_STORE, id);
  }

  async save(project: ProjectDocument): Promise<void> {
    await this.put(PROJECTS_STORE, toStoredProject(project), false);
  }

  async delete(id: string): Promise<void> {
    await this.remove(PROJECTS_STORE, id);
  }

  async list(): Promise<readonly ProjectSummary[]> {
    const records = await this.readAll<StoredProject>(PROJECTS_STORE);
    return records
      .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveRecoverySnapshot(project: ProjectDocument): Promise<void> {
    await this.put(RECOVERY_STORE, toStoredProject(project), false);
  }

  async openRecoverySnapshot(id: string): Promise<ProjectDocument | undefined> {
    return this.read(RECOVERY_STORE, id);
  }

  async deleteRecoverySnapshot(id: string): Promise<void> {
    await this.remove(RECOVERY_STORE, id);
  }

  private async put(storeName: string, value: StoredProject, requireAbsent: boolean): Promise<void> {
    const database = await this.database;
    await runRequest(database, storeName, 'readwrite', (store) => requireAbsent ? store.add(value) : store.put(value));
  }

  private async read(storeName: string, id: string): Promise<ProjectDocument | undefined> {
    const database = await this.database;
    const record = await runRequest<StoredProject | undefined>(database, storeName, 'readonly', (store) => store.get(id));
    return record ? migrateProject(record.document) : undefined;
  }

  private async readAll<T>(storeName: string): Promise<readonly T[]> {
    const database = await this.database;
    return runRequest<T[]>(database, storeName, 'readonly', (store) => store.getAll());
  }

  private async remove(storeName: string, id: string): Promise<void> {
    const database = await this.database;
    await runRequest<undefined>(database, storeName, 'readwrite', (store) => store.delete(id));
  }
}

function toStoredProject(project: ProjectDocument): StoredProject {
  return { id: project.id, name: project.metadata.name, updatedAt: project.metadata.updatedAt, document: project };
}

function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) database.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(RECOVERY_STORE)) database.createObjectStore(RECOVERY_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runRequest<T>(database: IDBDatabase, storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    request.onsuccess = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
  });
}
