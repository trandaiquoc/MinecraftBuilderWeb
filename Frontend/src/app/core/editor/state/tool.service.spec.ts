import { describe, expect, it } from 'vitest';
import { EditorToolService } from './tool.service';

describe('EditorToolService', () => {
  it('changes the active tool through its state owner', () => {
    const service = new EditorToolService();

    service.select('select');

    expect(service.active()).toBe('select');
    expect(service.active).not.toHaveProperty('set');
    expect(service.active).not.toHaveProperty('update');
  });
});
