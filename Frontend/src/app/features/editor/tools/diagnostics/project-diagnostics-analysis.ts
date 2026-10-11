import type { BlockDefinition } from '../../../../core/blocks/catalog/block-definition.types';
import type { ProjectDocument } from '../../../../core/domain/project.types';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface ProjectIssue {
  readonly severity: DiagnosticSeverity;
  readonly title: string;
  readonly detail: string;
  readonly id?: string;
}

export interface ProjectDiagnosticsText {
  readonly missingContent: string;
  readonly missingText: string;
  readonly unresolvedText: string;
  readonly visualSupport: string;
  readonly behaviorSupport: string;
  readonly partialVisualText: string;
  readonly partialBehaviorText: string;
  readonly assetProblem: string;
  readonly assetUnavailableText: string;
}

/** Collects project/content diagnostics in canonical block order. */
export function collectProjectIssues(
  project: ProjectDocument | undefined,
  definitionForId: (id: string) => BlockDefinition | undefined,
  assetsReady: boolean,
  text: ProjectDiagnosticsText,
): readonly ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  if (project) {
    for (const block of project.blocks) {
      const definition = definitionForId(block.id);
      if (block.kind === 'missing') {
        issues.push({
          severity: 'error',
          title: text.missingContent,
          detail: text.missingText,
          id: block.id,
        });
      } else if (!definition) {
        issues.push({
          severity: 'error',
          title: text.missingContent,
          detail: text.unresolvedText,
          id: block.id,
        });
      } else {
        if (definition.visualSupport !== 'real')
          issues.push({
            severity: 'warning',
            title: text.visualSupport,
            detail: text.partialVisualText,
            id: block.id,
          });
        if (definition.behaviorSupport !== 'full')
          issues.push({
            severity: 'warning',
            title: text.behaviorSupport,
            detail: text.partialBehaviorText,
            id: block.id,
          });
      }
    }
  }
  if (!assetsReady)
    issues.push({
      severity: 'warning',
      title: text.assetProblem,
      detail: text.assetUnavailableText,
    });
  return issues;
}

/** Filters an already-collected report without revisiting ProjectDocument.blocks. */
export function filterProjectIssues(
  issues: readonly ProjectIssue[],
  query: string,
): readonly ProjectIssue[] {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized
    ? issues.filter((issue) =>
        `${issue.title} ${issue.detail} ${issue.id ?? ''}`.toLocaleLowerCase().includes(normalized),
      )
    : issues;
}
