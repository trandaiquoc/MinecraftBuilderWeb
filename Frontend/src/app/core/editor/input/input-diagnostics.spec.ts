import { describe, expect, it } from 'vitest';
import { InputDiagnosticsStore } from './input-diagnostics';

const event = (key: string, code = `Key${key.toUpperCase()}`) => ({ key, code, repeat: false, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, isTrusted: false });

describe('input diagnostics', () => {
  function setup() {
    const diagnostics = new InputDiagnosticsStore(true);
    const viewport = diagnostics.registerViewport('3d');
    const engine = diagnostics.registerEngine(viewport, '3d');
    const target = { viewportInstanceId: viewport, engineInstanceId: engine, mode: '3d' as const };
    return { diagnostics, viewport, engine, target };
  }

  it('captures a normal W down without divergence', () => {
    const { diagnostics, engine, target } = setup();
    const owner = { physicalOwner: 'KeyW', action: 'move-forward' as const };
    diagnostics.setShellState([owner], '3d');
    diagnostics.recordMovementRoute(owner.physicalOwner, owner.action, target);
    diagnostics.recordKeyDown(event('w'), { ...owner, ownerBefore: false, ownersBefore: [], ownersAfter: [owner], target, cameraKeyDownEmitted: true });
    diagnostics.recordCameraKeyDown(engine, owner.action);
    diagnostics.syncEngine(engine, ['move-forward'], true, 1);
    diagnostics.check('keydown');
    expect(diagnostics.snapshot().firstInputDivergence).toBeUndefined();
  });

  it('captures W down and up as inactive with no divergence', () => {
    const { diagnostics, engine, target } = setup();
    const owner = { physicalOwner: 'KeyW', action: 'move-forward' as const };
    diagnostics.setShellState([owner], '3d');
    diagnostics.recordMovementRoute(owner.physicalOwner, owner.action, target);
    diagnostics.recordCameraKeyDown(engine, owner.action);
    diagnostics.syncEngine(engine, [owner.action], true, 1);
    diagnostics.setShellState([], '3d');
    diagnostics.recordCameraKeyUp(engine, owner.action);
    diagnostics.syncEngine(engine, [], false);
    diagnostics.recordKeyUp(event('w'), { physicalOwner: owner.physicalOwner, action: owner.action, ownerFound: true, ownersBefore: [owner], ownersAfter: [], target, cameraKeyUpEmitted: true, enginePressedActionsBefore: [owner.action], enginePressedActionsAfter: [] });
    diagnostics.check('keyup');
    expect(diagnostics.snapshot().current.shellActions).toEqual([]);
    expect(diagnostics.snapshot().current.liveEngines[0]?.pressedActions).toEqual([]);
    expect(diagnostics.snapshot().firstInputDivergence).toBeUndefined();
  });

  it('freezes the first leaked-engine divergence and does not overwrite it', () => {
    const { diagnostics, engine } = setup();
    diagnostics.setShellState([], '3d');
    diagnostics.syncEngine(engine, ['move-left'], true, 2);
    diagnostics.check('raf');
    const first = diagnostics.snapshot().firstInputDivergence;
    diagnostics.setShellState([{ physicalOwner: 'KeyW', action: 'move-forward' }], '3d');
    diagnostics.check('later');
    expect(first?.divergenceType).toBe('A');
    expect(diagnostics.snapshot().firstInputDivergence).toEqual(first);
  });

  it('freezes a release routed to a different viewport', () => {
    const diagnostics = new InputDiagnosticsStore(true);
    const viewportOne = diagnostics.registerViewport('3d');
    const engineOne = diagnostics.registerEngine(viewportOne, '3d');
    const viewportTwo = diagnostics.registerViewport('y-layer');
    const engineTwo = diagnostics.registerEngine(viewportTwo, 'y-layer');
    const down = { viewportInstanceId: viewportOne, engineInstanceId: engineOne, mode: '3d' as const };
    const up = { viewportInstanceId: viewportTwo, engineInstanceId: engineTwo, mode: 'y-layer' as const };
    const owner = { physicalOwner: 'KeyA', action: 'move-left' as const };
    diagnostics.setShellState([owner], '3d');
    diagnostics.recordMovementRoute(owner.physicalOwner, owner.action, down);
    diagnostics.recordKeyUp(event('a'), { physicalOwner: owner.physicalOwner, action: owner.action, ownerFound: true, ownersBefore: [owner], ownersAfter: [], target: up, cameraKeyUpEmitted: true });
    expect(diagnostics.snapshot().firstInputDivergence?.divergenceType).toBe('C');
  });

  it('does not treat two physical owners for one action as divergent', () => {
    const { diagnostics, engine } = setup();
    const owners = [{ physicalOwner: 'KeyW', action: 'move-forward' as const }, { physicalOwner: 'ArrowUp', action: 'move-forward' as const }];
    diagnostics.setShellState(owners, '3d');
    diagnostics.syncEngine(engine, ['move-forward'], true, 3);
    diagnostics.check('multi-owner');
    expect(diagnostics.snapshot().firstInputDivergence).toBeUndefined();
  });

  it('resets rings and incidents without clearing live input state', () => {
    const { diagnostics, engine } = setup();
    diagnostics.setShellState([{ physicalOwner: 'KeyD', action: 'move-right' }], '3d');
    diagnostics.syncEngine(engine, ['move-right'], true, 4);
    diagnostics.recordMovementFrame(engine, 120, .1, ['move-right'], 4);
    diagnostics.check('raf');
    diagnostics.reset();
    const snapshot = diagnostics.snapshot();
    expect(snapshot.firstInputDivergence).toBeUndefined();
    expect(snapshot.movementFrames).toEqual([]);
    expect(snapshot.current.shellActions).toEqual(['move-right']);
    expect(snapshot.current.liveEngines[0]?.pressedActions).toEqual(['move-right']);
  });

  it('captures a large frame gap as JSON-safe evidence', () => {
    const { diagnostics, engine } = setup();
    diagnostics.recordMovementFrame(engine, 300, .1, ['move-forward'], 7);
    const snapshot = diagnostics.snapshot();
    expect(snapshot.firstLargeFrameGap?.rawDeltaMs).toBe(300);
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it('records delete suppression and shell/engine correlation', () => {
    const { diagnostics, engine } = setup();
    diagnostics.setShellState([], '3d');
    diagnostics.syncEngine(engine, ['move-forward'], true, 8);
    diagnostics.recordDelete({ timestamp: Date.now(), key: 'Delete', code: 'Delete', repeat: false, isTrusted: false, suppressed: true, shellOwnerCount: 0, shellActions: [], allEnginePressedActions: [], projectBlockCountBefore: 12, projectBlockCountAfter: 12 });
    const record = diagnostics.snapshot().deleteEvents[0];
    expect(record?.suppressed).toBe(true);
    expect(record?.shellEngineDivergedAtThatMoment).toBe(true);
    expect(diagnostics.snapshot().firstDeleteDuringEngineMovement?.suppressed).toBe(true);
  });
});
