import { CURRENT_PROJECT_SCHEMA_VERSION, DEFAULT_MINECRAFT_VERSION, ProjectDocument, ProjectSchemaVersion } from './project.types';

export function migrateProject(project: ProjectDocument, targetVersion: ProjectSchemaVersion = CURRENT_PROJECT_SCHEMA_VERSION): ProjectDocument {
  if (project.schemaVersion > targetVersion) {
    throw new Error(`Project schema ${project.schemaVersion} is newer than supported schema ${targetVersion}`);
  }
  let migrated = project;
  if (!migrated.metadata.minecraftVersion) migrated = { ...migrated, metadata: { ...migrated.metadata, minecraftVersion: DEFAULT_MINECRAFT_VERSION } };
  if (migrated.schemaVersion === 1 && targetVersion >= 2) {
    migrated = {
      ...migrated,
      schemaVersion: 2,
      blocks: migrated.blocks.map((block) => {
        const groupIds = block.groupIds ?? (block.groupId ? [block.groupId] : []);
        const { groupId: _legacyGroupId, ...withoutLegacyGroupId } = block;
        return { ...withoutLegacyGroupId, groupIds };
      }),
    };
  }
  if (migrated.schemaVersion === 2 && targetVersion >= 3) {
    migrated = { ...migrated, schemaVersion: 3, decorations: migrated.decorations ?? [] };
  }
  return migrated;
}
