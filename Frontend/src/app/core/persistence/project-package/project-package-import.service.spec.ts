import { describe, expect, it } from 'vitest';
import { ProjectDocument } from '../../domain/project.types';
import { ProjectPersistenceService } from '../project-persistence.service';
import { ProjectStore, ProjectSummary } from '../project-store/project-store.port';
import { serializeProjectPackage } from './project-package';
import { ProjectPackageImportService } from './project-package-import.service';

const project: ProjectDocument = {
  schemaVersion: 3, id: 'imported', metadata: { name: 'Imported', minecraftVersion: '1.21.1', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  size: { x: 4, y: 4, z: 4 }, structureMode: 'vanilla-structure-block', blocks: [], groups: [], editorSettings: { currentY: 0, layerVisibility: 'current-only', referenceLayerOpacity: .5 }, decorations: [],
};

describe('project package import boundary', () => {
  it('sets busy state before save and activates only after storage succeeds', async () => {
    const store = new ImportStore(); const persistence = new ProjectPersistenceService(store, 0); const coordinator = new ProjectPackageImportService(persistence); const stages: string[] = [];
    await coordinator.import(fakeFile(serializeProjectPackage(project)), async () => { stages.push(coordinator.state().stage); }, async (value) => { stages.push(coordinator.state().stage); expect(value.id).toBe('imported'); });
    expect(stages).toEqual(['saving-current', 'activating']); expect(coordinator.state()).toMatchObject({ stage: 'success', projectName: 'Imported', blockCount: 0 });
  });

  it('reports a categorized error and never calls activation when parsing fails', async () => {
    const coordinator = new ProjectPackageImportService(new ProjectPersistenceService(new ImportStore(), 0)); let activated = false;
    await coordinator.import(fakeFile('{"blocks":[]}'), async () => undefined, async () => { activated = true; });
    expect(activated).toBe(false); expect(coordinator.state()).toMatchObject({ stage: 'error', errorCategory: 'not-project-package' });
  });
});

function fakeFile(text: string): File { return { name: 'project.minecraftbuilder.json', size: text.length, text: async () => text } as File; }

class ImportStore implements ProjectStore {
  private readonly values = new Map<string, ProjectDocument>();
  async create(value: ProjectDocument): Promise<void> { this.values.set(value.id, structuredClone(value)); }
  async exists(id: string): Promise<boolean> { return this.values.has(id); }
  async open(id: string): Promise<ProjectDocument | undefined> { return this.values.get(id); }
  async save(value: ProjectDocument): Promise<void> { this.values.set(value.id, structuredClone(value)); }
  async delete(id: string): Promise<void> { this.values.delete(id); }
  async list(): Promise<readonly ProjectSummary[]> { return [...this.values.values()].map((value) => ({ id: value.id, name: value.metadata.name, minecraftVersion: value.metadata.minecraftVersion, updatedAt: value.metadata.updatedAt })); }
  async saveRecoverySnapshot(): Promise<void> { /* no-op test store */ }
  async openRecoverySnapshot(): Promise<ProjectDocument | undefined> { return undefined; }
  async deleteRecoverySnapshot(): Promise<void> { /* no-op test store */ }
}
