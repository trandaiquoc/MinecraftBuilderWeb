import type { StructureJsonDecorationIssueCategory, StructureJsonIssueCategory } from './structure-json-import';
import type { StructureJsonImportBlockerCode } from './structure-json-import-plan';

export type StructureJsonValidationSeverity = 'error' | 'warning';

const BLOCK_CATEGORY_SEVERITY: Readonly<Record<StructureJsonIssueCategory, StructureJsonValidationSeverity>> = {
  missing: 'warning',
  bounds: 'error',
  state: 'error',
  duplicate: 'error',
  'content-limit': 'error',
  support: 'error',
  warning: 'warning',
};

const DECORATION_CATEGORY_SEVERITY: Readonly<Record<StructureJsonDecorationIssueCategory, StructureJsonValidationSeverity>> = {
  'missing-asset': 'warning',
  bounds: 'error',
  invalid: 'error',
  conflict: 'error',
  'content-limit': 'error',
};

export function structureJsonBlockIssueSeverity(category: StructureJsonIssueCategory): StructureJsonValidationSeverity {
  return BLOCK_CATEGORY_SEVERITY[category];
}

export function structureJsonDecorationIssueSeverity(category: StructureJsonDecorationIssueCategory): StructureJsonValidationSeverity {
  return DECORATION_CATEGORY_SEVERITY[category];
}

export function structureJsonImportBlockerSeverity(_code: StructureJsonImportBlockerCode): StructureJsonValidationSeverity {
  return 'error';
}
