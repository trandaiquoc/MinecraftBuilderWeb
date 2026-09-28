import { Injectable, isDevMode } from '@angular/core';

export interface B5JsonObject { readonly [key: string]: B5JsonValue; }
export type B5JsonValue = string | number | boolean | null | B5JsonValue[] | B5JsonObject;

export interface B5DiagnosticSnapshot {
  readonly version: 'B5';
  readonly sequence: number;
  readonly resetAt: string;
  readonly baseline: B5JsonValue | null;
  readonly context: B5JsonValue | null;
  readonly keyboard: readonly B5JsonObject[];
  readonly lifecycle: readonly B5JsonObject[];
  readonly movementFrames: readonly B5JsonObject[];
  readonly selectedTrace: readonly B5JsonObject[];
  readonly mutations: readonly B5JsonObject[];
  readonly projectMutations: readonly B5JsonObject[];
  readonly commandExecutions: readonly B5JsonObject[];
  readonly pointerLifecycle: readonly B5JsonObject[];
  readonly unattributedProjectMutations: readonly B5JsonObject[];
  readonly firstBlockRemovalIncident: B5JsonObject | null;
  readonly firstSelectionClearAfterReset: B5JsonObject | null;
  readonly lastKeyboardEvent: B5JsonObject | null;
  readonly lastPointerEvent: B5JsonObject | null;
  readonly lastCommand: B5JsonObject | null;
  readonly divergences: readonly B5JsonObject[];
}

/** Silent, bounded runtime evidence for the B5 WASD/selection investigation. */
@Injectable({ providedIn: 'root' })
export class B5RuntimeDiagnosticsService {
  private readonly keyboardEvents: B5JsonObject[] = [];
  private readonly lifecycleEvents: B5JsonObject[] = [];
  private readonly movementFrames: B5JsonObject[] = [];
  private readonly selectedTrace: B5JsonObject[] = [];
  private readonly divergences: B5JsonObject[] = [];
  private readonly mutations: B5JsonObject[] = [];
  private readonly commandExecutions: B5JsonObject[] = [];
  private readonly pointerLifecycle: B5JsonObject[] = [];
  private readonly unattributedProjectMutations: B5JsonObject[] = [];
  private sequence = 0;
  private resetAt = new Date().toISOString();
  private baseline: B5JsonValue | null = null;
  private context: B5JsonValue | null = null;
  private firstBlockRemovalIncident: B5JsonObject | null = null;
  private firstSelectionClearAfterReset: B5JsonObject | null = null;
  private lastKeyboardEvent: B5JsonObject | null = null;
  private lastPointerEvent: B5JsonObject | null = null;
  private lastCommand: B5JsonObject | null = null;
  private lastObservedProjectFingerprint: string | undefined;
  private lastRecordedMutationFingerprint: string | undefined;
  private eventSequence = 0;

  constructor() { activeDiagnostics = this; }

  reset(): B5DiagnosticSnapshot {
    this.keyboardEvents.length = 0;
    this.lifecycleEvents.length = 0;
    this.movementFrames.length = 0;
    this.selectedTrace.length = 0;
    this.divergences.length = 0;
    this.mutations.length = 0;
    this.commandExecutions.length = 0;
    this.pointerLifecycle.length = 0;
    this.unattributedProjectMutations.length = 0;
    this.firstBlockRemovalIncident = null;
    this.firstSelectionClearAfterReset = null;
    this.lastRecordedMutationFingerprint = undefined;
    this.eventSequence = 0;
    this.sequence += 1;
    this.resetAt = new Date().toISOString();
    this.baseline = this.context;
    return this.snapshot();
  }

  setContext(value: unknown): void { this.context = jsonSafe(value); }
  recordKeyboard(value: unknown): void {
    const safe = { ...asRecord(jsonSafe(value)), sequence: ++this.eventSequence };
    this.lastKeyboardEvent = safe;
    this.push(this.keyboardEvents, safe, 200);
    this.recordDivergence(safe);
  }
  recordLifecycle(value: unknown): void { this.push(this.lifecycleEvents, value, 120); }
  recordMovementFrame(value: unknown): void {
    const safe = jsonSafe(value);
    this.push(this.movementFrames, safe, 120);
    const record = safe as B5JsonObject;
    if (record['selectedBlock'] !== undefined) this.push(this.selectedTrace, safe, 120);
    this.recordDivergence(record);
  }
  recordSelected(value: unknown): void { this.push(this.selectedTrace, value, 120); }
  recordMutation(source: string, label: string | undefined, before: unknown, after: unknown, details: { readonly operation?: string; readonly stack?: string; readonly selectionBefore?: unknown; readonly selectionAfter?: unknown } = {}): void {
    if (!isDevMode()) return;
    const beforeProject = projectRecord(before);
    const afterProject = projectRecord(after);
    const beforeEntries = blockEntries(beforeProject);
    const afterEntries = blockEntries(afterProject);
    const beforeKeys = [...beforeEntries.keys()];
    const afterKeys = [...afterEntries.keys()];
    const beforeBlockCount = blockArrayCount(beforeProject);
    const afterBlockCount = blockArrayCount(afterProject);
    const removed = beforeKeys.filter((key) => !afterKeys.includes(key));
    const added = afterKeys.filter((key) => !beforeKeys.includes(key));
    const changed = beforeKeys.filter((key) => afterEntries.has(key) && blockSignature(beforeEntries.get(key)) !== blockSignature(afterEntries.get(key)));
    if (!removed.length && !added.length && !changed.length && beforeBlockCount === afterBlockCount) return;
    const stack = details.stack ?? captureStack();
    const selectionBefore = this.contextValue('selection');
    const record: B5JsonObject = {
      sequence: ++this.eventSequence, timestamp: new Date().toISOString(), source,
      ...(details.operation ? { operation: details.operation } : {}),
      ...(label ? { historyLabel: label } : {}),
      projectIdBefore: projectId(beforeProject), projectIdAfter: projectId(afterProject),
      beforeBlockCount, afterBlockCount,
      removedKeys: removed.slice(0, 256), addedKeys: added.slice(0, 256), removedCoordinates: removed.slice(0, 256), addedCoordinates: added.slice(0, 256), changedCoordinates: changed.slice(0, 256),
      removedBlocks: removed.slice(0, 128).map((key) => blockDiagnostic(beforeEntries.get(key))),
      addedBlocks: added.slice(0, 128).map((key) => blockDiagnostic(afterEntries.get(key))),
      changedBlocks: changed.slice(0, 128).map((key) => ({ before: blockDiagnostic(beforeEntries.get(key)), after: blockDiagnostic(afterEntries.get(key)) })),
      stack,
      selectionBefore,
      ...(details.selectionBefore !== undefined ? { selectionBefore: jsonSafe(details.selectionBefore) } : {}),
      ...(details.selectionAfter !== undefined ? { selectionAfter: jsonSafe(details.selectionAfter) } : {}),
      context: this.context,
    };
    this.lastRecordedMutationFingerprint = `${projectFingerprint(beforeProject)}>${projectFingerprint(afterProject)}`;
    this.push(this.mutations, record, 120);
    if (afterBlockCount < beforeBlockCount && !this.firstBlockRemovalIncident) {
      this.firstBlockRemovalIncident = {
        sequence: ++this.eventSequence, timestamp: record['timestamp'] ?? new Date().toISOString(), mutation: record, selectionBefore, selectionAfter: null,
        projectCounts: { before: beforeBlockCount, after: afterBlockCount, current: afterBlockCount },
        selection: this.contextValue('selection'), history: this.contextValue('history'), input: this.contextValue('viewport'),
        lastKeyboardEvent: this.lastKeyboardEvent, lastPointerEvent: this.lastPointerEvent, lastCommand: this.lastCommand,
      };
    }
  }

  recordCommand(value: unknown): void {
    const safe = asRecord(jsonSafe(value));
    const operation = `${safe['operation'] ?? ''} ${safe['action'] ?? ''} ${safe['label'] ?? ''}`.toLowerCase();
    const record = { ...safe, sequence: ++this.eventSequence, ...(safe['stack'] === undefined && /(delete|undo|redo|place|move|edit|import)/.test(operation) ? { stack: captureStack() } : {}) };
    this.lastCommand = record; this.push(this.commandExecutions, record, 120);
  }
  recordPointerLifecycle(value: unknown): void { const safe = { ...asRecord(jsonSafe(value)), sequence: ++this.eventSequence }; this.lastPointerEvent = safe; this.push(this.pointerLifecycle, safe, 240); }
  recordSelectionClear(source: string, before: unknown, after?: unknown): void {
    const record: B5JsonObject = { sequence: ++this.eventSequence, timestamp: new Date().toISOString(), source, before: jsonSafe(before), ...(after === undefined ? {} : { after: jsonSafe(after) }), stack: captureStack(), context: this.context, lastKeyboardEvent: this.lastKeyboardEvent, lastPointerEvent: this.lastPointerEvent, lastCommand: this.lastCommand };
    this.push(this.selectedTrace, { type: 'selection.clear', ...record }, 120);
    if (!this.firstSelectionClearAfterReset) this.firstSelectionClearAfterReset = record;
    if (this.firstBlockRemovalIncident && this.firstBlockRemovalIncident['selectionAfter'] === null) this.firstBlockRemovalIncident = { ...this.firstBlockRemovalIncident, selectionAfter: record['after'] ?? null, selectionClear: record };
  }
  observeProject(value: unknown, source = 'project.signal'): void {
    const fingerprint = projectFingerprint(value);
    if (this.lastObservedProjectFingerprint === undefined) { this.lastObservedProjectFingerprint = fingerprint; return; }
    if (fingerprint === this.lastObservedProjectFingerprint) return;
    const previous = this.lastObservedProjectFingerprint;
    this.lastObservedProjectFingerprint = fingerprint;
    if (blockCountFromFingerprint(fingerprint) < blockCountFromFingerprint(previous) && `${previous}>${fingerprint}` !== this.lastRecordedMutationFingerprint) {
      const beforeKeys = fingerprintKeys(previous); const afterKeys = fingerprintKeys(fingerprint); const removedKeys = beforeKeys.filter((key) => !afterKeys.includes(key)); const addedKeys = afterKeys.filter((key) => !beforeKeys.includes(key));
      const record: B5JsonObject = { sequence: ++this.eventSequence, timestamp: new Date().toISOString(), source: 'unattributed.project.signal', operation: source, beforeBlockCount: blockCountFromFingerprint(previous), afterBlockCount: blockCountFromFingerprint(fingerprint), removedKeys, addedKeys, beforeFingerprint: previous, afterFingerprint: fingerprint, stack: captureStack(), context: this.context, lastKeyboardEvent: this.lastKeyboardEvent, lastPointerEvent: this.lastPointerEvent, lastCommand: this.lastCommand };
      this.push(this.unattributedProjectMutations, record, 120);
      if (!this.firstBlockRemovalIncident) this.firstBlockRemovalIncident = { sequence: ++this.eventSequence, timestamp: record['timestamp'], mutation: record, selectionBefore: this.contextValue('selection'), selectionAfter: null, projectCounts: { before: record['beforeBlockCount'], after: record['afterBlockCount'], current: record['afterBlockCount'] }, selection: this.contextValue('selection'), history: this.contextValue('history'), input: this.contextValue('viewport'), lastKeyboardEvent: this.lastKeyboardEvent, lastPointerEvent: this.lastPointerEvent, lastCommand: this.lastCommand };
    }
  }

  snapshot(): B5DiagnosticSnapshot {
    return {
      version: 'B5', sequence: this.sequence, resetAt: this.resetAt,
      baseline: this.baseline, context: this.context,
      keyboard: this.keyboardEvents.map((entry) => ({ ...entry })),
      lifecycle: this.lifecycleEvents.map((entry) => ({ ...entry })),
      movementFrames: this.movementFrames.map((entry) => ({ ...entry })),
      selectedTrace: this.selectedTrace.map((entry) => ({ ...entry })),
      mutations: this.mutations.map((entry) => ({ ...entry })),
      projectMutations: this.mutations.map((entry) => ({ ...entry })),
      commandExecutions: this.commandExecutions.map((entry) => ({ ...entry })),
      pointerLifecycle: this.pointerLifecycle.map((entry) => ({ ...entry })),
      unattributedProjectMutations: this.unattributedProjectMutations.map((entry) => ({ ...entry })),
      firstBlockRemovalIncident: this.firstBlockRemovalIncident ? { ...this.firstBlockRemovalIncident } : null,
      firstSelectionClearAfterReset: this.firstSelectionClearAfterReset ? { ...this.firstSelectionClearAfterReset } : null,
      lastKeyboardEvent: this.lastKeyboardEvent ? { ...this.lastKeyboardEvent } : null,
      lastPointerEvent: this.lastPointerEvent ? { ...this.lastPointerEvent } : null,
      lastCommand: this.lastCommand ? { ...this.lastCommand } : null,
      divergences: this.divergences.map((entry) => ({ ...entry })),
    };
  }

  private recordDivergence(value: unknown): void {
    const record = jsonSafe(value);
    if (!isObject(record)) return;
    const before = record['before'];
    const after = record['after'];
    if (!isObject(before) || !isObject(after)) return;
    const shellBefore = stringArray(before['shellActions']);
    const shellAfter = stringArray(after['shellActions']);
    const engineBefore = stringArray(before['engineActions']);
    const engineAfter = stringArray(after['engineActions']);
    const beforeMismatch = mismatch(shellBefore, engineBefore);
    const afterMismatch = mismatch(shellAfter, engineAfter);
    if (!beforeMismatch && !afterMismatch) return;
    this.push(this.divergences, { timestamp: record['timestamp'] ?? new Date().toISOString(), beforeMismatch, afterMismatch, before, after }, 120);
  }

  private push(target: B5JsonObject[], value: unknown, limit: number): void {
    target.push(isObject(jsonSafe(value)) ? jsonSafe(value) as B5JsonObject : { value: jsonSafe(value) });
    while (target.length > limit) target.shift();
  }
  private contextValue(key: string): B5JsonValue | null { return isObject(this.context) ? this.context[key] ?? null : null; }
}

let activeDiagnostics: B5RuntimeDiagnosticsService | undefined;
export function recordB5Mutation(source: string, label: string | undefined, before: unknown, after: unknown, details?: { readonly operation?: string; readonly stack?: string; readonly selectionBefore?: unknown; readonly selectionAfter?: unknown }): void { activeDiagnostics?.recordMutation(source, label, before, after, details); }
export function recordB5Command(value: unknown): void { activeDiagnostics?.recordCommand(value); }
export function recordB5Pointer(value: unknown): void { activeDiagnostics?.recordPointerLifecycle(value); }
export function recordB5SelectionClear(source: string, before: unknown, after?: unknown): void { activeDiagnostics?.recordSelectionClear(source, before, after); }

export function jsonSafe(value: unknown, seen = new WeakSet<object>()): B5JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => jsonSafe(entry, seen));
  const result: Record<string, B5JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function' || typeof entry === 'symbol') continue;
    result[key] = jsonSafe(entry, seen);
  }
  return result;
}

function isObject(value: B5JsonValue): value is B5JsonObject { return !!value && typeof value === 'object' && !Array.isArray(value); }
function stringArray(value: B5JsonValue | undefined): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').sort() : []; }
function mismatch(left: readonly string[], right: readonly string[]): B5JsonObject | null {
  const missingFromEngine = left.filter((action) => !right.includes(action));
  const missingFromShell = right.filter((action) => !left.includes(action));
  return missingFromEngine.length || missingFromShell.length ? { shellOnly: missingFromEngine, engineOnly: missingFromShell } : null;
}
function projectRecord(value: unknown): B5JsonObject { const safe = jsonSafe(value); return isObject(safe) ? safe : {}; }
function projectId(value: B5JsonObject): B5JsonValue | null { return value['id'] ?? null; }
function blockArrayCount(value: B5JsonObject): number { return Array.isArray(value['blocks']) ? value['blocks'].length : 0; }
function blockEntries(value: B5JsonObject): Map<string, B5JsonObject> {
  const blocks = value['blocks']; const entries = new Map<string, B5JsonObject>();
  if (!Array.isArray(blocks)) return entries;
  for (const block of blocks) { if (!isObject(block) || !isObject(block['position'])) continue; const position = block['position']; const x = position['x']; const y = position['y']; const z = position['z']; if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') entries.set(`${x},${y},${z}`, block); }
  return entries;
}
function blockDiagnostic(block: B5JsonObject | undefined): B5JsonValue { if (!block) return null; return { coordinate: block['position'] ?? null, id: block['id'] ?? null, kind: block['kind'] ?? null, position: block['position'] ?? null, state: block['state'] ?? null, groupIds: block['groupIds'] ?? (block['groupId'] === undefined ? null : [block['groupId']]) }; }
function blockSignature(block: B5JsonObject | undefined): string { return JSON.stringify(blockDiagnostic(block)); }
function projectFingerprint(value: unknown): string { const entries = blockEntries(projectRecord(value)); return JSON.stringify([...entries.entries()].map(([key, block]) => [key, blockSignature(block)])); }
function blockCountFromFingerprint(value: string): number { try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.length : 0; } catch { return 0; } }
function fingerprintKeys(value: string): string[] { try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.flatMap((entry) => Array.isArray(entry) && typeof entry[0] === 'string' ? [entry[0]] : []) : []; } catch { return []; } }
function captureStack(): string { return new Error().stack?.split('\n').slice(2, 22).join('\n') ?? ''; }
function asRecord(value: B5JsonValue): B5JsonObject { return isObject(value) ? value : { value }; }

declare global {
  interface Window {
    __mbB5Diagnostics?: () => B5DiagnosticSnapshot;
    __mbB5Reset?: () => B5DiagnosticSnapshot;
  }
}

