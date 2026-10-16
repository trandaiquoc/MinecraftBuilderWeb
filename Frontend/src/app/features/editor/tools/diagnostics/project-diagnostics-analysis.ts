import type { BlockDefinition } from '../../../../core/blocks/catalog/block-definition.types';
import type { ProjectDocument } from '../../../../core/domain/project.types';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';
export type DiagnosticCategory = 'content' | 'visual' | 'behavior' | 'assets';
export type DiagnosticFilter = DiagnosticSeverity | 'all';
export type DiagnosticCategoryFilter = DiagnosticCategory | 'all';
export type ProjectIssueCode =
  | 'missing-content'
  | 'unresolved-content'
  | 'visual-support-partial'
  | 'visual-support-fallback'
  | 'behavior-support-partial'
  | 'behavior-support-unknown'
  | 'assets-unavailable';

export interface ProjectIssue {
  readonly key: string;
  readonly code: ProjectIssueCode;
  readonly category: DiagnosticCategory;
  readonly severity: DiagnosticSeverity;
  readonly id?: string;
  readonly affectedBlocks: number;
}

export interface ProjectIssuePresentation extends ProjectIssue {
  readonly title: string;
  readonly detail: string;
}

export interface ProjectDiagnosticsText {
  readonly missingContent: string;
  readonly missingText: string;
  readonly unresolvedText: string;
  readonly partialVisualTitle: string;
  readonly partialVisualText: string;
  readonly fallbackVisualTitle: string;
  readonly fallbackVisualText: string;
  readonly partialBehaviorTitle: string;
  readonly partialBehaviorText: string;
  readonly unknownBehaviorTitle: string;
  readonly unknownBehaviorText: string;
  readonly assetProblem: string;
  readonly assetUnavailableText: string;
}

interface MutableProjectIssue {
  key: string;
  code: ProjectIssueCode;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  id?: string;
  affectedBlocks: number;
}

interface ProjectIssueMessage {
  readonly title: string;
  readonly detail: string;
}

/** Collects in one pass and caches content definitions per canonical block ID. */
export function collectProjectIssues(
  project: ProjectDocument | undefined,
  definitionForId: (id: string) => BlockDefinition | undefined,
  assetsReady: boolean,
): readonly ProjectIssue[] {
  const groups = new Map<string, MutableProjectIssue>();
  const definitions = new Map<string, BlockDefinition | undefined>();

  if (project) {
    for (const block of project.blocks) {
      if (block.kind === 'missing') {
        addIssue(groups, {
          code: 'missing-content',
          category: 'content',
          severity: 'error',
          id: block.id,
        });
        continue;
      }

      let definition = definitions.get(block.id);
      if (!definitions.has(block.id)) {
        definition = definitionForId(block.id);
        definitions.set(block.id, definition);
      }

      if (!definition) {
        addIssue(groups, {
          code: 'unresolved-content',
          category: 'content',
          severity: 'error',
          id: block.id,
        });
        continue;
      }

      if (definition.visualSupport === 'partial') {
        addIssue(groups, {
          code: 'visual-support-partial',
          category: 'visual',
          severity: 'warning',
          id: block.id,
        });
      } else if (definition.visualSupport === 'fallback') {
        addIssue(groups, {
          code: 'visual-support-fallback',
          category: 'visual',
          severity: 'warning',
          id: block.id,
        });
      }

      if (definition.behaviorSupport === 'partial') {
        addIssue(groups, {
          code: 'behavior-support-partial',
          category: 'behavior',
          severity: 'warning',
          id: block.id,
        });
      } else if (definition.behaviorSupport === 'unknown') {
        addIssue(groups, {
          code: 'behavior-support-unknown',
          category: 'behavior',
          severity: 'info',
          id: block.id,
        });
      }
    }
  }

  if (!assetsReady) {
    addIssue(groups, {
      code: 'assets-unavailable',
      category: 'assets',
      severity: 'warning',
    });
  }

  const bySeverity: Record<DiagnosticSeverity, MutableProjectIssue[]> = {
    error: [],
    warning: [],
    info: [],
  };
  for (const issue of groups.values()) bySeverity[issue.severity].push(issue);
  return [...bySeverity.error, ...bySeverity.warning, ...bySeverity.info];
}

/** Localizes collected issue codes without revisiting project blocks or definitions. */
export function localizeProjectIssues(
  issues: readonly ProjectIssue[],
  text: ProjectDiagnosticsText,
): readonly ProjectIssuePresentation[] {
  const messages: Record<ProjectIssueCode, ProjectIssueMessage> = {
    'missing-content': { title: text.missingContent, detail: text.missingText },
    'unresolved-content': { title: text.missingContent, detail: text.unresolvedText },
    'visual-support-partial': {
      title: text.partialVisualTitle,
      detail: text.partialVisualText,
    },
    'visual-support-fallback': {
      title: text.fallbackVisualTitle,
      detail: text.fallbackVisualText,
    },
    'behavior-support-partial': {
      title: text.partialBehaviorTitle,
      detail: text.partialBehaviorText,
    },
    'behavior-support-unknown': {
      title: text.unknownBehaviorTitle,
      detail: text.unknownBehaviorText,
    },
    'assets-unavailable': { title: text.assetProblem, detail: text.assetUnavailableText },
  };
  return issues.map((issue) => ({ ...issue, ...messages[issue.code] }));
}

/** Filters localized groups without revisiting ProjectDocument.blocks. */
export function filterProjectIssues(
  issues: readonly ProjectIssuePresentation[],
  query: string,
  severity: DiagnosticFilter = 'all',
  category: DiagnosticCategoryFilter = 'all',
): readonly ProjectIssuePresentation[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized && severity === 'all' && category === 'all') return issues;
  return issues.filter((issue) => {
    if (severity !== 'all' && issue.severity !== severity) return false;
    if (category !== 'all' && issue.category !== category) return false;
    return (
      !normalized ||
      `${issue.title} ${issue.detail} ${issue.id ?? ''}`.toLocaleLowerCase().includes(normalized)
    );
  });
}

function addIssue(
  groups: Map<string, MutableProjectIssue>,
  issue: Omit<ProjectIssue, 'key' | 'affectedBlocks'>,
): void {
  const identity = JSON.stringify([issue.code, issue.severity, issue.category, issue.id ?? null]);
  const existing = groups.get(identity);
  if (existing) {
    if (issue.id) existing.affectedBlocks += 1;
    return;
  }
  groups.set(identity, {
    ...issue,
    key: identity,
    affectedBlocks: issue.id ? 1 : 0,
  });
}
