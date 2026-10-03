import { Injectable, effect, inject } from '@angular/core';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import type { ProjectDocument } from '../../domain/project.types';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import { reconcileMissingBlocksCooperatively } from './missing-block-reconciliation';

@Injectable({ providedIn: 'root' })
export class MissingBlockReconciliationService {
  private readonly workspace = inject(WorkspaceStateService);
  private readonly library = inject(BlockLibraryService);
  private operationToken = 0;
  private readonly trigger = effect(() => {
    const project = this.workspace.project();
    const revision = this.library.catalogRevision();
    const token = ++this.operationToken;
    if (!project || !project.blocks.some((block) => block.kind === 'missing')) return;
    void this.reconcile(project, revision, token);
  });

  private async reconcile(project: ProjectDocument, revision: number, token: number): Promise<void> {
    const source = this.workspace.materializeRuntime(project) ?? project;
    const result = await reconcileMissingBlocksCooperatively(source, (id) => this.library.get(id));
    if (token !== this.operationToken || this.workspace.project() !== project || this.library.catalogRevision() !== revision) return;
    if (result.project !== source) { this.workspace.syncRuntime(result.project); this.workspace.project.set(result.project); }
  }
}
