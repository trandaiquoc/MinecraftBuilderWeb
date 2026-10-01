import { isValidNamespacedResourceLocation } from '../content/resource-location';
import type { ItemStackData } from './item-stack.types';

export type ItemStackValidationCode = 'invalid-id' | 'invalid-count' | 'exceeds-max-stack-size' | 'unknown-max-stack-size' | 'unsupported-components';
export interface ItemStackValidationResult { readonly valid: boolean; readonly code?: ItemStackValidationCode; readonly maxStackSize?: number; readonly message?: string; }
export type ItemMaxStackResolver = (id: string) => number | undefined;
export interface ItemStackValidationOptions { readonly rejectComponents?: boolean; }

/** Shared Java ItemStack count boundary. Unknown items are safe at one item only. */
export function validateItemStack(stack: ItemStackData | undefined, resolveMaxStackSize: ItemMaxStackResolver = () => undefined, options: ItemStackValidationOptions = {}): ItemStackValidationResult {
  if (!stack || !isValidNamespacedResourceLocation(stack.id)) return { valid: false, code: 'invalid-id', message: 'Item ID must be a namespaced ResourceLocation.' };
  if (!Number.isInteger(stack.count) || stack.count < 1) return { valid: false, code: 'invalid-count', message: 'Item count must be a positive integer.' };
  if (options.rejectComponents && stack.components !== undefined) return { valid: false, code: 'unsupported-components', message: 'Item components are not supported by the current NBT mapper.' };
  const max = resolveMaxStackSize(stack.id);
  if (max === undefined && stack.count > 1) return { valid: false, code: 'unknown-max-stack-size', message: 'Unknown item stack size; only count 1 is allowed.' };
  if (max !== undefined && stack.count > max) return { valid: false, code: 'exceeds-max-stack-size', maxStackSize: max, message: `Item count exceeds the maximum stack size of ${max}.` };
  return { valid: true, ...(max === undefined ? {} : { maxStackSize: max }) };
}

export function itemStackMaxFromComponents(components: Readonly<Record<string, unknown>> | undefined): number | undefined {
  const value = components?.['minecraft:max_stack_size'];
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined;
}
