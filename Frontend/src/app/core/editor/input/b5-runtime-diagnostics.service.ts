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
  private sequence = 0;
  private resetAt = new Date().toISOString();
  private baseline: B5JsonValue | null = null;
  private context: B5JsonValue | null = null;

  constructor() { activeDiagnostics = this; }

  reset(): B5DiagnosticSnapshot {
    this.keyboardEvents.length = 0;
    this.lifecycleEvents.length = 0;
    this.movementFrames.length = 0;
    this.selectedTrace.length = 0;
    this.divergences.length = 0;
    this.mutations.length = 0;
    this.sequence += 1;
    this.resetAt = new Date().toISOString();
    this.baseline = this.context;
    return this.snapshot();
  }

  setContext(value: unknown): void { this.context = jsonSafe(value); }
  recordKeyboard(value: unknown): void { this.push(this.keyboardEvents, value, 200); this.recordDivergence(value); }
  recordLifecycle(value: unknown): void { this.push(this.lifecycleEvents, value, 120); }
  recordMovementFrame(value: unknown): void {
    const safe = jsonSafe(value);
    this.push(this.movementFrames, safe, 120);
    const record = safe as B5JsonObject;
    if (record['selectedBlock'] !== undefined) this.push(this.selectedTrace, safe, 120);
    this.recordDivergence(record);
  }
  recordSelected(value: unknown): void { this.push(this.selectedTrace, value, 120); }
  recordMutation(source: string, label: string | undefined, before: unknown, after: unknown): void {
    if (!isDevMode()) return;
    const beforeKeys = blockKeys(before);
    const afterKeys = blockKeys(after);
    const removed = beforeKeys.filter((key) => !afterKeys.includes(key));
    const added = afterKeys.filter((key) => !beforeKeys.includes(key));
    if (!removed.length && !added.length) return;
    this.push(this.mutations, { timestamp: new Date().toISOString(), source, ...(label ? { label } : {}), beforeBlockCount: beforeKeys.length, afterBlockCount: afterKeys.length, removedCoordinates: removed.slice(0, 256), addedCoordinates: added.slice(0, 256) }, 120);
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
}

let activeDiagnostics: B5RuntimeDiagnosticsService | undefined;
export function recordB5Mutation(source: string, label: string | undefined, before: unknown, after: unknown): void { activeDiagnostics?.recordMutation(source, label, before, after); }

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
function blockKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { blocks?: unknown }).blocks)) return [];
  return ((value as { blocks: readonly unknown[] }).blocks).flatMap((block) => {
    if (!block || typeof block !== 'object') return [];
    const position = (block as { position?: unknown }).position;
    if (!position || typeof position !== 'object') return [];
    const { x, y, z } = position as { x?: unknown; y?: unknown; z?: unknown };
    return [typeof x === 'number' && typeof y === 'number' && typeof z === 'number' ? `${x},${y},${z}` : ''].filter(Boolean);
  });
}

declare global {
  interface Window {
    __mbB5Diagnostics?: () => B5DiagnosticSnapshot;
    __mbB5Reset?: () => B5DiagnosticSnapshot;
  }
}

