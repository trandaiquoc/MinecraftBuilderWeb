import { computed, inject, Injectable } from '@angular/core';
import type { ContentSourceDescriptor } from '../../assets/content-source/content-source.types';
import type { ImportedModSummary } from '../../assets/vanilla/vanilla-assets.service';
import type { ProjectDocument } from '../../domain/project.types';
import { VanillaAssetsService } from '../../assets/vanilla/vanilla-assets.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';

export interface MissingProjectContentGroup {
  readonly namespace: string;
  readonly blockCount: number;
  readonly uniqueBlockCount: number;
  readonly blockIds: readonly string[];
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly minecraftVersion?: string;
}

export interface MissingProjectContentSummary {
  readonly totalMissingBlocks: number;
  readonly groups: readonly MissingProjectContentGroup[];
}

export const EMPTY_MISSING_PROJECT_CONTENT_SUMMARY: MissingProjectContentSummary = Object.freeze({ totalMissingBlocks: 0, groups: [] });

export function summarizeMissingProjectContent(
  project: ProjectDocument | undefined,
  sources: readonly ContentSourceDescriptor[] = [],
  importedMods: readonly ImportedModSummary[] = [],
): MissingProjectContentSummary {
  if (!project) return EMPTY_MISSING_PROJECT_CONTENT_SUMMARY;
  const sourceByNamespace = new Map<string, ContentSourceDescriptor>();
  for (const source of sources) for (const namespace of source.namespaces) if (!sourceByNamespace.has(namespace)) sourceByNamespace.set(namespace, source);
  const modBySource = new Map(importedMods.map((mod) => [mod.sourceId, mod] as const));
  const grouped = new Map<string, { count: number; ids: Set<string> }>();
  for (const block of project.blocks) {
    if (block.kind !== 'missing') continue;
    const group = grouped.get(block.namespace) ?? { count: 0, ids: new Set<string>() };
    group.count += 1;
    group.ids.add(block.id);
    grouped.set(block.namespace, group);
  }
  const groups = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([namespace, group]) => {
    const source = sourceByNamespace.get(namespace);
    const mod = source ? modBySource.get(source.id) : undefined;
    return {
      namespace,
      blockCount: group.count,
      uniqueBlockCount: group.ids.size,
      blockIds: [...group.ids].sort().slice(0, 20),
      ...(source ? { sourceId: source.id, sourceName: mod?.displayName ?? source.displayName, minecraftVersion: source.minecraftVersion } : {}),
    };
  });
  return { totalMissingBlocks: [...grouped.values()].reduce((total, group) => total + group.count, 0), groups };
}

@Injectable({ providedIn: 'root' })
export class MissingProjectContentSummaryService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly assets = inject(VanillaAssetsService);

  readonly summary = computed(() => {
    const project = this.workspace.project();
    const importedMods = this.assets.importedMods();
    this.assets.generation();
    return summarizeMissingProjectContent(project, this.assets.sources.sources(), importedMods);
  });
}
