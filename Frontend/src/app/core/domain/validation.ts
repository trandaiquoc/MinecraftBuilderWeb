import { isPositiveInteger, isWithinBounds } from './coordinates';
import { BlockId, PlacedBlock, ProjectDocument, ProjectSize, VoxelCoordinate } from './project.types';

export type DomainValidationCode =
  | 'invalid-size'
  | 'invalid-coordinate'
  | 'out-of-bounds'
  | 'invalid-block-id'
  | 'invalid-namespace'
  | 'invalid-project-name'
  | 'invalid-current-y'
  | 'invalid-opacity';

export interface DomainValidationIssue {
  readonly code: DomainValidationCode;
  readonly message: string;
  readonly path?: string;
}

export interface DomainValidationResult {
  readonly valid: boolean;
  readonly issues: readonly DomainValidationIssue[];
}

const REGISTRY_ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_.-]+$/;
const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;

export function validateProjectSize(size: ProjectSize): readonly DomainValidationIssue[] {
  const issues: DomainValidationIssue[] = [];
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!isPositiveInteger(size[axis])) {
      issues.push({ code: 'invalid-size', message: `${axis} must be a positive integer`, path: `size.${axis}` });
    }
  }
  return issues;
}

export function validateCoordinate(position: VoxelCoordinate, size?: ProjectSize): readonly DomainValidationIssue[] {
  const issues: DomainValidationIssue[] = [];
  if (!Number.isInteger(position.x) || !Number.isInteger(position.y) || !Number.isInteger(position.z)) {
    issues.push({ code: 'invalid-coordinate', message: 'coordinates must be integers' });
  }
  if (size && !isWithinBounds(position, size)) {
    issues.push({ code: 'out-of-bounds', message: 'coordinate is outside project bounds' });
  }
  return issues;
}

export function validateBlockId(block: BlockId): readonly DomainValidationIssue[] {
  const issues: DomainValidationIssue[] = [];
  if (!REGISTRY_ID_PATTERN.test(block.id)) {
    issues.push({ code: 'invalid-block-id', message: 'block ID must use namespace:path syntax', path: 'id' });
  }
  if (!NAMESPACE_PATTERN.test(block.namespace)) {
    issues.push({ code: 'invalid-namespace', message: 'namespace contains invalid characters', path: 'namespace' });
  }
  const [namespace] = block.id.split(':');
  if (namespace !== block.namespace) {
    issues.push({ code: 'invalid-namespace', message: 'namespace must match the block ID namespace', path: 'namespace' });
  }
  return issues;
}

export function validatePlacedBlock(block: PlacedBlock, size: ProjectSize): readonly DomainValidationIssue[] {
  return [
    ...validateBlockId(block),
    ...validateCoordinate(block.position, size).map((issue) => ({ ...issue, path: issue.path ?? 'position' })),
  ];
}

export function validateProject(project: ProjectDocument): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];
  for (const issue of validateProjectSize(project.size)) issues.push(issue);
  if (!project.metadata.name.trim()) {
    issues.push({ code: 'invalid-project-name', message: 'project name is required', path: 'metadata.name' });
  }
  if (!Number.isInteger(project.editorSettings.currentY) || !isWithinBounds({ x: 0, y: project.editorSettings.currentY, z: 0 }, project.size)) {
    issues.push({ code: 'invalid-current-y', message: 'current Y must be inside project bounds', path: 'editorSettings.currentY' });
  }
  if (project.editorSettings.referenceLayerOpacity < 0 || project.editorSettings.referenceLayerOpacity > 1) {
    issues.push({ code: 'invalid-opacity', message: 'reference layer opacity must be between 0 and 1', path: 'editorSettings.referenceLayerOpacity' });
  }
  for (let index = 0; index < project.blocks.length; index += 1) {
    const block = project.blocks[index];
    for (const issue of validatePlacedBlock(block, project.size)) issues.push({ code: issue.code, message: issue.message, path: `blocks.${index}.${issue.path ?? ''}` });
  }
  const decorations = project.decorations;
  for (let index = 0; index < (decorations?.length ?? 0); index += 1) {
    const decoration = decorations![index];
    const anchorIssues = validateCoordinate(decoration.anchor, project.size);
    for (const issue of anchorIssues) issues.push({ code: issue.code, message: issue.message, path: `decorations.${index}.anchor.${issue.path ?? ''}` });
    if (decoration.kind === 'painting' && !decoration.variantId) issues.push({ code: 'invalid-block-id', message: 'painting variant is required', path: `decorations.${index}.variantId` });
    if (decoration.rotation !== undefined && (!Number.isInteger(decoration.rotation) || decoration.rotation < 0 || decoration.rotation > 7)) issues.push({ code: 'invalid-coordinate', message: 'decoration rotation must be an integer from 0 to 7', path: `decorations.${index}.rotation` });
  }
  return { valid: issues.length === 0, issues };
}
