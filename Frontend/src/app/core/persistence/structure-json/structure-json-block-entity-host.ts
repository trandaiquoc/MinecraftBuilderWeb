import { blockCapability } from '../../blocks/capabilities/block-capability-resolver';
import type { BlockDefinition } from '../../blocks/catalog/block-definition.types';
import { isSignId } from '../../block-entities/sign/sign-id';

export function isStructureJsonSignHost(id: string, definition?: BlockDefinition): boolean {
  return blockCapability(definition, 'block-entity')?.entityKind === 'sign' || isSignId(id);
}
