import { coordinateKey } from '../../domain/coordinates';
import type { PlacedBlock, ProjectDocument, VoxelCoordinate } from '../../domain/project.types';
import type { ProjectBlockRuntimeIndex } from './project-block-runtime-index';

/** Immutable block-array operations shared by local editor mutations. */
export class ProjectBlockArrayMutator {
  static replace(
    project: ProjectDocument,
    replacements: readonly PlacedBlock[],
    index?: ProjectBlockRuntimeIndex,
  ): readonly PlacedBlock[] {
    if (!replacements.length) return project.blocks;
    const byKey = new Map(
      replacements.map((block) => [coordinateKey(block.position), block] as const),
    );
    const next = project.blocks.slice();
    const replaced = new Set<string>();
    for (const replacement of replacements) {
      const key = coordinateKey(replacement.position);
      const at =
        index?.currentProject === project ? (index.indexOf(replacement.position) ?? -1) : -1;
      if (at >= 0) {
        next[at] = replacement;
        replaced.add(key);
      }
    }
    if (replaced.size === replacements.length) return next;
    return next.map((block) => byKey.get(coordinateKey(block.position)) ?? block);
  }

  static replaceAtPosition(
    project: ProjectDocument,
    position: VoxelCoordinate,
    replacement: PlacedBlock,
    index?: ProjectBlockRuntimeIndex,
  ): readonly PlacedBlock[] {
    const at = index?.currentProject === project ? (index.indexOf(position) ?? -1) : -1;
    if (at >= 0) {
      const next = project.blocks.slice();
      next[at] = replacement;
      return next;
    }
    return project.blocks.map((block) =>
      coordinateKey(block.position) === coordinateKey(position) ? replacement : block,
    );
  }

  static append(project: ProjectDocument, blocks: readonly PlacedBlock[]): readonly PlacedBlock[] {
    return blocks.length ? [...project.blocks, ...blocks] : project.blocks;
  }

  static remove(
    project: ProjectDocument,
    positions: readonly VoxelCoordinate[],
  ): readonly PlacedBlock[] {
    const keys = new Set(positions.map(coordinateKey));
    return project.blocks.filter((block) => !keys.has(coordinateKey(block.position)));
  }
}
