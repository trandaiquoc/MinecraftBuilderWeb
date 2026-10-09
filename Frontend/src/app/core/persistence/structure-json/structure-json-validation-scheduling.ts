import { CooperativeWorkBudget, yieldToBrowser } from '../../assets/cooperative-yield';
import type { StructureJsonValidationCancellation } from './structure-json-validation.types';

export function isStructureJsonValidationCancelled(cancellation?: StructureJsonValidationCancellation): boolean {
  return Boolean(cancellation?.signal?.aborted || cancellation?.isCancelled?.());
}

export function cooperativeValidationCheckpoint(budget: CooperativeWorkBudget, _processed: number, cancellation?: StructureJsonValidationCancellation): boolean | Promise<boolean> {
  if (isStructureJsonValidationCancelled(cancellation)) return true;
  if (!budget.shouldYieldNow()) return false;
  budget.reset();
  return yieldToBrowser().then(() => isStructureJsonValidationCancelled(cancellation));
}
