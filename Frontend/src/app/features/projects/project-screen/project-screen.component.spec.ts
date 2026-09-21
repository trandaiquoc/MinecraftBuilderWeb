import { describe, expect, it } from 'vitest';
import { canDeleteProject, projectCreationFailureMessage, projectCreationGuard } from './project-screen.component';

describe('projectCreationGuard', () => {
  it('ignores duplicate create/open actions without reporting invalid dimensions', () => {
    expect(projectCreationGuard(true, false, false)).toBe('busy');
    expect(projectCreationGuard(false, true, false)).toBe('busy');
  });

  it('reports invalid dimensions only when the operation is idle', () => {
    expect(projectCreationGuard(false, false, false)).toBe('invalid');
    expect(projectCreationGuard(false, false, true)).toBeUndefined();
  });
});

describe('recent project deletion state', () => {
  it('blocks duplicate deletion for the same summary while allowing another row', () => {
    const deleting = new Set(['large-project']);
    expect(canDeleteProject(deleting, 'large-project')).toBe(false);
    expect(canDeleteProject(deleting, 'other-project')).toBe(true);
  });
});

describe('project creation failure classification', () => {
  it('keeps validation/persistence failures distinct for user-facing messages', () => {
    expect(projectCreationFailureMessage(new Error('Invalid Minecraft version'), 'storage', 'generic')).toBe('generic');
    expect(projectCreationFailureMessage(new Error('IndexedDB quota exceeded'), 'storage', 'generic')).toBe('storage');
  });
});
