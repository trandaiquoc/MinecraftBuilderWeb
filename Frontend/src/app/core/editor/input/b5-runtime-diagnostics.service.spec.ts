import { describe, expect, it } from 'vitest';
import { B5RuntimeDiagnosticsService } from './b5-runtime-diagnostics.service';

describe('B5 runtime diagnostics', () => {
  it('keeps bounded keyboard/lifecycle/frame evidence and JSON-safe values', () => {
    const diagnostics = new B5RuntimeDiagnosticsService();
    const circular: Record<string, unknown> = {}; circular['self'] = circular;
    diagnostics.setContext({ shellActions: ['move-forward'], circular });
    diagnostics.recordKeyboard({ type: 'keydown', repeat: true, before: { shellActions: ['move-forward'], engineActions: [] }, after: { shellActions: [], engineActions: ['move-forward'] }, circular });
    diagnostics.recordLifecycle({ type: 'window.blur' });
    diagnostics.recordMovementFrame({ timestamp: 1, selectedBlock: { key: '1,2,3' } });
    const snapshot = diagnostics.snapshot();
    expect(snapshot.keyboard[0]['circular']).toBeTypeOf('object');
    expect(JSON.stringify(snapshot)).toContain('[Circular]');
    expect(snapshot.lifecycle).toHaveLength(1);
    expect(snapshot.movementFrames).toHaveLength(1);
    expect(snapshot.selectedTrace).toHaveLength(1);
    expect(snapshot.divergences).toHaveLength(1);
  });

  it('reset clears only diagnostic buffers and captures the current baseline', () => {
    const diagnostics = new B5RuntimeDiagnosticsService();
    diagnostics.setContext({ camera: { x: 1 }, selection: { single: { x: 2, y: 0, z: 3 } } });
    diagnostics.recordKeyboard({ type: 'keyup' });
    const reset = diagnostics.reset();
    expect(reset.keyboard).toHaveLength(0);
    expect(reset.lifecycle).toHaveLength(0);
    expect(reset.movementFrames).toHaveLength(0);
    expect(reset.baseline).toEqual({ camera: { x: 1 }, selection: { single: { x: 2, y: 0, z: 3 } } });
    expect(reset.sequence).toBe(1);
  });
});
