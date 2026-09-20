import { describe, expect, it } from 'vitest';
import { projectCreationGuard } from './project-screen.component';

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
