/** Shared result and diagnostic helpers for semantic NBT mapping. */

import type { MinecraftStructureDiagnostic } from '../codec/minecraft-structure-contract';

export interface SemanticMappingSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface SemanticMappingFailure {
  readonly ok: false;
  readonly diagnostic: MinecraftStructureDiagnostic;
}

export type SemanticMappingResult<T> = SemanticMappingSuccess<T> | SemanticMappingFailure;

export function failure(
  code: MinecraftStructureDiagnostic['code'],
  message: string,
  path: string,
): SemanticMappingFailure {
  return { ok: false, diagnostic: { code, message, path } };
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasUnknownRaw(raw: unknown): boolean {
  return raw !== undefined && (!isRecord(raw) || Object.keys(raw).length > 0);
}
