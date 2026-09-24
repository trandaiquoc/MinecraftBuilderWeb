import type { BlockDefinition } from './block-definition.types';
import type { BlockState } from '../../domain/project.types';

export type BlockStateCompatibilityIssue =
  | { readonly code: 'unknown-state-property'; readonly property: string; readonly value: string }
  | { readonly code: 'unsupported-state-value'; readonly property: string; readonly value: string };

export type MaterializedBlockStateResult =
  | { readonly valid: true; readonly state: BlockState }
  | { readonly valid: false; readonly state: BlockState; readonly issue: BlockStateCompatibilityIssue };

/**
 * Applies partial state overrides using the same compatibility rules as
 * Structure JSON import. Unknown properties are rejected rather than dropped.
 */
export function materializeBlockState(definition: BlockDefinition, overrides: Readonly<Record<string, string>> | undefined): MaterializedBlockStateResult {
  const state: Record<string, string> = { ...definition.defaultState, ...(overrides ?? {}) };
  for (const property of Object.keys(overrides ?? {})) {
    const value = state[property] ?? '';
    const stateDefinition = definition.stateDefinitions.find((entry) => entry.name === property);
    if (!stateDefinition) return { valid: false, state, issue: { code: 'unknown-state-property', property, value } };
    if (!stateDefinition.values.includes(value)) return { valid: false, state, issue: { code: 'unsupported-state-value', property, value } };
  }
  for (const stateDefinition of definition.stateDefinitions) {
    const value = state[stateDefinition.name];
    if (value !== undefined && !stateDefinition.values.includes(value)) return { valid: false, state, issue: { code: 'unsupported-state-value', property: stateDefinition.name, value } };
  }
  return { valid: true, state };
}
