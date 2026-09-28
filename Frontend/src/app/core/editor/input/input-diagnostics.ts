import type { MovementAction } from './keyboard-bindings';

export type InputDiagnosticMode = '3d' | 'y-layer';
export type InputDivergenceType = 'A' | 'B' | 'C' | 'D' | 'E';

export interface InputViewportIdentity {
  readonly viewportInstanceId: string;
  readonly engineInstanceId: string;
  readonly mode: InputDiagnosticMode;
}

export interface InputShellOwner {
  readonly physicalOwner: string;
  readonly action: MovementAction;
  readonly downViewportInstanceId?: string;
  readonly downEngineInstanceId?: string;
  readonly downTimestamp?: number;
}

interface LiveViewport {
  readonly viewportInstanceId: string;
  readonly mode: InputDiagnosticMode;
  readonly created: number;
  destroyed?: number;
}

export interface InputViewportSnapshot {
  readonly viewportInstanceId: string;
  readonly engineInstanceId?: string;
  readonly mode: InputDiagnosticMode;
  readonly created: number;
  readonly destroyed?: number;
  readonly engineDisposed: boolean;
  readonly enginePressedActions: readonly MovementAction[];
  readonly cameraMoveFrameActive: boolean;
}

interface LiveEngine {
  readonly engineInstanceId: string;
  readonly viewportInstanceId: string;
  readonly mode: InputDiagnosticMode;
  readonly created: number;
  pressedActions: MovementAction[];
  cameraMoveFrameActive: boolean;
  cameraMoveFrameId?: number;
  disposed: boolean;
  destroyed?: number;
}

export interface InputMovementRoute {
  readonly physicalOwner: string;
  readonly action: MovementAction;
  readonly downViewportInstanceId?: string;
  readonly downEngineInstanceId?: string;
  readonly downTimestamp: number;
  upViewportInstanceId?: string;
  upEngineInstanceId?: string;
  routedToDifferentViewport?: boolean;
  routedToDifferentEngine?: boolean;
}

export interface InputDivergence {
  readonly divergenceType: InputDivergenceType;
  readonly timestamp: number;
  readonly triggeringEvent: unknown;
  readonly shellOwners: readonly InputShellOwner[];
  readonly shellActions: readonly MovementAction[];
  readonly allLiveEngines: readonly InputEngineSnapshot[];
  readonly activeMovementRoutes: readonly InputMovementRoute[];
  readonly currentMode?: InputDiagnosticMode;
  readonly documentVisibilityState?: string;
  readonly documentHasFocus?: boolean;
  readonly lifecycle: readonly InputLifecycleEvent[];
  readonly frameTiming: { readonly lastFrameGapMs?: number; readonly maxRecentFrameGapMs: number };
  readonly lastDeleteSelection?: InputDeleteEvent;
}

export interface InputEngineSnapshot {
  readonly engineInstanceId: string;
  readonly viewportInstanceId: string;
  readonly mode: InputDiagnosticMode;
  readonly pressedActions: readonly MovementAction[];
  readonly cameraMoveFrameActive: boolean;
  readonly cameraMoveFrameId?: number;
  readonly disposed: boolean;
  readonly engineDisposed: boolean;
}

export interface InputLifecycleEvent {
  readonly timestamp: number;
  readonly type: string;
  readonly target?: string;
  readonly visibilityState?: string;
  readonly before?: string;
  readonly after?: string;
}

export interface InputDeleteEvent {
  readonly timestamp: number;
  readonly key: string;
  readonly code?: string;
  readonly repeat: boolean;
  readonly isTrusted: boolean;
  readonly suppressed: boolean;
  readonly shellOwnerCount: number;
  readonly shellActions: readonly MovementAction[];
  readonly allEnginePressedActions: readonly { readonly engineInstanceId: string; readonly actions: readonly MovementAction[] }[];
  readonly shellEngineDivergedAtThatMoment: boolean;
  readonly projectBlockCountBefore?: number;
  readonly projectBlockCountAfter?: number;
}

export interface InputMovementFrame {
  readonly timestamp: number;
  readonly deltaMsRaw: number;
  readonly deltaSecondsUsed: number;
  readonly pressedActions: readonly MovementAction[];
  readonly cameraMoveFrameId?: number;
  readonly cameraMoveFrameActive: boolean;
  readonly cameraMoveFramePresent: boolean;
  readonly engineInstanceId: string;
}

export interface InputKeyboardEventRecord {
  readonly type: 'keydown' | 'keyup';
  readonly eventId: number;
  readonly timestamp: number;
  readonly key: string;
  readonly code?: string;
  readonly repeat?: boolean;
  readonly modifiers?: { readonly ctrl: boolean; readonly alt: boolean; readonly shift: boolean; readonly meta: boolean };
  readonly isTrusted: boolean;
  readonly physicalOwner: string;
  readonly resolvedAction?: MovementAction;
  readonly lookupAction?: MovementAction;
  readonly ownerBefore?: boolean;
  readonly ownerFound?: boolean;
  readonly ownersBefore?: readonly InputShellOwner[];
  readonly ownersAfter?: readonly InputShellOwner[];
  readonly targetViewportInstanceId?: string;
  readonly targetEngineInstanceId?: string;
  readonly cameraKeyDownEmitted?: boolean;
  readonly cameraKeyUpEmitted?: boolean;
  readonly enginePressedActionsBefore?: readonly MovementAction[];
  readonly enginePressedActionsAfter?: readonly MovementAction[];
  readonly suspiciousKeyup?: boolean;
}

export interface InputDiagnosticsSnapshot {
  readonly version: 1;
  readonly capturedAt: string;
  readonly firstInputDivergence?: InputDivergence;
  readonly firstDeleteDuringEngineMovement?: InputDeleteEvent;
  readonly firstLargeFrameGap?: { readonly timestamp: number; readonly rawDeltaMs: number; readonly engineInstanceId: string; readonly pressedActions: readonly MovementAction[]; readonly shellOwners: readonly InputShellOwner[] };
  readonly current: {
    readonly mode?: InputDiagnosticMode;
    readonly shellOwners: readonly InputShellOwner[];
    readonly shellActions: readonly MovementAction[];
    readonly liveViewports: readonly InputViewportSnapshot[];
    readonly liveEngines: readonly InputEngineSnapshot[];
  };
  readonly activeMovementRoutes: readonly InputMovementRoute[];
  readonly keyboardEvents: readonly InputKeyboardEventRecord[];
  readonly lifecycle: readonly InputLifecycleEvent[];
  readonly movementFrames: readonly InputMovementFrame[];
  readonly deleteEvents: readonly InputDeleteEvent[];
}

const KEYBOARD_RING_LIMIT = 60;
const LIFECYCLE_RING_LIMIT = 20;
const FRAME_RING_LIMIT = 30;
const DELETE_RING_LIMIT = 30;

export class InputDiagnosticsStore {
  private enabled: boolean;
  private viewportSequence = 0;
  private engineSequence = 0;
  private eventSequence = 0;
  private shellOwners: readonly InputShellOwner[] = [];
  private shellActions: readonly MovementAction[] = [];
  private currentMode?: InputDiagnosticMode;
  private readonly viewports = new Map<string, LiveViewport>();
  private readonly engines = new Map<string, LiveEngine>();
  private readonly routes = new Map<string, InputMovementRoute>();
  private readonly keyboardEvents: InputKeyboardEventRecord[] = [];
  private readonly lifecycle: InputLifecycleEvent[] = [];
  private readonly movementFrames: InputMovementFrame[] = [];
  private readonly deleteEvents: InputDeleteEvent[] = [];
  private firstInputDivergence?: InputDivergence;
  private firstDeleteDuringEngineMovement?: InputDeleteEvent;
  private firstLargeFrameGap?: InputDiagnosticsSnapshot['firstLargeFrameGap'];
  private lastFrameGapMs?: number;
  private maxRecentFrameGapMs = 0;

  constructor(enabled = false) { this.enabled = enabled; }

  enable(): void { this.enabled = true; }
  isEnabled(): boolean { return this.enabled; }

  registerViewport(mode: InputDiagnosticMode): string {
    if (!this.enabled) return '';
    let viewportInstanceId = `viewport-${++this.viewportSequence}`;
    while (this.viewports.has(viewportInstanceId)) viewportInstanceId = `viewport-${++this.viewportSequence}`;
    this.viewports.set(viewportInstanceId, { viewportInstanceId, mode, created: Date.now() });
    this.recordLifecycle({ type: 'viewport-create', target: viewportInstanceId });
    return viewportInstanceId;
  }

  destroyViewport(viewportInstanceId: string): void {
    if (!this.enabled || !viewportInstanceId) return;
    const viewport = this.viewports.get(viewportInstanceId);
    if (viewport && !viewport.destroyed) this.viewports.set(viewportInstanceId, { ...viewport, destroyed: Date.now() });
    this.recordLifecycle({ type: 'viewport-destroy', target: viewportInstanceId });
    this.check('viewport-destroy', { viewportInstanceId });
  }

  registerEngine(viewportInstanceId: string, mode: InputDiagnosticMode): string {
    if (!this.enabled) return '';
    let engineInstanceId = `engine-${++this.engineSequence}`;
    while (this.engines.has(engineInstanceId)) engineInstanceId = `engine-${++this.engineSequence}`;
    this.engines.set(engineInstanceId, { engineInstanceId, viewportInstanceId, mode, created: Date.now(), pressedActions: [], cameraMoveFrameActive: false, disposed: false });
    this.recordLifecycle({ type: 'engine-create', target: engineInstanceId });
    return engineInstanceId;
  }

  disposeEngine(engineInstanceId: string): void {
    if (!this.enabled || !engineInstanceId) return;
    const engine = this.engines.get(engineInstanceId);
    if (engine && !engine.disposed) this.engines.set(engineInstanceId, { ...engine, disposed: true, destroyed: Date.now(), cameraMoveFrameActive: false });
    this.recordLifecycle({ type: 'engine-dispose', target: engineInstanceId });
    this.check('engine-dispose', { engineInstanceId });
  }

  engineSnapshot(engineInstanceId: string): InputEngineSnapshot | undefined {
    const engine = this.engines.get(engineInstanceId);
    return engine ? this.snapshotEngine(engine) : undefined;
  }

  syncEngine(engineInstanceId: string, pressedActions: Iterable<MovementAction>, cameraMoveFrameActive: boolean, cameraMoveFrameId?: number): void {
    if (!this.enabled || !engineInstanceId) return;
    const engine = this.engines.get(engineInstanceId);
    if (!engine) return;
    engine.pressedActions = [...new Set(pressedActions)].sort();
    engine.cameraMoveFrameActive = cameraMoveFrameActive;
    engine.cameraMoveFrameId = cameraMoveFrameId;
  }

  setShellState(owners: readonly InputShellOwner[], mode?: InputDiagnosticMode): void {
    if (!this.enabled) return;
    this.shellOwners = owners.map((owner) => ({ ...owner }));
    this.shellActions = [...new Set(owners.map((owner) => owner.action))].sort();
    this.currentMode = mode;
  }

  recordKeyDown(event: { readonly key: string; readonly code?: string; readonly repeat: boolean; readonly ctrlKey: boolean; readonly altKey: boolean; readonly shiftKey: boolean; readonly metaKey: boolean; readonly isTrusted: boolean }, details: { readonly physicalOwner: string; readonly action?: MovementAction; readonly ownerBefore: boolean; readonly ownersBefore: readonly InputShellOwner[]; readonly ownersAfter: readonly InputShellOwner[]; readonly target?: InputViewportIdentity; readonly cameraKeyDownEmitted: boolean; readonly enginePressedActionsAfter?: readonly MovementAction[] }): number {
    if (!this.enabled) return 0;
    const eventId = ++this.eventSequence;
    this.push(this.keyboardEvents, { type: 'keydown', eventId, timestamp: Date.now(), key: event.key, code: event.code, repeat: event.repeat, modifiers: { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey }, isTrusted: event.isTrusted, physicalOwner: details.physicalOwner, resolvedAction: details.action, ownerBefore: details.ownerBefore, ownersBefore: details.ownersBefore, ownersAfter: details.ownersAfter, targetViewportInstanceId: details.target?.viewportInstanceId, targetEngineInstanceId: details.target?.engineInstanceId, cameraKeyDownEmitted: details.cameraKeyDownEmitted, enginePressedActionsAfter: details.enginePressedActionsAfter });
    return eventId;
  }

  recordKeyUp(event: { readonly key: string; readonly code?: string; readonly repeat: boolean; readonly ctrlKey: boolean; readonly altKey: boolean; readonly shiftKey: boolean; readonly metaKey: boolean; readonly isTrusted: boolean }, details: { readonly physicalOwner: string; readonly action?: MovementAction; readonly ownerFound: boolean; readonly ownersBefore: readonly InputShellOwner[]; readonly ownersAfter: readonly InputShellOwner[]; readonly target?: InputViewportIdentity; readonly cameraKeyUpEmitted: boolean; readonly enginePressedActionsBefore?: readonly MovementAction[]; readonly enginePressedActionsAfter?: readonly MovementAction[] }): number {
    if (!this.enabled) return 0;
    const eventId = ++this.eventSequence;
    const route = this.routes.get(details.physicalOwner);
    const routedToDifferentViewport = !!route?.downViewportInstanceId && route.downViewportInstanceId !== details.target?.viewportInstanceId;
    const routedToDifferentEngine = !!route?.downEngineInstanceId && route.downEngineInstanceId !== details.target?.engineInstanceId;
    if (route) { route.upViewportInstanceId = details.target?.viewportInstanceId; route.upEngineInstanceId = details.target?.engineInstanceId; route.routedToDifferentViewport = routedToDifferentViewport; route.routedToDifferentEngine = routedToDifferentEngine; }
    const suspiciousKeyup = !details.ownerFound && this.shellOwners.length > 0;
    this.push(this.keyboardEvents, { type: 'keyup', eventId, timestamp: Date.now(), key: event.key, code: event.code, repeat: event.repeat, modifiers: { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey }, isTrusted: event.isTrusted, physicalOwner: details.physicalOwner, lookupAction: details.action, ownerFound: details.ownerFound, ownersBefore: details.ownersBefore, ownersAfter: details.ownersAfter, targetViewportInstanceId: details.target?.viewportInstanceId, targetEngineInstanceId: details.target?.engineInstanceId, cameraKeyUpEmitted: details.cameraKeyUpEmitted, enginePressedActionsBefore: details.enginePressedActionsBefore, enginePressedActionsAfter: details.enginePressedActionsAfter, suspiciousKeyup });
    if (route) { this.routes.delete(details.physicalOwner); if (routedToDifferentViewport || routedToDifferentEngine) this.check('routed-to-different-engine', { physicalOwner: details.physicalOwner, route, target: details.target }, 'C'); }
    return eventId;
  }

  recordCameraKeyDown(engineInstanceId: string, action: MovementAction): void { if (!this.enabled) return; const engine = this.engines.get(engineInstanceId); if (engine) { engine.pressedActions = [...new Set([...engine.pressedActions, action])].sort(); } this.recordLifecycle({ type: 'engine-cameraKeyDown', target: `${engineInstanceId}:${action}` }); }
  recordCameraKeyUp(engineInstanceId: string, action: MovementAction): void { if (!this.enabled) return; const engine = this.engines.get(engineInstanceId); if (engine) engine.pressedActions = engine.pressedActions.filter((value) => value !== action); this.recordLifecycle({ type: 'engine-cameraKeyUp', target: `${engineInstanceId}:${action}` }); }
  recordEngineClearInput(engineInstanceId: string): void { if (!this.enabled) return; const engine = this.engines.get(engineInstanceId); if (engine) { engine.pressedActions = []; engine.cameraMoveFrameActive = false; engine.cameraMoveFrameId = undefined; } this.recordLifecycle({ type: 'engine-clearInput', target: engineInstanceId }); }

  recordMovementRoute(owner: string, action: MovementAction, target?: InputViewportIdentity): void {
    if (!this.enabled) return;
    this.routes.set(owner, { physicalOwner: owner, action, downViewportInstanceId: target?.viewportInstanceId, downEngineInstanceId: target?.engineInstanceId, downTimestamp: Date.now() });
  }

  routeForOwner(owner: string): Pick<InputShellOwner, 'downViewportInstanceId' | 'downEngineInstanceId' | 'downTimestamp'> {
    const route = this.routes.get(owner);
    return route ? { downViewportInstanceId: route.downViewportInstanceId, downEngineInstanceId: route.downEngineInstanceId, downTimestamp: route.downTimestamp } : {};
  }

  recordMovementFrame(engineInstanceId: string, deltaMsRaw: number, deltaSecondsUsed: number, pressedActions: readonly MovementAction[], cameraMoveFrameId?: number): void {
    if (!this.enabled) return;
    this.lastFrameGapMs = deltaMsRaw;
    this.maxRecentFrameGapMs = Math.max(this.maxRecentFrameGapMs, deltaMsRaw);
    const cameraMoveFrameActive = cameraMoveFrameId !== undefined;
    this.syncEngine(engineInstanceId, pressedActions, cameraMoveFrameActive, cameraMoveFrameId);
    this.push(this.movementFrames, { timestamp: Date.now(), deltaMsRaw, deltaSecondsUsed, pressedActions: [...pressedActions], cameraMoveFrameId, cameraMoveFrameActive, cameraMoveFramePresent: cameraMoveFrameActive, engineInstanceId });
    if (deltaMsRaw >= 100 && !this.firstLargeFrameGap) this.firstLargeFrameGap = { timestamp: Date.now(), rawDeltaMs: deltaMsRaw, engineInstanceId, pressedActions: [...pressedActions], shellOwners: this.shellOwners.map((owner) => ({ ...owner })) };
  }

  recordLifecycle(event: Omit<InputLifecycleEvent, 'timestamp'>): void { if (this.enabled) this.push(this.lifecycle, { ...event, timestamp: Date.now() }); }

  recordDelete(event: Omit<InputDeleteEvent, 'shellEngineDivergedAtThatMoment'>): void {
    if (!this.enabled) return;
    const snapshot = this.liveEngineSnapshots();
    const shellEngineDivergedAtThatMoment = this.hasActionMismatch(snapshot);
    const record = { ...event, allEnginePressedActions: event.allEnginePressedActions.length ? event.allEnginePressedActions : snapshot.map((engine) => ({ engineInstanceId: engine.engineInstanceId, actions: [...engine.pressedActions] })), shellEngineDivergedAtThatMoment };
    this.push(this.deleteEvents, record);
    if (!this.firstDeleteDuringEngineMovement && !event.shellOwnerCount && snapshot.some((engine) => engine.pressedActions.length && engine.cameraMoveFrameActive)) this.firstDeleteDuringEngineMovement = record;
  }

  check(triggeringEvent: unknown, context?: unknown, forcedType?: InputDivergenceType): void {
    if (!this.enabled || this.firstInputDivergence) return;
    const engines = this.liveEngineSnapshots();
    const shellActions = new Set(this.shellActions);
    const engineActions = new Set(engines.flatMap((engine) => engine.pressedActions));
    let divergenceType: InputDivergenceType | undefined = forcedType;
    if (!divergenceType && [...engineActions].some((action) => !shellActions.has(action))) divergenceType = 'A';
    else if (!divergenceType && [...shellActions].some((action) => !engineActions.has(action))) divergenceType = 'B';
    else if (!divergenceType && !this.shellOwners.length && engines.some((engine) => engine.cameraMoveFrameActive && engine.pressedActions.length)) divergenceType = 'D';
    else if (!divergenceType && this.routes.size && [...this.routes.values()].some((route) => { const engine = route.downEngineInstanceId ? this.engines.get(route.downEngineInstanceId) : undefined; return !!engine?.disposed; })) divergenceType = 'E';
    if (!divergenceType) return;
    this.firstInputDivergence = { divergenceType, timestamp: Date.now(), triggeringEvent: { triggeringEvent, context }, shellOwners: this.shellOwners.map((owner) => ({ ...owner })), shellActions: [...this.shellActions], allLiveEngines: engines, activeMovementRoutes: [...this.routes.values()].map((route) => ({ ...route })), currentMode: this.currentMode, documentVisibilityState: typeof document !== 'undefined' ? document.visibilityState : undefined, documentHasFocus: typeof document !== 'undefined' ? document.hasFocus() : undefined, lifecycle: [...this.lifecycle], frameTiming: { lastFrameGapMs: this.lastFrameGapMs, maxRecentFrameGapMs: this.maxRecentFrameGapMs }, lastDeleteSelection: this.deleteEvents.at(-1) };
  }

  reset(): void {
    this.keyboardEvents.length = 0; this.lifecycle.length = 0; this.movementFrames.length = 0; this.deleteEvents.length = 0;
    this.firstInputDivergence = undefined; this.firstDeleteDuringEngineMovement = undefined; this.firstLargeFrameGap = undefined; this.lastFrameGapMs = undefined; this.maxRecentFrameGapMs = 0; this.eventSequence = 0; this.viewportSequence = 0; this.engineSequence = 0; this.routes.clear();
  }

  snapshot(): InputDiagnosticsSnapshot {
    return { version: 1, capturedAt: new Date().toISOString(), firstInputDivergence: this.firstInputDivergence, firstDeleteDuringEngineMovement: this.firstDeleteDuringEngineMovement, firstLargeFrameGap: this.firstLargeFrameGap, current: { mode: this.currentMode, shellOwners: this.shellOwners, shellActions: this.shellActions, liveViewports: this.viewportSnapshots(), liveEngines: this.liveEngineSnapshots() }, activeMovementRoutes: [...this.routes.values()].map((route) => ({ ...route })), keyboardEvents: [...this.keyboardEvents], lifecycle: [...this.lifecycle], movementFrames: [...this.movementFrames], deleteEvents: [...this.deleteEvents] };
  }

  private liveEngineSnapshots(): InputEngineSnapshot[] { return [...this.engines.values()].filter((engine) => !engine.disposed).map((engine) => this.snapshotEngine(engine)); }
  private snapshotEngine(engine: LiveEngine): InputEngineSnapshot { return { engineInstanceId: engine.engineInstanceId, viewportInstanceId: engine.viewportInstanceId, mode: engine.mode, pressedActions: [...engine.pressedActions], cameraMoveFrameActive: engine.cameraMoveFrameActive, cameraMoveFrameId: engine.cameraMoveFrameId, disposed: engine.disposed, engineDisposed: engine.disposed }; }
  private viewportSnapshots(): InputViewportSnapshot[] {
    return [...this.viewports.values()].filter((viewport) => !viewport.destroyed).map((viewport) => {
      const engine = [...this.engines.values()].find((candidate) => candidate.viewportInstanceId === viewport.viewportInstanceId);
      return { viewportInstanceId: viewport.viewportInstanceId, engineInstanceId: engine?.engineInstanceId, mode: viewport.mode, created: viewport.created, destroyed: viewport.destroyed, engineDisposed: engine?.disposed ?? true, enginePressedActions: engine ? [...engine.pressedActions] : [], cameraMoveFrameActive: engine?.cameraMoveFrameActive ?? false };
    });
  }
  private hasActionMismatch(engines: readonly InputEngineSnapshot[]): boolean { const shell = new Set(this.shellActions); const engine = new Set(engines.flatMap((value) => value.pressedActions)); return [...shell].some((action) => !engine.has(action)) || [...engine].some((action) => !shell.has(action)); }
  private push<T>(ring: T[], value: T): void { ring.push(value); const limit = ring === this.keyboardEvents ? KEYBOARD_RING_LIMIT : ring === this.lifecycle ? LIFECYCLE_RING_LIMIT : ring === this.movementFrames ? FRAME_RING_LIMIT : DELETE_RING_LIMIT; if (ring.length > limit) ring.splice(0, ring.length - limit); }
}

export const inputDiagnostics = new InputDiagnosticsStore();

export function installInputDiagnosticsGlobal(): void {
  if (typeof window === 'undefined') return;
  window.__mbInputReset = () => inputDiagnostics.reset();
  window.__mbInputDiagnostics = () => inputDiagnostics.snapshot();
}

declare global {
  interface Window {
    __mbInputReset?: () => void;
    __mbInputDiagnostics?: () => InputDiagnosticsSnapshot;
  }
}
