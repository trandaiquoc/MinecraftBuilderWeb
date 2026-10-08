import type { PlacedDecoration } from '../../decorations/decoration.types';
import { stableValueKey } from '../../domain/stable-value-key';

export function decorationRenderSignature(decoration: PlacedDecoration | undefined): string {
  return decoration === undefined ? '' : stableValueKey(decoration);
}
