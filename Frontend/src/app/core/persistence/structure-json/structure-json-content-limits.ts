import { normalizeExternalAiContentLimits } from './external-ai-content-limits';
import type { StructureJsonValidationOptions, NormalizedValidationContentLimits } from './structure-json-validation.types';

export function normalizeValidationContentLimits(options?: StructureJsonValidationOptions): NormalizedValidationContentLimits {
  const normalized = normalizeExternalAiContentLimits(options?.contentLimits, options?.placeableItems);
  return { enabled: options?.contentLimitsEnabled === true, blocks: new Set(normalized.blocks), items: new Set(normalized.items), decorations: new Set(normalized.decorations) };
}
