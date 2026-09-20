/**
 * Isolated fallback metrics for the Minecraft sign editor. They are intentionally
 * conservative until a Java font-atlas metric provider is imported.
 */
export interface SignTextMetrics {
  readonly maxWidth: number;
  readonly lineHeight: number;
}

export const NORMAL_SIGN_TEXT_METRICS: SignTextMetrics = { maxWidth: 90, lineHeight: 10 };
export const HANGING_SIGN_TEXT_METRICS: SignTextMetrics = { maxWidth: 60, lineHeight: 9 };

export function signTextMetrics(blockId: string): SignTextMetrics {
  return blockId.endsWith('_hanging_sign') ? HANGING_SIGN_TEXT_METRICS : NORMAL_SIGN_TEXT_METRICS;
}

export function fallbackMinecraftTextWidth(value: string): number {
  return [...value].reduce((width, character) => width + (character === ' ' ? 3 : /[ilI.,'|]/.test(character) ? 3 : /[MW@#%]/.test(character) ? 9 : 7), 0);
}
