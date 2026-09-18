import { describe, expect, it } from 'vitest';
import { HANGING_SIGN_TEXT_METRICS, NORMAL_SIGN_TEXT_METRICS, signTextMetrics } from './sign-text-metrics';

describe('sign text metrics', () => {
  it('uses the verified normal and hanging sign width/line-height configuration', () => {
    expect(NORMAL_SIGN_TEXT_METRICS).toEqual({ maxWidth: 90, lineHeight: 10 });
    expect(HANGING_SIGN_TEXT_METRICS).toEqual({ maxWidth: 60, lineHeight: 9 });
    expect(signTextMetrics('minecraft:oak_wall_hanging_sign')).toBe(HANGING_SIGN_TEXT_METRICS);
    expect(signTextMetrics('minecraft:oak_wall_sign')).toBe(NORMAL_SIGN_TEXT_METRICS);
  });
});
